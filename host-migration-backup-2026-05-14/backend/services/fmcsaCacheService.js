import { query } from "../config/db.js";

const DEFAULT_TTL_HOURS = Number(process.env.FMCSA_CACHE_TTL_HOURS || 24);

function toExpiresAt(ttlHours = DEFAULT_TTL_HOURS) {
  const date = new Date();
  date.setHours(date.getHours() + ttlHours);
  return date;
}

function isMissingCacheTableError(err) {
  return err?.code === "42P01" || /fmcsa_cache/i.test(err?.message || "");
}

export function buildCacheKey(source, identifier) {
  return `${String(source || "unknown").toLowerCase()}:${String(identifier || "").toLowerCase()}`;
}

export async function getCachedFmcsaPayload(cacheKey) {
  try {
    const result = await query(
      `SELECT payload
       FROM fmcsa_cache
       WHERE cache_key = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [cacheKey]
    );

    return result.rows[0]?.payload || null;
  } catch (err) {
    if (!isMissingCacheTableError(err)) {
      console.warn("FMCSA cache read skipped:", err.message);
    }
    return null;
  }
}

export async function setCachedFmcsaPayload({
  cacheKey,
  source,
  dotNumber = null,
  payload,
  ttlHours = DEFAULT_TTL_HOURS
}) {
  if (!cacheKey || payload === undefined || payload === null) return;

  try {
    await query(
      `INSERT INTO fmcsa_cache (cache_key, source, dot_number, payload, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (cache_key)
       DO UPDATE SET
         source = EXCLUDED.source,
         dot_number = EXCLUDED.dot_number,
         payload = EXCLUDED.payload,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [cacheKey, source, dotNumber, payload, toExpiresAt(ttlHours)]
    );
  } catch (err) {
    if (!isMissingCacheTableError(err)) {
      console.warn("FMCSA cache write skipped:", err.message);
    }
  }
}

export async function withFmcsaCache({ source, identifier, dotNumber, ttlHours }, fetcher) {
  const cacheKey = buildCacheKey(source, identifier);
  const cached = await getCachedFmcsaPayload(cacheKey);
  if (cached) return cached;

  const payload = await fetcher();
  if (payload) {
    await setCachedFmcsaPayload({
      cacheKey,
      source,
      dotNumber,
      payload,
      ttlHours
    });
  }

  return payload;
}
