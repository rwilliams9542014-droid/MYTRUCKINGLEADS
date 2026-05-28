function clean(value, fallback = "Not available") {
  if (value === 0) return "0";
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "").trim();
  return text || fallback;
}

function numberValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).replace(/[,%]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function cargoText(carrier = {}) {
  return clean(carrier.cargoHauled || carrier.cargo || carrier.cargoTypes || carrier.cargoCarried);
}

function renewalText(carrier = {}) {
  if (carrier.renewalDisplay?.date) return carrier.renewalDisplay.date;
  return clean(carrier.renewalDate || carrier.insuranceExpiration || carrier.insuranceExpirationDate);
}

function carrierName(carrier = {}) {
  return clean(carrier.carrierName || carrier.name || carrier.legalName, "this carrier");
}

function summarizeCarrier(carrier = {}) {
  const trucks = numberValue(carrier.powerUnits || carrier.trucks || carrier.fleetSize);
  const drivers = numberValue(carrier.drivers || carrier.driverCount);
  const vehicleOos = clean(carrier.vehicleOosRate || carrier.oosRates?.vehicle?.carrier, "");
  const driverOos = clean(carrier.driverOosRate || carrier.oosRates?.driver?.carrier, "");
  const basics = carrier.basicScores || carrier.basicCategories || {};
  const elevatedBasics = Object.entries(basics)
    .filter(([, value]) => {
      const score = numberValue(value?.measure ?? value?.score ?? value);
      return score !== null && score >= 65;
    })
    .map(([key]) => key);

  return {
    name: carrierName(carrier),
    dot: clean(carrier.dotNumber || carrier.dot || carrier.usdot),
    mc: clean(carrier.mcNumber || carrier.mc),
    state: clean(carrier.state),
    status: clean(carrier.operatingStatus || carrier.authorityStatus),
    safetyRating: clean(carrier.safetyRating),
    trucks: trucks === null ? "Not available" : trucks.toLocaleString(),
    drivers: drivers === null ? "Not available" : drivers.toLocaleString(),
    cargo: cargoText(carrier),
    renewal: renewalText(carrier),
    insuranceCompany: clean(carrier.insuranceCompany),
    vehicleOos,
    driverOos,
    elevatedBasics,
  };
}

function hasCarrier(carrier) {
  return Boolean(carrier && Object.keys(carrier).length);
}

function carrierProfileAnswer(prompt, carrier) {
  const summary = summarizeCarrier(carrier);
  const promptText = String(prompt || "").toLowerCase();

  if (promptText.includes("draft") || promptText.includes("follow-up")) {
    return {
      title: `Follow-up draft for ${summary.name}`,
      body: [
        `Subject: Quick trucking coverage question`,
        ``,
        `Hello ${summary.name},`,
        ``,
        `I was reviewing DOT #${summary.dot} and wanted to see if you would like help reviewing commercial trucking coverage options.`,
        `Your public profile shows ${summary.trucks} power unit(s), ${summary.drivers} driver(s), and cargo listed as ${summary.cargo}.`,
        summary.renewal !== "Not available"
          ? `I also noticed the insurance timing may be worth reviewing around ${summary.renewal}.`
          : `If your current coverage is changing or coming up for review, I can help compare options.`,
        ``,
        `If you would like a quote, reply with the best contact person and I can let you know what information is needed.`,
      ].join("\n"),
    };
  }

  if (promptText.includes("safety")) {
    const safetyLines = [
      `Safety rating: ${summary.safetyRating}`,
      summary.vehicleOos ? `Vehicle OOS rate: ${summary.vehicleOos}` : "",
      summary.driverOos ? `Driver OOS rate: ${summary.driverOos}` : "",
      summary.elevatedBasics.length ? `BASIC areas to review: ${summary.elevatedBasics.join(", ")}` : "No elevated BASIC score stood out from the loaded profile.",
    ].filter(Boolean);

    return {
      title: `Safety read on ${summary.name}`,
      body: [
        safetyLines.join("\n"),
        ``,
        `Before contacting or quoting, look for accident history, out-of-service patterns, and whether vehicle maintenance or unsafe driving signals may create underwriting friction.`,
      ].join("\n"),
    };
  }

  if (promptText.includes("insurance filing")) {
    return {
      title: `Insurance filing notes for ${summary.name}`,
      body: [
        `Current insurance signal: ${summary.insuranceCompany}`,
        `Renewal / filing date: ${summary.renewal}`,
        `Cargo: ${summary.cargo}`,
        ``,
        `Use this as a timing cue, not a guarantee. Confirm current carrier, expiration date, filings, vehicles, drivers, loss runs, and cargo before building a quote strategy.`,
      ].join("\n"),
    };
  }

  if (promptText.includes("look for") || promptText.includes("contacting")) {
    return {
      title: `Before contacting ${summary.name}`,
      body: [
        `1. Confirm authority and operating status: ${summary.status}.`,
        `2. Check fleet size: ${summary.trucks} power unit(s) and ${summary.drivers} driver(s).`,
        `3. Lead with cargo fit: ${summary.cargo}.`,
        `4. Use renewal timing if available: ${summary.renewal}.`,
        `5. Ask for driver list, vehicle list, current declarations, loss runs, and cargo details before quoting.`,
      ].join("\n"),
    };
  }

  return {
    title: `Carrier brief for ${summary.name}`,
    body: [
      `${summary.name} is showing DOT #${summary.dot}${summary.mc !== "Not available" ? ` and ${summary.mc}` : ""}.`,
      `Status: ${summary.status}`,
      `State: ${summary.state}`,
      `Fleet: ${summary.trucks} power unit(s), ${summary.drivers} driver(s)`,
      `Cargo: ${summary.cargo}`,
      `Renewal / filing timing: ${summary.renewal}`,
      ``,
      `Best next step: verify the decision maker, confirm current coverage, and use the fleet/cargo mix to open a consultative conversation instead of a generic price pitch.`,
    ].join("\n"),
  };
}

function generalAnswer(prompt, pathname = "") {
  const promptText = String(prompt || "").toLowerCase();
  const pageContext = pathname.includes("lead-desk")
    ? "Lead Desk"
    : pathname.includes("crm")
      ? "CRM"
      : pathname.includes("dashboard")
        ? "Dashboard"
        : pathname.includes("carrier-search")
          ? "Carrier Search"
          : "this page";

  if (promptText.includes("draft") || promptText.includes("follow-up")) {
    return {
      title: "General follow-up draft",
      body: [
        "Subject: Quick trucking coverage question",
        "",
        "Hello,",
        "",
        "I wanted to see if you would like help reviewing options for your commercial trucking coverage.",
        "If you are open to a quote, I can let you know what information is needed and help compare available options.",
        "",
        "Thank you,",
      ].join("\n"),
    };
  }

  if (promptText.includes("safety")) {
    return {
      title: "Safety score guidance",
      body: "Review safety rating, vehicle OOS, driver OOS, crash history, and BASIC categories together. Any elevated score is a discovery topic for underwriting, not an automatic disqualifier.",
    };
  }

  if (promptText.includes("insurance filing")) {
    return {
      title: "Insurance filing guidance",
      body: "Insurance filing dates can help identify timing, but you should still confirm the current policy, declarations page, cargo limits, vehicle schedule, driver list, and loss runs before quoting.",
    };
  }

  return {
    title: `Scout guidance for ${pageContext}`,
    body: "Open a carrier profile for the most specific Scout read. I can summarize the carrier, explain safety signals, identify outreach angles, and draft a follow-up from the loaded carrier details.",
  };
}

export function buildScoutAnswer(prompt, { carrier, pathname } = {}) {
  if (hasCarrier(carrier)) return carrierProfileAnswer(prompt, carrier);
  return generalAnswer(prompt, pathname);
}
