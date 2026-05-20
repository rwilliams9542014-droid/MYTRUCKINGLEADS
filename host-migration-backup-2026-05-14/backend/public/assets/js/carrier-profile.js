import { createLead, searchCarrier } from "./api.js";

let selectedCarrier = null;

function valueOrDash(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = valueOrDash(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmailAddress(value) {
  const email = String(value || "").trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ? email : "";
}

function setEmailLink(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  const email = normalizeEmailAddress(value);
  if (!email) {
    element.textContent = valueOrDash(value);
    return;
  }

  element.innerHTML = `<a class="email-link" href="mailto:${escapeHtml(email)}" title="Send email to ${escapeHtml(email)}">${escapeHtml(email)}</a>`;
}

function setNotice(message, type = "info") {
  const notice = document.getElementById("profileNotice");
  if (!notice) return;
  notice.className = `alert alert-${type} mb-4`;
  notice.textContent = message;
}

function formatOos(rate) {
  if (!rate) return "-";
  const carrier = rate.carrier ?? rate.value ?? rate;
  const national = rate.nationalAverage;
  return national ? `${carrier}% / ${national}% national` : `${carrier}%`;
}

function getDotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dot") || params.get("dotNumber") || "";
}

function updateDirectLinks(dot) {
  const saferLink = document.getElementById("saferLink");
  const smsLink = document.getElementById("smsLink");
  const encodedDot = encodeURIComponent(dot);

  if (saferLink) {
    saferLink.href = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodedDot}`;
  }
  if (smsLink) {
    smsLink.href = `https://ai.fmcsa.dot.gov/SMS/Carrier/${encodedDot}/CompleteProfile.aspx`;
  }
}

function renderProfile(carrier) {
  selectedCarrier = carrier;

  const fmcsa = carrier.fmcsaData || {};
  const profile = carrier.carrierProfileData || {};
  const contact = profile.contactInfo || {};
  const insurance = profile.insurance || {};
  const smsSafety = carrier.smsSafety || fmcsa.smsSafety || {};
  const oosRates = smsSafety.oosRates || profile.safetyPerformance || {};

  const carrierName = carrier.carrierName || fmcsa.carrierName || "Unknown Carrier";
  const dot = carrier.dot || fmcsa.dot || "";

  document.title = `${carrierName} - MyTruckingLeads`;
  setText("profileTitle", carrierName);
  setText("carrierName", carrierName);
  setText("dotNumber", dot ? `DOT ${dot}` : "DOT -");
  setText("mcNumber", carrier.mc || fmcsa.mc ? `MC ${carrier.mc || fmcsa.mc}` : "MC -");
  setText("authorityStatus", carrier.authorityStatus || fmcsa.authorityStatus || profile.authority?.status);
  setText("operatingStatus", carrier.operatingStatus || fmcsa.operatingStatus);
  setText("safetyRating", carrier.safetyRating || fmcsa.safetyRating);
  setText("safetyRatingDate", carrier.safetyRatingDate || fmcsa.safetyRatingDate);
  setText("mcs150Date", carrier.mcs150Date || fmcsa.mcs150Date);
  setText("phone", carrier.phone || contact.phone || contact.cellPhone);
  setEmailLink("email", carrier.email || contact.email);
  setText("website", carrier.website || contact.website);
  setText("address", carrier.address || fmcsa.address || contact.address);
  setText("powerUnits", carrier.vehicleCount ?? carrier.vehicles ?? fmcsa.vehicleCount ?? profile.powerUnits);
  setText("drivers", carrier.driverCount ?? carrier.drivers ?? fmcsa.driverCount ?? profile.drivers);
  setText("cargo", carrier.cargo || fmcsa.cargo || (profile.cargoTypes || []).join(", "));
  setText("hazmat", carrier.hazmatAuthorized || fmcsa.hazmatAuthorized ? "Yes" : "No");
  setText("insuranceRenewal", carrier.insuranceExpiration || fmcsa.insuranceExpiration || insurance.expirationDate);
  setText("insuranceCompany", carrier.insuranceCompany || insurance.bipd?.company);
  setText("insuranceFiling", carrier.insuranceFilingStatus || insurance.bipd?.status);
  setText("cargoInsurance", carrier.cargoInsurance || insurance.cargo?.status);
  setText("totalInspections", carrier.totalInspections || fmcsa.totalInspections || smsSafety.inspections || profile.safetyPerformance?.inspections);
  setText("vehicleOos", formatOos(oosRates.vehicle || {
    carrier: profile.safetyPerformance?.vehicleOosRate,
    nationalAverage: profile.safetyPerformance?.vehicleOosNationalAverage
  }));
  setText("driverOos", formatOos(oosRates.driver || {
    carrier: profile.safetyPerformance?.driverOosRate,
    nationalAverage: profile.safetyPerformance?.driverOosNationalAverage
  }));
  setText("crashTotal", carrier.crashTotal || fmcsa.crashTotal || profile.crashHistory?.total);

  updateDirectLinks(dot);
  document.getElementById("carrierProfile")?.classList.remove("d-none");
  document.getElementById("profileNotice")?.classList.add("d-none");
}

async function saveLead() {
  if (!selectedCarrier) return;

  const fmcsa = selectedCarrier.fmcsaData || {};
  const button = document.getElementById("saveProfileLeadBtn");
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
  }

  try {
    await createLead({
      carrier_name: selectedCarrier.carrierName || fmcsa.carrierName,
      dot: selectedCarrier.dot || fmcsa.dot,
      mc: selectedCarrier.mc || fmcsa.mc,
      status: "New Lead",
      insurance_expiration: selectedCarrier.insuranceExpiration || fmcsa.insuranceExpiration,
      notes: "Saved from carrier profile."
    });

    if (button) button.innerHTML = '<i class="bi bi-check2"></i> Saved';
  } catch (err) {
    setNotice(err.message || "Unable to save lead.", "danger");
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-bookmark-plus"></i> Save Lead';
    }
  }
}

async function initCarrierProfile() {
  const dot = getDotFromUrl();
  if (!dot) {
    setNotice("Open a carrier profile with a DOT number, for example carrier-profile.html?dot=3637136.", "warning");
    return;
  }

  try {
    const carrier = await searchCarrier(dot, null, null);
    renderProfile(carrier);
  } catch (err) {
    setNotice(err.message || "Unable to load carrier profile.", "danger");
  }
}

document.getElementById("saveProfileLeadBtn")?.addEventListener("click", saveLead);
initCarrierProfile();
