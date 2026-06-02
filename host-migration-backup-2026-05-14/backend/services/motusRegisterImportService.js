import { inflateSync } from "zlib";
import { requestWithRetry } from "./safeScrapingService.js";
import { upsertCarrierBatch } from "./carrierImportService.js";

const MOTUS_REPORT_URL = "https://motus.dot.gov/api/report/getSignedUrlByTypeAndDateRange";
const TABLE_COLUMN_RANGES = [
  [49, 107],
  [107, 196],
  [196, 262],
  [262, 401],
  [401, 490],
  [490, 567]
];
const TABLE_ROW_HEIGHT = 21;

export function isoDate(value) {
  const text = String(value || "").trim();
  const usDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = usDate ? `${usDate[3]}-${usDate[1]}-${usDate[2]}` : text.slice(0, 10);
  const date = normalized ? new Date(`${normalized}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Motus register date: ${value}`);
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function decodeHexText(value) {
  return Buffer.from(value, "hex").toString("latin1");
}

function textItemsFromPdf(pdfBuffer) {
  const pdfText = Buffer.from(pdfBuffer).toString("latin1");
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const itemsByPage = [];
  let match;

  while ((match = streamPattern.exec(pdfText)) !== null) {
    let stream;
    try {
      stream = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }

    const items = [];
    const blockPattern = /BT\s*([\s\S]*?)\s*ET/g;
    let blockMatch;

    while ((blockMatch = blockPattern.exec(stream)) !== null) {
      const position = blockMatch[1].match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
      const chunks = [...blockMatch[1].matchAll(/<([0-9A-Fa-f]+)>/g)];
      if (!position || chunks.length === 0) continue;

      items.push({
        x: Number(position[1]),
        y: Number(position[2]),
        text: chunks.map(chunk => decodeHexText(chunk[1])).join("")
      });
    }

    if (items.some(item => item.text.includes("USDOT Number"))) {
      itemsByPage.push(items);
    }
  }

  return itemsByPage;
}

function joinCell(items, rowY, [fromX, toX]) {
  return items
    .filter(item => item.x >= fromX && item.x < toX && item.y >= rowY - TABLE_ROW_HEIGHT && item.y <= rowY + 0.1)
    .filter(item => item.text.trim())
    .sort((left, right) => right.y - left.y || left.x - right.x)
    .map(item => item.text.trim())
    .join(" ")
    .trim();
}

export function parseMotusRegisterPdf(pdfBuffer) {
  const rows = [];

  for (const items of textItemsFromPdf(pdfBuffer)) {
    const rowStarts = items
      .filter(item => item.x >= 49 && item.x <= 51 && /^\d+[A-Z]?$/.test(item.text.trim()))
      .sort((left, right) => right.y - left.y);

    for (const rowStart of rowStarts) {
      const cells = TABLE_COLUMN_RANGES.map(range => joinCell(items, rowStart.y, range));
      rows.push({
        dotNumber: cells[0],
        legalName: cells[1],
        filingDate: cells[2],
        mailingAddress: cells[3],
        companyOfficer: cells[4],
        phoneNumber: cells[5]
      });
    }
  }

  return rows;
}

function parseMailingAddress(rawAddress) {
  const raw = String(rawAddress || "").trim();
  const match = raw.match(/^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*(?:US)?$/);

  if (!match) {
    return { street: "", city: "", state: "", zip: "", raw };
  }

  return {
    street: match[1].trim(),
    city: match[2].trim(),
    state: match[3],
    zip: match[4],
    raw
  };
}

function mapMotusRowToCarrier(row, publicationDate) {
  const filingDate = new Date(`${isoDate(row.filingDate)}T00:00:00.000Z`);

  return {
    dotNumber: row.dotNumber,
    legalName: row.legalName,
    address: parseMailingAddress(row.mailingAddress),
    phoneNumber: row.phoneNumber,
    companyOfficer1: row.companyOfficer,
    dateCreated: filingDate,
    source: "FMCSA Motus Daily Register",
    sourceLastSeenAt: new Date(`${isoDate(publicationDate)}T00:00:00.000Z`),
    raw: {
      motusRegister: {
        ...row,
        publicationDate: isoDate(publicationDate)
      }
    }
  };
}

async function fetchMotusRegisterPublications(from, to) {
  const response = await requestWithRetry(
    {
      method: "GET",
      url: `${MOTUS_REPORT_URL}/REGISTER/${isoDate(from)}/${isoDate(to)}`,
      headers: { Accept: "application/json" },
      timeout: Number(process.env.FMCSA_REQUEST_TIMEOUT_MS || 30000)
    },
    {
      label: `Motus register publications ${from} to ${to}`,
      throttleMs: Number(process.env.MOTUS_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 500)
    }
  );

  return Array.isArray(response.data?.Register) ? response.data.Register : [];
}

async function fetchMotusRegisterPdf(publication) {
  const response = await requestWithRetry(
    {
      method: "GET",
      url: publication.url,
      responseType: "arraybuffer",
      timeout: Number(process.env.FMCSA_REQUEST_TIMEOUT_MS || 30000)
    },
    {
      label: `Motus Daily Register PDF ${publication.date}`,
      throttleMs: Number(process.env.MOTUS_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 500)
    }
  );

  return Buffer.from(response.data);
}

function uniqueCarriers(rows, publicationDate) {
  const carriersByDot = new Map();

  for (const row of rows) {
    const carrier = mapMotusRowToCarrier(row, publicationDate);
    const existing = carriersByDot.get(carrier.dotNumber);
    if (!existing || carrier.dateCreated < existing.dateCreated) {
      carriersByDot.set(carrier.dotNumber, carrier);
    }
  }

  return [...carriersByDot.values()];
}

export async function importCarriersFromMotusRegister(options = {}) {
  const to = isoDate(options.to);
  const from = isoDate(options.from || addDays(to, -Number(process.env.MOTUS_DAILY_LOOKBACK_DAYS || 7)));
  const recordHistory = options.recordHistory ?? process.env.CARRIER_HISTORY_ENABLED !== "false";
  const stats = {
    source: "FMCSA Motus Daily Register",
    startedAt: new Date(),
    from,
    to,
    publications: 0,
    read: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    changes: 0,
    errors: 0
  };

  for (let chunkFrom = from; chunkFrom <= to; chunkFrom = addDays(chunkFrom, 9)) {
    const chunkTo = addDays(chunkFrom, 8) < to ? addDays(chunkFrom, 8) : to;
    const publications = await fetchMotusRegisterPublications(chunkFrom, chunkTo);

    for (const publication of publications) {
      try {
        const rows = parseMotusRegisterPdf(await fetchMotusRegisterPdf(publication));
        const result = await upsertCarrierBatch(uniqueCarriers(rows, publication.date), { recordHistory });

        stats.publications += 1;
        stats.read += rows.length;
        stats.inserted += result.inserted;
        stats.updated += result.updated;
        stats.unchanged += result.unchanged;
        stats.changes += result.changes;
        console.log(`[MotusRegister] date=${publication.date} rows=${rows.length} inserted=${result.inserted} updated=${result.updated}`);
      } catch (err) {
        stats.errors += 1;
        console.error(`[MotusRegister] publication ${publication.date} failed:`, err.message);
        throw err;
      }
    }
  }

  stats.finishedAt = new Date();
  return stats;
}
