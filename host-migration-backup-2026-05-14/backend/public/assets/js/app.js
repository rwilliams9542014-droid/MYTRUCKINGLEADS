import * as API from "./api.js?v=cookie-session-2";

const IS_LOCAL_DEV =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

document.addEventListener("DOMContentLoaded", async () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});

const state = {
  leads: [],
  prospectLeads: [],
  newVentureLeads: [],
  selectedCarrier: null,
  activeLeadIndex: null,
  isLoading: false,
  error: null,
  carrierLookupToken: 0,
  carrierWorkflowContext: null
};

function getMonthDateRange(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue || "")) {
    return { from: "", to: "" };
  }

  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${monthValue}-01`,
    to: `${monthValue}-${String(lastDay).padStart(2, "0")}`
  };
}

function getSortParts(controlId, fallback) {
  const value = document.getElementById(controlId)?.value || fallback;
  const [sort, order = "desc"] = value.split(":");
  return { sort, order };
}

function normalizeLeadType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("renew")) return "renewal";
  if (text.includes("venture") || text === "new" || text.includes("new-carrier")) return "new-venture";
  return "";
}

function getWorkflowContextValue(source, ...keys) {
  if (!source) return "";

  for (const key of keys) {
    let value = "";
    if (source instanceof URLSearchParams) {
      value = source.get(key);
    } else if (Object.prototype.hasOwnProperty.call(source, key)) {
      value = source[key];
    }

    if (value === 0 || value === "0" || isMeaningfulValue(value)) return value;
  }

  return "";
}

function readCarrierWorkflowContext(source) {
  const leadType = normalizeLeadType(getWorkflowContextValue(source, "leadType", "lead_type", "mode"));
  const renewalDate = formatDateOnly(getWorkflowContextValue(source, "renewalDate", "renewal_date", "insuranceExpiration", "insurance_expiration"));
  const addDate = formatDateOnly(getWorkflowContextValue(source, "addDate", "add_date", "newVentureDate", "new_venture_date"));
  const daysUntilExpiration = numberValue(getWorkflowContextValue(source, "daysUntilExpiration", "days_until_expiration"));
  const insuranceCompany = String(getWorkflowContextValue(source, "insuranceCompany", "insurance_company") || "").trim();
  const carrierOperation = String(getWorkflowContextValue(source, "carrierOperation", "carrier_operation", "operation") || "").trim();
  const powerUnits = numberValue(getWorkflowContextValue(source, "powerUnits", "power_units", "fleetSize", "fleet_size"));
  const drivers = numberValue(getWorkflowContextValue(source, "drivers", "driverCount", "driver_count"));
  const entryPoint = String(getWorkflowContextValue(source, "entryPoint", "entry_point") || "").trim();

  return {
    leadType,
    renewalDate,
    daysUntilExpiration,
    addDate,
    insuranceCompany,
    carrierOperation,
    powerUnits,
    drivers,
    entryPoint
  };
}

function hasWorkflowContext(context = {}) {
  if (!context || typeof context !== "object") {
    return false;
  }

  return Boolean(
    normalizeLeadType(context.leadType) ||
    isMeaningfulValue(context.renewalDate) ||
    context.daysUntilExpiration !== null && context.daysUntilExpiration !== undefined ||
    isMeaningfulValue(context.addDate) ||
    isMeaningfulValue(context.insuranceCompany) ||
    isMeaningfulValue(context.carrierOperation) ||
    context.powerUnits !== null && context.powerUnits !== undefined ||
    context.drivers !== null && context.drivers !== undefined ||
    isMeaningfulValue(context.entryPoint)
  );
}

function applyCarrierWorkflowContext(carrier, workflowContext = state.carrierWorkflowContext) {
  if (!carrier || !hasWorkflowContext(workflowContext)) return carrier;

  return {
    ...carrier,
    workflowContext: {
      ...(carrier.workflowContext || {}),
      ...workflowContext
    }
  };
}

function buildCarrierAnalyticsUrl(dot, workflowContext = {}) {
  const normalizedDot = String(dot || "").trim();
  const params = new URLSearchParams();
  if (normalizedDot) params.set("dot", normalizedDot);

  const context = readCarrierWorkflowContext(workflowContext);
  if (context.leadType) params.set("leadType", context.leadType);
  if (isMeaningfulValue(context.entryPoint)) params.set("entryPoint", context.entryPoint);
  if (isMeaningfulValue(context.renewalDate)) params.set("renewalDate", context.renewalDate);
  if (context.daysUntilExpiration !== null) params.set("daysUntilExpiration", String(context.daysUntilExpiration));
  if (isMeaningfulValue(context.insuranceCompany)) params.set("insuranceCompany", context.insuranceCompany);
  if (isMeaningfulValue(context.addDate)) params.set("addDate", context.addDate);
  if (isMeaningfulValue(context.carrierOperation)) params.set("carrierOperation", context.carrierOperation);
  if (context.powerUnits !== null) params.set("powerUnits", String(context.powerUnits));
  if (context.drivers !== null) params.set("drivers", String(context.drivers));

  return `dot-analytics.html?${params.toString()}`;
}

function showLoading(element) {
  if (element) {
    element.disabled = true;
    element.dataset.originalHtml = element.innerHTML;
    element.innerHTML = "Loading...";
  }
}

function hideLoading(element) {
  if (element && element.dataset.originalHtml) {
    element.disabled = false;
    element.innerHTML = element.dataset.originalHtml;
    delete element.dataset.originalHtml;
  }
}

function showError(message, element = null) {
  state.error = message;
  console.error("Error:", message);

  if (element && element.parentElement) {
    const alert = document.createElement("div");
    alert.className = "alert alert-danger alert-dismissible fade show";
    alert.innerHTML = `
      ${escapeHtml(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    element.parentElement.insertBefore(alert, element);
    setTimeout(() => alert.remove(), 5000);
  }
}

function showSuccess(message, element = null) {
  if (element && element.parentElement) {
    const alert = document.createElement("div");
    alert.className = "alert alert-success alert-dismissible fade show";
    alert.innerHTML = `
      ${escapeHtml(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    element.parentElement.insertBefore(alert, element);
    setTimeout(() => alert.remove(), 3000);
  }
}

function showUpgradePrompt(message, element = null) {
  const target = element?.parentElement || document.querySelector(".dashboard-content") || document.body;
  const alert = document.createElement("div");
  alert.className = "upgrade-alert alert alert-warning d-flex align-items-center justify-content-between gap-3";
  alert.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <a class="btn btn-sm btn-primary" href="pricing.html">View Plans</a>
  `;
  target.insertBefore(alert, target.firstChild);
  setTimeout(() => alert.remove(), 7000);
}

function normalizeEmailAddress(value) {
  const email = String(value || "").trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ? email : "";
}

function renderEmailLink(value, fallback = "") {
  const email = normalizeEmailAddress(value);
  if (!email) return escapeHtml(fallback || value || "");

  return `<a class="email-link" href="mailto:${escapeAttribute(email)}" title="Send email to ${escapeAttribute(email)}">${escapeHtml(email)}</a>`;
}

function getCurrentPlan() {
  const plan = API.getCurrentUser()?.plan || "basic";
  if (plan === "starter") return "basic";
  if (plan === "agency") return "premium";
  return plan;
}

function isOneStatePlan() {
  return ["basic", "pro"].includes(getCurrentPlan());
}

function getPlanLeadLabel() {
  const plan = getCurrentPlan();
  if (plan === "premium") return "Agency Unlimited";
  if (plan === "pro") return "Pro";
  return "Starter";
}

function getCurrentExportQuota() {
  const user = API.getCurrentUser();
  const limit = user?.monthlyExportLimit;
  const remaining = user?.monthlyExportsRemaining;
  return {
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(remaining) ? remaining : null
  };
}

function exportQuotaMessage() {
  const { limit, remaining } = getCurrentExportQuota();
  if (limit === null) {
    return "Agency Unlimited includes unlimited exports.";
  }
  if (remaining === null) {
    return `${getPlanLeadLabel()} includes up to ${limit.toLocaleString()} exported records per month.`;
  }
  return `${getPlanLeadLabel()} includes up to ${limit.toLocaleString()} exported records per month. ${remaining.toLocaleString()} left this month.`;
}

function canUseCrm() {
  const status = String(API.getCurrentUser()?.subscription_status || "").toLowerCase();
  return ["basic", "pro", "premium"].includes(getCurrentPlan()) && (IS_LOCAL_DEV || ["active", "trialing"].includes(status));
}

function canUseAdvancedFilters() {
  return ["pro", "premium"].includes(getCurrentPlan()) && canUseCrm();
}

function getPlanRenewalWindowDays() {
  const windows = { basic: 30, pro: 365, premium: 365 };
  return windows[getCurrentPlan()] || 0;
}

function getPlanLeadHistoryDays() {
  const windows = { basic: 30, pro: 90, premium: 3650 };
  return windows[getCurrentPlan()] || 30;
}

async function searchCarrier(query, options = {}) {
  if (!query.trim()) {
    showError("Please enter a DOT, MC, or carrier name");
    return;
  }

  state.carrierWorkflowContext = hasWorkflowContext(options.workflowContext)
    ? readCarrierWorkflowContext(options.workflowContext)
    : null;

  const searchBtn = document.querySelector('#searchForm [type="submit"]');
  const lookupToken = ++state.carrierLookupToken;
  renderCarrierLookupLoading(query);
  showLoading(searchBtn);
  if (searchBtn) {
    searchBtn.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Querying FMCSA`;
  }

  try {
    const trimmedQuery = query.trim();
    const dotMatch = trimmedQuery.match(/^(?:DOT|USDOT)?\s*-?\s*(\d{1,8})$/i);
    const mcMatch = trimmedQuery.match(/^(?:MC|MX|FF)\s*-?\s*(\d{1,8})$/i);
    const dotNumber = mcMatch ? null : dotMatch?.[1] || null;
    const mcNumber = mcMatch?.[1] || null;
    const carrierName = !dotNumber && !mcNumber ? trimmedQuery : null;

    const carrier = applyCarrierWorkflowContext(await API.searchCarrier(dotNumber, mcNumber, carrierName));
    if (lookupToken !== state.carrierLookupToken) return;
    state.selectedCarrier = carrier;
    const shouldHydrate = needsCarrierProfileHydration(carrier);
    renderCarrierDetails(carrier, { hydrating: shouldHydrate });

    if (shouldHydrate) {
      hydrateCarrierProfile(carrier, lookupToken);
    }
  } catch (err) {
    showError(err.message, searchBtn);
  } finally {
    hideLoading(searchBtn);
  }
}

function renderCarrierLookupLoading(query) {
  const container = document.getElementById("carrierDetails");
  const saveBtn = document.getElementById("saveLeadBtn");
  if (!container) return;

  if (saveBtn) saveBtn.disabled = true;
  renderContactInfo(null);
  renderCarrierAnalytics(null);
  renderCarrierIntelligence(null);

  container.innerHTML = `
    <div class="carrier-lookup-loading">
      <div class="spinner-border text-primary" role="status" aria-hidden="true"></div>
      <div>
        <strong>Querying FMCSA carrier systems</strong>
        <p>Checking Company Census, SAFER Snapshot, and SMS safety data for ${escapeHtml(query.trim())}. This can take a few seconds.</p>
      </div>
    </div>
  `;
}

function isMeaningfulValue(value) {
  if (value === 0) return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(item => isMeaningfulValue(item));
  if (value && typeof value === "object") {
    return isMeaningfulValue(value.raw) ||
      isMeaningfulValue(value.street) ||
      isMeaningfulValue(value.city) ||
      isMeaningfulValue(value.state) ||
      isMeaningfulValue(value.zip);
  }

  const text = String(value ?? "").trim();
  if (!text) return false;

  return !["unknown", "not available", "not listed", "n/a", "na", "null", "undefined"].includes(text.toLowerCase());
}

function normalizeAddressValue(value) {
  if (!value || typeof value !== "object") {
    return String(value || "").trim();
  }

  return String(
    firstMeaningfulValue(
      value.raw,
      [value.street, value.city, value.state, value.zip].filter(Boolean).join(", ")
    ) || ""
  ).trim();
}

function firstMeaningfulValue(...values) {
  for (const value of values) {
    if (isMeaningfulValue(value)) return value;
  }

  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return value;
  }

  return "";
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => normalizeListValue(item));
  }

  const text = String(value ?? "").trim();
  if (!text) return [];
  if (["unknown", "not available", "not listed", "n/a", "na", "null", "undefined"].includes(text.toLowerCase())) {
    return [];
  }

  return text
    .split(/[,;|]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueValues(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCarrierDotNumber(carrier = {}) {
  return String(
    firstMeaningfulValue(
      carrier.dotNumber,
      carrier.dot,
      carrier.fmcsaData?.dot,
      carrier.raw?.liveCarrier?.dot
    ) || ""
  ).trim();
}

function hasFullCarrierProfile(carrier = {}) {
  return Boolean(
    carrier.companyOverview ||
    carrier.physicalAddress ||
    carrier.safety ||
    carrier.licensingInsurance ||
    (Array.isArray(carrier.cargoCarried) && carrier.cargoCarried.length) ||
    carrier.companyOfficer1
  );
}

function needsCarrierProfileHydration(carrier = {}) {
  return Boolean(getCarrierDotNumber(carrier) && !hasFullCarrierProfile(carrier));
}

async function hydrateCarrierProfile(carrier, lookupToken) {
  const dotNumber = getCarrierDotNumber(carrier);
  if (!dotNumber) return;

  try {
    const fullCarrier = await API.getCarrierProfile(dotNumber);
    if (lookupToken !== state.carrierLookupToken) return;

    state.selectedCarrier = applyCarrierWorkflowContext({
      ...carrier,
      ...fullCarrier
    });
    renderCarrierDetails(state.selectedCarrier);
  } catch (err) {
    console.warn(`Carrier profile hydration skipped for DOT ${dotNumber}:`, err.message);
  }
}

function renderProfileField(label, value, full = false) {
  return `<div class="profile-field${full ? " full" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not available")}</strong></div>`;
}

function renderProfileFields(items = []) {
  return `<div class="profile-fields">${items.map((item) => renderProfileField(item[0], item[1], item[2])).join("")}</div>`;
}

function renderProfileStat(value, label) {
  return `<div class="profile-stat"><strong>${escapeHtml(value || "Not available")}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderProfileSummary(items = []) {
  return `<div class="profile-summary-grid">${items.map((item) => renderProfileStat(item[0], item[1])).join("")}</div>`;
}

const MOTUS_PORTAL_URL = "https://motus.dot.gov/";
const FMCSA_TRANSITION_NOTICE = "FMCSA is transitioning registration services to Motus. Some legacy SAFER registration functions may move to Motus over time.";

function renderOfficialLinksCard(links = {}) {
  const linkItems = [
    ["SAFER Snapshot (Legacy)", links.safer],
    ["Licensing & Insurance", links.licensingInsurance],
    ["SMS Safety Data", links.sms],
    ["Motus Registration Portal", links.motus || MOTUS_PORTAL_URL]
  ].filter((item) => item[1]);
  const notice = links.notice || FMCSA_TRANSITION_NOTICE;

  if (!linkItems.length) return `<p class="muted-note mb-0">Official source links are not available for this carrier yet.</p>`;

  return `
    <div class="official-links">${linkItems.map(([label, url]) => `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`).join("")}</div>
    <p class="muted-note mb-0">${escapeHtml(notice)}</p>
  `;
}

function renderInsuranceFilingsTable(filings = []) {
  if (!Array.isArray(filings) || filings.length === 0) return "";

  return `
    <div class="profile-section">
      <h3>Recent BMC Filings</h3>
      <div class="mini-table-wrap">
        <table class="mini-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Type</th>
              <th>Status</th>
              <th>Effective</th>
              <th>Expiration</th>
            </tr>
          </thead>
          <tbody>
            ${filings.slice(0, 6).map((filing) => `
              <tr>
                <td>${escapeHtml(filing.insuranceCompany || "Not available")}</td>
                <td>${escapeHtml(filing.insuranceType || filing.formCode || "Not available")}</td>
                <td>${escapeHtml(filing.statusLabel || filing.insuranceFilingStatus || "Not available")}</td>
                <td>${escapeHtml(formatDateOnly(filing.insuranceEffectiveDate) || "Not available")}</td>
                <td>${escapeHtml(formatDateOnly(filing.insuranceExpirationDate) || "Current")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function normalizeCarrierProfile(carrier = {}) {
  const fmcsa = carrier.fmcsaData || {};
  const safety = carrier.safety || {};
  const licensing = carrier.licensingInsurance || {};
  const carrierProfileData = carrier.carrierProfileData || {};
  const workflowContext = readCarrierWorkflowContext(carrier.workflowContext || {});
  const profileSafety = carrierProfileData.safetyPerformance || {};
  const profileInsurance = carrierProfileData.insurance || {};
  const profileContact = carrierProfileData.contactInfo || {};
  const profileAuthority = carrierProfileData.authority || {};
  const profileBusiness = carrierProfileData.businessDetails || {};
  const saferData = carrier.saferData || fmcsa.saferData || carrier.raw?.saferData || carrier.raw?.liveCarrier?.saferData || {};
  const smsSafety = carrier.smsSafety || fmcsa.smsSafety || carrier.raw?.smsSafety || carrier.raw?.liveCarrier?.smsSafety || {};

  const cargoList = uniqueValues([
    ...normalizeListValue(carrier.cargoCarried),
    ...normalizeListValue(carrier.cargoTypes),
    ...normalizeListValue(saferData.cargoTypes),
    ...normalizeListValue(carrierProfileData.cargoTypes),
    ...normalizeListValue(carrier.cargo || fmcsa.cargo || saferData.cargo)
  ]);

  const carrierName = firstMeaningfulValue(
    carrier.legalName,
    carrier.carrierName,
    fmcsa.carrierName,
    carrier.name,
    carrier.dbaName,
    "Unknown Carrier"
  );
  const dot = getCarrierDotNumber(carrier);
  const mc = String(firstMeaningfulValue(carrier.docketNumber, carrier.mc, fmcsa.mc) || "").trim();
  const authorityStatus = firstMeaningfulValue(
    carrier.authorityStatus,
    licensing.authorityStatus,
    saferData.authorityStatus,
    fmcsa.authorityStatus,
    profileAuthority.status,
    carrier.operatingStatus,
    "Not available"
  );
  const operatingStatus = firstMeaningfulValue(
    carrier.operatingStatus,
    fmcsa.operatingStatus,
    saferData.operatingStatus,
    authorityStatus,
    "Not available"
  );
  const fleetSize = firstMeaningfulValue(
    carrier.fleetSize,
    carrier.powerUnits,
    workflowContext.powerUnits,
    carrier.vehicleCount,
    carrier.vehicles,
    fmcsa.vehicleCount,
    fmcsa.vehicles,
    ""
  );
  const drivers = firstMeaningfulValue(
    carrier.drivers,
    carrier.driverCount,
    workflowContext.drivers,
    fmcsa.driverCount,
    fmcsa.drivers,
    ""
  );
  const authoritySince = firstMeaningfulValue(carrier.authoritySince, profileAuthority.authoritySince, "Not available");
  const authorityAge = firstMeaningfulValue(
    carrier.authorityAge,
    carrierProfileData.authorityAge,
    describeAgeSince(authoritySince),
    ""
  );

  const profile = {
    carrierName,
    dot,
    mc,
    dbaName: firstMeaningfulValue(carrier.dbaName, "Not listed"),
    companyOverview: firstMeaningfulValue(carrier.companyOverview, carrierProfileData.overview, ""),
    physicalAddress: firstMeaningfulValue(
      carrier.physicalAddress,
      normalizeAddressValue(carrier.address),
      profileContact.address,
      fmcsa.address,
      "Not available"
    ),
    mailingAddress: firstMeaningfulValue(carrier.mailingAddress, "Not listed"),
    phone: firstMeaningfulValue(carrier.phoneNumber, carrier.phone, profileContact.phone, fmcsa.phone, "Not available"),
    cellPhone: firstMeaningfulValue(carrier.cellPhone, profileContact.cellPhone, "Not listed"),
    email: firstMeaningfulValue(carrier.email, profileContact.email, fmcsa.email, "Not available"),
    website: firstMeaningfulValue(carrier.website, profileContact.website, "Not available"),
    companyOfficer1: firstMeaningfulValue(carrier.companyOfficer1, carrier.companyOfficer, profileContact.companyOfficer, "Not listed"),
    companyOfficer2: firstMeaningfulValue(carrier.companyOfficer2, profileContact.companyOfficer2, "Not listed"),
    entityType: firstMeaningfulValue(carrier.entityType, profileBusiness.carrierType, "Not available"),
    authorityStatus,
    operatingStatus,
    operationsScope: firstMeaningfulValue(carrier.operationsScope, carrier.carrierOperation, workflowContext.carrierOperation, carrierProfileData.operationsScope, "Not available"),
    authoritySince,
    authorityAge,
    safetyRating: firstMeaningfulValue(safety.safetyRating, carrier.safetyRating, saferData.safetyRating, smsSafety.safetyRating, fmcsa.safetyRating, "Unknown"),
    safetyRatingDate: firstMeaningfulValue(safety.safetyRatingDate, carrier.safetyRatingDate, saferData.safetyRatingDate, smsSafety.safetyRatingDate, ""),
    safetySource: firstMeaningfulValue(safety.source, smsSafety.source, carrier.source, "FMCSA carrier record"),
    totalInspections: firstMeaningfulValue(safety.totalInspections, carrier.totalInspections, saferData.totalInspections, smsSafety.inspections, ""),
    crashTotal: firstMeaningfulValue(safety.crashTotal, carrier.crashTotal, saferData.crashTotal, ""),
    crashes: carrier.crashes || safety.crashes || saferData.crashes || null,
    smsProfileAvailable: safety.smsProfileAvailable ?? Boolean(smsSafety && Object.keys(smsSafety).length),
    oosRates: safety.oosRates || smsSafety.oosRates || {},
    safetyCategories: safety.categories || {
      unsafeDriving: firstMeaningfulValue(smsSafety.basics?.unsafeDriving, profileSafety.gradeSummary, "Not available"),
      hoursOfService: firstMeaningfulValue(smsSafety.basics?.hoursOfService, "Not available"),
      driverFitness: firstMeaningfulValue(smsSafety.basics?.driverFitness, "Not available"),
      vehicleMaintenance: firstMeaningfulValue(smsSafety.basics?.vehicleMaintenance, "Not available"),
      controlledSubstances: firstMeaningfulValue(smsSafety.basics?.controlledSubstances, "Not available"),
      hazmat: firstMeaningfulValue(smsSafety.basics?.hazmat, "Not available")
    },
    insurance: {
      company: firstMeaningfulValue(licensing.insuranceCompany, workflowContext.insuranceCompany, carrier.insuranceCompany, profileInsurance.bipdCompany, "Not available"),
      filingStatus: firstMeaningfulValue(licensing.insuranceFilingStatus, carrier.insuranceFilingStatus, licensing.authorityStatus, authorityStatus, "Not available"),
      policyNumber: firstMeaningfulValue(licensing.policyNumber, carrier.insurancePolicyNumber, "Not listed"),
      coverageInfo: firstMeaningfulValue(licensing.coverageInfo, carrier.insuranceType, carrier.cargoInsurance, profileInsurance.bipdCoverage, "Not available"),
      effectiveDate: firstMeaningfulValue(licensing.insuranceEffectiveDate, "Not available"),
      expirationDate: firstMeaningfulValue(workflowContext.renewalDate, licensing.insuranceExpirationDate, carrier.insuranceExpirationDate, carrier.insuranceExpiration, fmcsa.insuranceExpiration, ""),
      filings: Array.isArray(licensing.bmcFilings) ? licensing.bmcFilings : []
    },
    fleetSize,
    drivers,
    cdlDrivers: firstMeaningfulValue(carrier.cdlDrivers, drivers, "Not available"),
    intrastateDrivers: firstMeaningfulValue(carrier.intrastateDrivers, "Not listed"),
    ownedTrucks: firstMeaningfulValue(carrier.fleetBreakdown?.ownedTrucks, carrierProfileData.fleetBreakdown?.trucks?.owned, fleetSize, "Not available"),
    termLeased: firstMeaningfulValue(carrier.fleetBreakdown?.termLeased, carrierProfileData.fleetBreakdown?.trucks?.termLeased, "Not listed"),
    tripLeased: firstMeaningfulValue(carrier.fleetBreakdown?.tripLeased, carrierProfileData.fleetBreakdown?.trucks?.tripLeased, "Not listed"),
    fleetClass: firstMeaningfulValue(carrier.fleetBreakdown?.classification, carrierProfileData.fleetBreakdown?.classification, "Not available"),
    cargoList,
    cargoText: cargoList.join(", "),
    mcs150Date: firstMeaningfulValue(carrier.mcs150Date, fmcsa.mcs150Date, carrierProfileData.mcs150Date, ""),
    mcs150Mileage: firstMeaningfulValue(carrier.mcs150Mileage, carrierProfileData.mcs150Mileage, "Not listed"),
    hazmat: firstMeaningfulValue(carrier.hazmat, profileBusiness.hazmat, "Not listed"),
    passengerCarrier: firstMeaningfulValue(carrier.passengerCarrier, profileBusiness.passengerCarrier, "Not listed"),
    county: firstMeaningfulValue(carrier.county, "Not listed"),
    officialLinks: carrier.officialLinks || (dot ? {
      safer: `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`,
      licensingInsurance: `https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${encodeURIComponent(dot)}`,
      ...(safety.smsProfileAvailable ? { sms: `https://ai.fmcsa.dot.gov/SMS/Carrier/${encodeURIComponent(dot)}/Overview.aspx?FirstView=True` } : {}),
      motus: MOTUS_PORTAL_URL,
      notice: FMCSA_TRANSITION_NOTICE
    } : {}),
    dataSources: uniqueValues([
      ...normalizeListValue(carrier.dataSources),
      ...normalizeListValue(carrier.source),
      ...normalizeListValue(safety.source),
      ...(carrierProfileData.detailUrl ? ["Expanded FMCSA carrier profile"] : [])
    ]),
    sourceType: firstMeaningfulValue(carrier.sourceType, carrier.source, "Carrier intelligence"),
    liveUnavailable: Boolean(carrier.liveUnavailable),
    message: String(carrier.message || "").trim(),
    lastUpdated: firstMeaningfulValue(carrier.lastUpdated, carrier.updatedAt, carrier.sourceLastSeenAt, ""),
    workflow: {
      leadType: workflowContext.leadType,
      entryPoint: firstMeaningfulValue(
        workflowContext.entryPoint,
        workflowContext.leadType === "renewal"
          ? "Renewal desk"
          : workflowContext.leadType === "new-venture"
            ? "New venture desk"
            : ""
      ),
      renewalDate: workflowContext.renewalDate,
      daysUntilExpiration: workflowContext.daysUntilExpiration,
      newVentureDate: workflowContext.addDate,
      carrierOperation: workflowContext.carrierOperation,
      insuranceCompany: workflowContext.insuranceCompany,
      powerUnits: workflowContext.powerUnits,
      drivers: workflowContext.drivers
    },
    carrierProfileData
  };

  if (!profile.companyOverview) {
    const fleetText = profile.fleetSize ? `${profile.fleetSize} power unit${String(profile.fleetSize) === "1" ? "" : "s"}` : "an unlisted fleet size";
    const driverText = isMeaningfulValue(profile.drivers) ? `${profile.drivers} driver${String(profile.drivers) === "1" ? "" : "s"}` : "driver count not listed";
    const cargoText = profile.cargoText || "cargo not listed";
    profile.companyOverview = `${profile.carrierName} is listed as ${profile.authorityStatus || "a carrier"} in the FMCSA carrier data. The record shows ${profile.entityType || "carrier operations"}, ${fleetText}, ${driverText}, and ${cargoText}.`;
  }

  return profile;
}

function renderCarrierDetailMessage(message, tone = "info") {
  if (!message) return "";

  const className = tone === "warn" ? "warn" : tone === "good" ? "good" : "info";
  return `<div class="analytics-inline-alert ${className}">${escapeHtml(message)}</div>`;
}

function renderCarrierDetails(carrier, options = {}) {
  const container = document.getElementById("carrierDetails");
  const saveBtn = document.getElementById("saveLeadBtn");

  if (!container || !saveBtn) return;

  if (!carrier) {
    container.innerHTML = `<p class="mb-1 text-muted">Search a DOT, MC, or carrier name to view carrier details here.</p>`;
    saveBtn.disabled = true;
    renderContactInfo(null);
    renderCarrierAnalytics(null);
    renderCarrierIntelligence(null);
    return;
  }

  const profile = normalizeCarrierProfile(carrier);
  const safetyMeta = getSafetyRatingMeta(profile.safetyRating);
  const dataModeLabel = profile.sourceType === "live"
    ? "Live FMCSA"
    : profile.sourceType === "cached"
      ? "Cached carrier record"
      : profile.sourceType === "postgres-fallback"
        ? "Postgres fallback"
        : "Carrier intelligence";

  container.innerHTML = `
    <div class="carrier-profile-stack analytics-profile-shell">
      <div class="carrier-record-header">
        <div>
          <span class="workspace-kicker">Lead profile carrier dossier</span>
          <h5>${escapeHtml(profile.carrierName)}</h5>
          <p>DOT ${escapeHtml(profile.dot || "Not available")}${profile.mc ? ` - MC ${escapeHtml(profile.mc)}` : ""}</p>
        </div>
        <div class="carrier-record-actions">
          ${renderCarrierProfileLink(profile.dot)}
          ${renderCarrierSourceLinks(profile.dot)}
        </div>
      </div>

      ${options.hydrating ? renderCarrierDetailMessage("Loading the expanded carrier profile so cargo, safety, insurance, and contact detail can fill in.", "info") : ""}
      ${profile.liveUnavailable || profile.message ? renderCarrierDetailMessage(profile.message || "Live FMCSA data is temporarily unavailable. Showing saved carrier data where available.", "warn") : ""}

      <div class="company-overview-card">${escapeHtml(profile.companyOverview)}</div>

      ${renderProfileSummary([
        [profile.fleetSize, "Power Units"],
        [profile.drivers, "Drivers"],
        [profile.authorityAge, "Authority Age"],
        [profile.safetyRating, "Safety Rating"]
      ])}

      <div class="profile-card">
        <h3>Company Overview</h3>
        ${renderProfileFields([
          ["Legal business name", profile.carrierName],
          ["DBA name", profile.dbaName],
          ["DOT number", profile.dot],
          ["MC / docket number", profile.mc],
          ["Company officer", profile.companyOfficer1],
          ["Company officer 2", profile.companyOfficer2],
          ["Physical address", profile.physicalAddress, true],
          ["Mailing address", profile.mailingAddress, true]
        ])}
      </div>

      <div class="profile-card">
        <h3>Authority & Operations</h3>
        ${renderProfileFields([
          ["Operating status", profile.operatingStatus],
          ["Authority status", profile.authorityStatus],
          ["Authority since", formatDateOnly(profile.authoritySince) || profile.authoritySince],
          ["Authority age", profile.authorityAge],
          ["Entity / business type", profile.entityType],
          ["Operations scope", profile.operationsScope],
          ["Hazmat", profile.hazmat],
          ["Passenger carrier", profile.passengerCarrier],
          ["County", profile.county]
        ])}
      </div>

      <div class="profile-card">
        <h3>Safety Snapshot</h3>
        <div class="carrier-safety-summary ${safetyMeta.panelClass}">
          <div class="carrier-safety-main">
            <span class="analytics-field-label">Safety Rating</span>
            ${renderSafetyBadge(profile.safetyRating)}
            <p>${escapeHtml(safetyMeta.summary)}</p>
          </div>
          <div class="carrier-safety-stats">
            <div>
              <span>Rating Date</span>
              <strong>${escapeHtml(formatDateOnly(profile.safetyRatingDate) || "Not available")}</strong>
            </div>
            <div>
              <span>SMS Inspections</span>
              <strong>${escapeHtml(profile.totalInspections || "Not available")}</strong>
            </div>
            <div>
              <span>Vehicle OOS</span>
              <strong>${escapeHtml(formatOosRate(profile.oosRates.vehicle?.carrier))}</strong>
            </div>
            <div>
              <span>Driver OOS</span>
              <strong>${escapeHtml(formatOosRate(profile.oosRates.driver?.carrier))}</strong>
            </div>
          </div>
          <small>${escapeHtml(profile.safetySource)}</small>
        </div>
        ${renderSafetyVisuals(profile)}
        ${renderOosRateRows(profile.oosRates)}
        ${renderCrashBreakdown(profile.crashes)}
        ${renderProfileFields([
          ["SMS safety overview", profile.safetyRating],
          ["Unsafe driving", profile.safetyCategories.unsafeDriving],
          ["Hours of service", profile.safetyCategories.hoursOfService],
          ["Driver fitness", profile.safetyCategories.driverFitness],
          ["Controlled substances/alcohol", profile.safetyCategories.controlledSubstances],
          ["Vehicle maintenance", profile.safetyCategories.vehicleMaintenance],
          ["Hazmat BASIC", profile.safetyCategories.hazmat],
          ["Crash total", profile.crashTotal]
        ])}
      </div>

      <div class="profile-card">
        <h3>Licensing & Insurance</h3>
        ${renderProfileFields([
          ["Authority status", profile.authorityStatus],
          ["Insurance filing status", profile.insurance.filingStatus],
          ["Insurance company", profile.insurance.company],
          ["Coverage info", profile.insurance.coverageInfo],
          ["Policy number", profile.insurance.policyNumber],
          ["Insurance effective date", formatDateOnly(profile.insurance.effectiveDate) || profile.insurance.effectiveDate],
          ["Insurance expiration date", formatDateOnly(profile.insurance.expirationDate) || "Not listed"],
          ["Data mode", dataModeLabel]
        ])}
        ${renderInsuranceFilingsTable(profile.insurance.filings)}
      </div>

      <div class="profile-card">
        <h3>Equipment, Fleet & Cargo</h3>
        ${renderProfileFields([
          ["Fleet size classification", profile.fleetClass],
          ["Owned trucks", profile.ownedTrucks],
          ["Term leased", profile.termLeased],
          ["Trip leased", profile.tripLeased],
          ["Total power units", profile.fleetSize],
          ["Total drivers", profile.drivers],
          ["CDL drivers", profile.cdlDrivers],
          ["Intrastate drivers", profile.intrastateDrivers],
          ["MCS-150 mileage", profile.mcs150Mileage],
          ["MCS-150 date", formatDateOnly(profile.mcs150Date) || profile.mcs150Date],
          ["Authorized cargo types", profile.cargoText || "Not listed", true]
        ])}
      </div>

      ${profile.carrierProfileData?.detailUrl ? renderCarrierProfileData(profile.carrierProfileData) : ""}

      <div class="profile-card">
        <h3>Verify On Official Sources</h3>
        ${renderOfficialLinksCard(profile.officialLinks)}
        <div class="profile-section">
          <h3>Data Sources</h3>
          <div class="source-list">${renderValueList(profile.dataSources)}</div>
        </div>
        ${renderProfileFields([
          ["Last updated", formatDateOnly(profile.lastUpdated) || profile.lastUpdated || "Not available"],
          ["Record mode", dataModeLabel]
        ])}
      </div>
    </div>
  `;
  saveBtn.disabled = !canUseCrm();
  saveBtn.title = canUseCrm() ? "" : "Choose a lead plan to save trucking leads.";
  renderContactInfo(profile);
  renderCarrierAnalytics(profile);
  renderCarrierIntelligence(profile);
}

function renderCarrierAnalytics(carrier) {
  const nameElement = document.getElementById("analyticsCarrierName");

  if (!carrier) {
    setText("analyticsCarrierName", "Search a carrier");
    return;
  }

  const profile = normalizeCarrierProfile(carrier);
  const carrierName = profile.carrierName || "Unknown Carrier";
  if (nameElement) nameElement.textContent = carrierName;
}

async function saveLead() {
  if (!canUseCrm()) {
    showError("Choose a lead plan to save trucking leads.");
    return;
  }

  if (!state.selectedCarrier) {
    showError("No carrier selected");
    return;
  }

  const user = API.getCurrentUser();
  if (!user) {
    showError("Please login first");
    return;
  }

  const saveBtn = document.getElementById("saveLeadBtn");
  showLoading(saveBtn);

  try {
    const profile = normalizeCarrierProfile(state.selectedCarrier);
    await API.createLead({
      user_id: user.id,
      carrier_name: profile.carrierName,
      dot: profile.dot,
      mc: profile.mc,
      insurance_expiration: formatDateOnly(profile.insurance.expirationDate) || "",
      status: "New"
    });

    showSuccess("Lead saved successfully", saveBtn);
    await loadLeads();
  } catch (err) {
    showError(err.message, saveBtn);
  } finally {
    hideLoading(saveBtn);
  }
}

async function loadLeads() {
  try {
    const data = await API.getLeads();
    state.leads = data.leads || [];
  } catch (err) {
    console.warn("Could not load leads from backend:", err.message);
  }

  renderLeadsTable();
}

async function loadInsuranceAlerts() {
  try {
    const data = await API.getExpiringInsurance();
    renderInsuranceAlerts(data);
  } catch (err) {
    console.warn("Could not load insurance alerts:", err.message);
  }
}

function getProspectFilters() {
  const emailFilter = document.getElementById("prospectEmailFilter")?.value || "";
  const monthRange = getMonthDateRange(document.getElementById("renewalMonth")?.value || "");
  const sortParts = getSortParts("prospectSort", "insuranceExpirationDate:asc");
  const renewalWindowDays = getPlanRenewalWindowDays();

  return {
    renewalFrom: monthRange.from || document.getElementById("renewalFrom")?.value || "",
    renewalTo: monthRange.to || document.getElementById("renewalTo")?.value || "",
    state: document.getElementById("prospectState")?.value?.trim().toUpperCase() || "",
    minFleetSize: document.getElementById("minFleetSize")?.value || "",
    hasEmail: emailFilter === "hasEmail" || emailFilter === "verified" ? "true" : "",
    emailVerified: emailFilter === "verified" ? "true" : "",
    sort: sortParts.sort,
    order: sortParts.order,
    days: String(renewalWindowDays),
    limit: "500"
  };
}

function requireStateForOneStatePlan(stateElementId, targetElement = null) {
  const state = document.getElementById(stateElementId)?.value?.trim().toUpperCase() || "";
  if (isOneStatePlan() && !state) {
    showUpgradePrompt(`${getPlanLeadLabel()} includes one state. Choose a state, then search.`, targetElement || document.getElementById(stateElementId));
    return false;
  }
  return true;
}

function getNewVentureFilters() {
  const emailFilter = document.getElementById("newVentureEmailFilter")?.value || "";
  const monthRange = getMonthDateRange(document.getElementById("newVentureMonth")?.value || "");
  const sortParts = getSortParts("newVentureSort", "raw.census.add_date:desc");
  const leadHistoryDays = getPlanLeadHistoryDays();

  return {
    from: monthRange.from || document.getElementById("newVentureFrom")?.value || "",
    to: monthRange.to || document.getElementById("newVentureTo")?.value || "",
    state: document.getElementById("newVentureState")?.value?.trim().toUpperCase() || "",
    operation: document.getElementById("newVentureOperation")?.value || "",
    minFleetSize: document.getElementById("newVentureMinFleet")?.value || "",
    hasEmail: emailFilter === "hasEmail" || emailFilter === "verify" ? "true" : "",
    verifyEmails: emailFilter === "verify" ? "true" : "",
    sort: sortParts.sort,
    order: sortParts.order,
    daysBack: String(leadHistoryDays),
    limit: "500"
  };
}

async function searchProspectReport() {
  const form = document.getElementById("prospectFilterForm");
  const submitButton = form?.querySelector('[type="submit"]');
  showLoading(submitButton);

  try {
    if (!requireStateForOneStatePlan("prospectState", submitButton || form)) return;
    const data = await API.searchProspectLeads(getProspectFilters());
    state.prospectLeads = data.leads || [];
    renderProspectReport(state.prospectLeads);
    setText(
      "prospectReportSummary",
      data.message || `Found ${data.total || 0} matching renewal leads.`
    );
  } catch (err) {
    if (err.status === 403) {
      showUpgradePrompt(err.message, submitButton || form);
    } else {
      showError(err.message, submitButton || form);
    }
  } finally {
    hideLoading(submitButton);
  }
}

async function exportProspectReport() {
  const exportButton = document.getElementById("exportProspectsBtn");
  showLoading(exportButton);

  try {
    await exportCheckedProspectLeads(exportButton);
    applySubscriptionUiControls();
  } catch (err) {
    if (err.status === 403) {
      showUpgradePrompt(err.message, exportButton);
    } else {
      showError(err.message, exportButton);
    }
  } finally {
    hideLoading(exportButton);
  }
}

function renderProspectReport(leads) {
  const tbody = document.getElementById("prospectReportBody");
  if (!tbody) return;

  if (!leads.length) {
    state.prospectLeads = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="15" class="text-center small text-muted py-4">
          No matching carriers found. Try broadening your filters or enriching more carriers.
        </td>
      </tr>
    `;
    resetSelectAll("prospectSelectAll");
    updateSelectedRecordCount();
    return;
  }

  tbody.innerHTML = leads.map((lead, index) => `
    <tr>
      <td class="text-center"><input class="form-check-input lead-row-checkbox prospect-row-checkbox" type="checkbox" data-index="${index}" aria-label="Select ${escapeAttribute(lead.carrier_name)}" /></td>
      <td class="text-center icon-cell">
        <button class="sheet-icon-btn row-lookup-btn" type="button" title="Lookup carrier" data-dot="${escapeAttribute(lead.dot_number)}" data-lead-type="renewal" data-entry-point="renewal-desk" data-renewal-date="${escapeAttribute(formatDateOnly(lead.insurance_expiration) || lead.insurance_expiration || "")}" data-days-until-expiration="${escapeAttribute(lead.days_until_expiration ?? "")}" data-insurance-company="${escapeAttribute(lead.insurance_company || "")}">
          <i class="bi bi-info"></i>
        </button>
      </td>
      <td>${escapeHtml(lead.dot_number)}</td>
      <td>${escapeHtml(lead.mc_number || lead.mc || "")}</td>
      <td class="name-cell" title="${escapeAttribute(lead.carrier_name)}">${escapeHtml(lead.carrier_name)}</td>
      <td>${escapeHtml(lead.hq_city || "")}</td>
      <td>${escapeHtml(lead.hq_state)}</td>
      <td>${escapeHtml(lead.company_rep || "")}</td>
      <td>${escapeHtml(lead.phone || "")}</td>
      <td>${escapeHtml(lead.cell_phone || "")}</td>
      <td class="email-cell" title="${escapeAttribute(lead.email || "")}">${renderEmailLink(lead.email)}</td>
      <td>${escapeHtml(formatDateOnly(lead.insurance_expiration))}</td>
      <td>${escapeHtml(lead.insurance_company || "")}</td>
      <td>${escapeHtml(lead.vehicle_count)}</td>
      <td>${escapeHtml(lead.alerts ?? "0")}</td>
    </tr>
  `).join("");
  resetSelectAll("prospectSelectAll");
  updateSelectedRecordCount();
}

async function searchNewVentureReport() {
  const form = document.getElementById("newVentureFilterForm");
  const submitButton = form?.querySelector('[type="submit"]');
  showLoading(submitButton);

  try {
    if (!requireStateForOneStatePlan("newVentureState", submitButton || form)) return;
    const data = await API.searchNewVentureLeads(getNewVentureFilters());
    state.newVentureLeads = data.leads || [];
    renderNewVentureReport(state.newVentureLeads);
    setText("newVentureSummary", data.message || `Found ${data.total || 0} new venture leads.`);
  } catch (err) {
    if (err.status === 403) {
      showUpgradePrompt(err.message, submitButton || form);
    } else {
      showError(err.message, submitButton || form);
    }
  } finally {
    hideLoading(submitButton);
  }
}

async function exportNewVentureReport() {
  const exportButton = document.getElementById("exportNewVenturesBtn");
  showLoading(exportButton);

  try {
    await exportCheckedNewVentureLeads(exportButton);
    applySubscriptionUiControls();
  } catch (err) {
    if (err.status === 403) {
      showUpgradePrompt(err.message, exportButton);
    } else {
      showError(err.message, exportButton);
    }
  } finally {
    hideLoading(exportButton);
  }
}

function renderNewVentureReport(leads) {
  const tbody = document.getElementById("newVentureBody");
  if (!tbody) return;

  if (!leads.length) {
    state.newVentureLeads = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="15" class="text-center small text-muted py-4">
          No new venture leads found. Try broadening the date range or state filter.
        </td>
      </tr>
    `;
    resetSelectAll("newVentureSelectAll");
    updateSelectedRecordCount();
    return;
  }

  tbody.innerHTML = leads.map((lead, index) => `
    <tr>
      <td class="text-center"><input class="form-check-input lead-row-checkbox new-venture-row-checkbox" type="checkbox" data-index="${index}" aria-label="Select ${escapeAttribute(lead.carrierName)}" /></td>
      <td class="text-center icon-cell">
        <button class="sheet-icon-btn row-lookup-btn" type="button" title="Lookup carrier" data-dot="${escapeAttribute(lead.dotNumber)}" data-lead-type="new-venture" data-entry-point="new-venture-desk" data-add-date="${escapeAttribute(formatDateOnly(lead.addDate) || lead.addDate || "")}" data-carrier-operation="${escapeAttribute(lead.carrierOperation || "")}" data-power-units="${escapeAttribute(lead.powerUnits ?? "")}" data-drivers="${escapeAttribute(lead.drivers ?? "")}">
          <i class="bi bi-info"></i>
        </button>
      </td>
      <td>${escapeHtml(lead.dotNumber)}</td>
      <td>${escapeHtml(lead.mcNumber || "")}</td>
      <td class="name-cell" title="${escapeAttribute(lead.carrierName)}">${escapeHtml(lead.carrierName)}</td>
      <td>${escapeHtml(lead.city || "")}</td>
      <td>${escapeHtml(lead.state)}</td>
      <td>${escapeHtml(lead.companyRep || "")}</td>
      <td>${escapeHtml(lead.phone || "")}</td>
      <td>${escapeHtml(lead.cellPhone || "")}</td>
      <td class="email-cell" title="${escapeAttribute(lead.email || "")}">${renderEmailLink(lead.email)}</td>
      <td>${escapeHtml(lead.addDate)}</td>
      <td>${escapeHtml(formatCarrierOperation(lead.carrierOperation))}</td>
      <td>${escapeHtml(lead.powerUnits)}</td>
      <td>${escapeHtml(lead.drivers)}</td>
    </tr>
  `).join("");
  resetSelectAll("newVentureSelectAll");
  updateSelectedRecordCount();
}

function resetSelectAll(selectAllId) {
  const checkbox = document.getElementById(selectAllId);
  if (!checkbox) return;
  checkbox.checked = false;
  checkbox.indeterminate = false;
}

function updateSelectedRecordCount() {
  const selectedCount = document.querySelectorAll(".lead-row-checkbox:checked").length;
  setText("selectedRecordsCount", `Records Selected: ${selectedCount}`);
}

function setVisibleRowsChecked(rowSelector, checked) {
  document.querySelectorAll(rowSelector).forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateSelectedRecordCount();
}

function updateSelectAllState(selectAllId, rowSelector) {
  const selectAll = document.getElementById(selectAllId);
  if (!selectAll) return;

  const checkboxes = [...document.querySelectorAll(rowSelector)];
  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  updateSelectedRecordCount();
}

function getCheckedRows(rowSelector, sourceRows) {
  return [...document.querySelectorAll(rowSelector)]
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => sourceRows[parseInt(checkbox.dataset.index, 10)])
    .filter(Boolean);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportCheckedProspectLeads(exportButton) {
  const selected = getCheckedRows(".prospect-row-checkbox", state.prospectLeads);
  if (!selected.length) {
    throw new Error("Check at least one renewal carrier before exporting.");
  }

  await API.claimExportQuota({
    exportType: "renewal-selected",
    recordCount: selected.length
  });

  const headers = [
    "DOT",
    "Docket No",
    "Legal Name",
    "City",
    "State",
    "Company Rep1",
    "Phone",
    "Cell Phone",
    "Email",
    "Policy Date",
    "Ins. Carrier",
    "No. PU",
    "Alerts"
  ];
  const rows = selected.map((lead) => ({
    "DOT": lead.dot_number || "",
    "Docket No": lead.mc_number || lead.mc || "",
    "Legal Name": lead.carrier_name || "",
    "City": lead.hq_city || "",
    "State": lead.hq_state || "",
    "Company Rep1": lead.company_rep || "",
    "Phone": lead.phone || "",
    "Cell Phone": lead.cell_phone || "",
    "Email": lead.email || "",
    "Policy Date": formatDateOnly(lead.insurance_expiration),
    "Ins. Carrier": lead.insurance_company || "",
    "No. PU": lead.vehicle_count ?? "",
    "Alerts": lead.alerts ?? "0"
  }));

  downloadCsv(`renewal-leads-selected-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  showSuccess(`Exported ${selected.length} selected renewal lead${selected.length === 1 ? "" : "s"}. ${exportQuotaMessage()}`, exportButton);
}

async function exportCheckedNewVentureLeads(exportButton) {
  const selected = getCheckedRows(".new-venture-row-checkbox", state.newVentureLeads);
  if (!selected.length) {
    throw new Error("Check at least one new venture carrier before exporting.");
  }

  await API.claimExportQuota({
    exportType: "new-venture-selected",
    recordCount: selected.length
  });

  const headers = [
    "DOT",
    "Docket No",
    "Legal Name",
    "City",
    "State",
    "Company Rep1",
    "Phone",
    "Cell Phone",
    "Email",
    "Added",
    "Operation",
    "No. PU",
    "Drivers"
  ];
  const rows = selected.map((lead) => ({
    "DOT": lead.dotNumber || "",
    "Docket No": lead.mcNumber || "",
    "Legal Name": lead.carrierName || "",
    "City": lead.city || "",
    "State": lead.state || "",
    "Company Rep1": lead.companyRep || "",
    "Phone": lead.phone || "",
    "Cell Phone": lead.cellPhone || "",
    "Email": lead.email || "",
    "Added": lead.addDate || "",
    "Operation": formatCarrierOperation(lead.carrierOperation),
    "No. PU": lead.powerUnits ?? "",
    "Drivers": lead.drivers ?? ""
  }));

  downloadCsv(`new-venture-leads-selected-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  showSuccess(`Exported ${selected.length} selected new venture lead${selected.length === 1 ? "" : "s"}. ${exportQuotaMessage()}`, exportButton);
}

function initResizableLeadTables() {
  document.querySelectorAll("[data-resizable-columns]").forEach((table) => {
    if (table.dataset.resizeReady === "true") return;
    table.dataset.resizeReady = "true";

    const headers = table.querySelectorAll("thead th");
    let colgroup = table.querySelector("colgroup");

    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      headers.forEach((header) => {
        const col = document.createElement("col");
        col.style.width = `${Math.round(header.getBoundingClientRect().width || 100)}px`;
        colgroup.appendChild(col);
      });
      table.insertBefore(colgroup, table.firstChild);
    }

    headers.forEach((header, index) => {
      const col = colgroup.children[index];
      if (!col || header.querySelector(".sheet-col-resizer")) return;

      const handle = document.createElement("span");
      handle.className = "sheet-col-resizer";
      handle.title = "Drag to resize column";
      header.appendChild(handle);

      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = parseFloat(col.style.width) || header.getBoundingClientRect().width;
        handle.classList.add("active");
        document.body.classList.add("sheet-column-resizing");

        function onMove(moveEvent) {
          const nextWidth = Math.max(44, Math.min(720, startWidth + moveEvent.clientX - startX));
          col.style.width = `${Math.round(nextWidth)}px`;
        }

        function onUp() {
          handle.classList.remove("active");
          document.body.classList.remove("sheet-column-resizing");
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    });
  });
}

function applySubscriptionUiControls() {
  const plan = getCurrentPlan();
  const windowDays = getPlanRenewalWindowDays();
  const summary = document.getElementById("prospectReportSummary");
  const newVentureSummary = document.getElementById("newVentureSummary");
  const renewalTabButton = document.getElementById("renewal-tab");
  const exportButtons = [
    document.getElementById("exportProspectsBtn"),
    document.getElementById("exportNewVenturesBtn"),
    document.getElementById("sheetTopExportBtn")
  ].filter(Boolean);

  if (summary) {
    summary.textContent = plan === "premium"
      ? "Agency Unlimited: search any lead type in any state."
      : plan === "pro"
        ? "Pro: choose one state, then search renewals and new DOT leads."
        : "Starter: choose one state, then search new DOT leads and basic renewals.";
  }

  if (newVentureSummary) {
    newVentureSummary.textContent = plan === "premium"
      ? "Choose a state or leave all states selected, then search new DOT leads."
      : "Choose your state, then search new DOT leads.";
  }

  if (plan === "basic" && renewalTabButton) {
    renewalTabButton.disabled = false;
    renewalTabButton.title = "Starter includes renewal leads in the next 30 days.";
  }

  if (!canUseAdvancedFilters()) {
    const advancedControls = [
      document.getElementById("minFleetSize"),
      document.getElementById("prospectEmailFilter")
    ].filter(Boolean);

    advancedControls.forEach((control) => {
      control.disabled = true;
      control.title = "Upgrade to Pro or Agency Unlimited to use advanced renewal filters.";
      const field = control.closest(".filter-field");
      if (field && !field.querySelector(".upgrade-field-note")) {
        const note = document.createElement("div");
        note.className = "upgrade-field-note";
        note.textContent = "State+";
        field.appendChild(note);
      }
    });
  }

  const renewalMonth = document.getElementById("renewalMonth");
  if (renewalMonth && windowDays) {
    renewalMonth.title = plan === "basic"
      ? "Starter includes renewal leads in the next 30 days."
      : "Choose the renewal month you want to call.";
  }

  const { limit, remaining } = getCurrentExportQuota();
  const exportLimitReached = limit !== null && remaining !== null && remaining <= 0;
  exportButtons.forEach((button) => {
    button.disabled = exportLimitReached;
    button.title = exportLimitReached
      ? `${getPlanLeadLabel()} monthly export limit reached. Upgrade or wait until next month to export more records.`
      : exportQuotaMessage();
  });
}

function formatDateOnly(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function formatCarrierOperation(value) {
  const operations = {
    A: "Interstate",
    B: "Intrastate Hazmat",
    C: "Intrastate Non-Hazmat"
  };
  return operations[value] || value || "";
}

function formatSafetyRating(value) {
  const ratings = {
    S: "Satisfactory",
    C: "Conditional",
    U: "Unsatisfactory"
  };
  return ratings[value] || value || "";
}

function normalizeSafetyRating(value) {
  return String(formatSafetyRating(value) || "Unknown").trim().toUpperCase();
}

function getSafetyRatingMeta(value) {
  const rating = normalizeSafetyRating(value);

  if (rating.includes("SATISFACTORY")) {
    return {
      label: "Satisfactory",
      badgeClass: "safety-good",
      panelClass: "safety-panel-good",
      summary: "Favorable public safety rating. Still confirm recent inspections, violations, and loss history."
    };
  }

  if (rating.includes("CONDITIONAL")) {
    return {
      label: "Conditional",
      badgeClass: "safety-watch",
      panelClass: "safety-panel-watch",
      summary: "Needs underwriting review. Ask what corrective actions are in place before quoting."
    };
  }

  if (rating.includes("UNSATISFACTORY")) {
    return {
      label: "Unsatisfactory",
      badgeClass: "safety-danger",
      panelClass: "safety-panel-danger",
      summary: "High-risk safety signal. Review authority status, corrective action, and market appetite carefully."
    };
  }

  if (rating.includes("INACTIVE")) {
    return {
      label: "Inactive",
      badgeClass: "safety-danger",
      panelClass: "safety-panel-danger",
      summary: "FMCSA SMS reports this DOT as inactive at the last SMS update. Treat this as a high-priority compliance check before outreach."
    };
  }

  if (rating.includes("NOT RATED") || rating === "NONE" || rating === "UNKNOWN") {
    return {
      label: rating.includes("NOT RATED") || rating === "NONE" ? "No Federal Rating" : "Unknown",
      badgeClass: "safety-neutral",
      panelClass: "safety-panel-neutral",
      summary: "FMCSA does not show a federal safety rating for this carrier. Use inspections, OOS rates, crashes, and DOT history to qualify the risk."
    };
  }

  return {
    label: formatSafetyRating(value) || "Unknown",
    badgeClass: "safety-neutral",
    panelClass: "safety-panel-neutral",
    summary: "Review public safety details and recent DOT activity before outreach."
  };
}

function renderSafetyBadge(value) {
  const meta = getSafetyRatingMeta(value);
  return `<span class="safety-rating-badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span>`;
}

function renderCarrierSourceLinks(dot) {
  if (!dot) return "";

  const encodedDot = encodeURIComponent(dot);
  const saferUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodedDot}`;
  const smsUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${encodedDot}/CompleteProfile.aspx`;

  return `
    <a class="carrier-source-link" href="${saferUrl}" target="_blank" rel="noopener noreferrer">
      <i class="bi bi-box-arrow-up-right"></i> View SAFER (Legacy)
    </a>
    <a class="carrier-source-link" href="${smsUrl}" target="_blank" rel="noopener noreferrer">
      <i class="bi bi-box-arrow-up-right"></i> View SMS
    </a>
    <a class="carrier-source-link" href="${MOTUS_PORTAL_URL}" target="_blank" rel="noopener noreferrer">
      <i class="bi bi-box-arrow-up-right"></i> View Motus
    </a>
  `;
}

function renderCarrierProfileLink(dot) {
  if (!dot) return "";
  return `
    <a class="carrier-source-link primary-profile-link" href="carrier-profile.html?dot=${encodeURIComponent(dot)}">
      <i class="bi bi-person-vcard"></i> Full Profile
    </a>
  `;
}

function renderCrashBreakdown(crashes) {
  if (!crashes) return "";

  const fatal = crashes.fatal ?? "0";
  const injury = crashes.injury ?? "0";
  const tow = crashes.tow ?? "0";
  const total = crashes.total ?? "0";

  return `
    <div class="carrier-crash-panel">
      <div>
        <span class="analytics-field-label">SAFER Crashes - 24 Months</span>
        <strong>${escapeHtml(total)} total</strong>
        <p>Reportable crashes show carrier involvement only. FMCSA does not assign fault in this table.</p>
      </div>
      <div class="carrier-crash-grid">
        <div><span>Fatal</span><strong>${escapeHtml(fatal)}</strong></div>
        <div><span>Injury</span><strong>${escapeHtml(injury)}</strong></div>
        <div><span>Tow</span><strong>${escapeHtml(tow)}</strong></div>
        <div><span>Total</span><strong>${escapeHtml(total)}</strong></div>
      </div>
    </div>
  `;
}

function renderValueList(values) {
  const cleanValues = (values || []).filter(Boolean);
  if (!cleanValues.length) return `<span class="empty-inline">Not available</span>`;

  return cleanValues.map(value => `<span class="source-pill">${escapeHtml(value)}</span>`).join("");
}

function renderRecentInspections(inspections = []) {
  if (!inspections.length) return `<p class="muted-note mb-0">No recent inspection rows were available for this carrier.</p>`;

  return `
    <div class="mini-table-wrap">
      <table class="mini-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>State</th>
            <th>Level</th>
            <th>Violations</th>
            <th>OOS</th>
          </tr>
        </thead>
        <tbody>
          ${inspections.slice(0, 8).map(row => `
            <tr>
              <td>${escapeHtml(row.date)}</td>
              <td>${escapeHtml(row.state)}</td>
              <td>${escapeHtml(row.level)}</td>
              <td>${escapeHtml(row.violations ?? "0")}</td>
              <td>${escapeHtml(row.outOfService ?? "0")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCarrierProfileData(profile = {}) {
  if (!profile || !profile.detailUrl) return "";

  const safety = profile.safetyPerformance || {};
  const violations = profile.violationBreakdown || {};
  const insurance = profile.insurance || {};
  const contact = profile.contactInfo || {};
  const authority = profile.authority || {};
  const business = profile.businessDetails || {};
  const fleet = profile.fleetBreakdown?.trucks || {};

  return `
    <div class="carrier-rich-profile">
      <div class="carrier-rich-header">
        <div>
          <span class="analytics-field-label">Enhanced Carrier Profile</span>
          <strong>Expanded FMCSA Carrier Data</strong>
          <p>${escapeHtml(profile.overview || "Expanded FMCSA-derived profile details were found for this carrier.")}</p>
        </div>
      </div>

      <div class="carrier-rich-grid">
        <div><span>Trust Score</span><strong>${escapeHtml(profile.trustScore ? `${profile.trustScore}/100` : "Not available")}</strong><small>${escapeHtml(profile.trustLabel || "")}</small></div>
        <div><span>Safety Grade</span><strong>${escapeHtml(safety.grade || "Not available")}</strong><small>${escapeHtml(safety.gradeSummary || safety.gradeLabel || "")}</small></div>
        <div><span>Authority Age</span><strong>${escapeHtml(profile.authorityAge || authority.authoritySince || "Not available")}</strong><small>${escapeHtml(authority.status || profile.status || "")}</small></div>
        <div><span>OOS Orders</span><strong>${escapeHtml(safety.outOfServiceOrders ?? "Not available")}</strong><small>${escapeHtml(violations.overallOutOfServiceRate ? `Overall OOS ${violations.overallOutOfServiceRate}` : "")}</small></div>
        <div><span>Violations</span><strong>${escapeHtml(safety.violations ?? violations.totalViolations ?? "Not available")}</strong><small>${escapeHtml(`${violations.driverViolations ?? 0} driver / ${violations.vehicleViolations ?? 0} vehicle`)}</small></div>
        <div><span>Insurance</span><strong>${escapeHtml(insurance.bipdCoverage || "Not available")}</strong><small>${escapeHtml(insurance.bipdCompany || "")}</small></div>
      </div>

      <div class="carrier-rich-section">
        <span class="analytics-field-label">Equipment & Cargo</span>
        <div class="source-list">${renderValueList(profile.equipmentTypes)}</div>
        <p class="muted-note">Cargo: ${escapeHtml((profile.cargoTypes || []).join(", ") || "Not available")} - Operations: ${escapeHtml(profile.operationsScope || "Not available")} - Mileage: ${escapeHtml(profile.mcs150Mileage || "Not available")}</p>
      </div>

      <div class="carrier-rich-grid compact">
        <div><span>Owned Trucks</span><strong>${escapeHtml(fleet.owned ?? "0")}</strong></div>
        <div><span>Term Leased</span><strong>${escapeHtml(fleet.termLeased ?? "0")}</strong></div>
        <div><span>Trip Leased</span><strong>${escapeHtml(fleet.tripLeased ?? "0")}</strong></div>
        <div><span>Fleet Class</span><strong>${escapeHtml(profile.fleetBreakdown?.classification || business.fleetSize || "Not available")}</strong></div>
      </div>

      <div class="carrier-rich-section">
        <span class="analytics-field-label">Out-of-Service vs National Average</span>
        <div class="carrier-rich-grid compact">
          <div><span>Driver OOS</span><strong>${escapeHtml(safety.driverOosRate || "Not available")}</strong><small>Nat'l avg ${escapeHtml(safety.driverOosNationalAverage || "N/A")}</small></div>
          <div><span>Driver Comparison</span><strong>${escapeHtml(safety.driverOosComparison || "Not available")}</strong></div>
          <div><span>Vehicle OOS</span><strong>${escapeHtml(safety.vehicleOosRate || "Not available")}</strong><small>Nat'l avg ${escapeHtml(safety.vehicleOosNationalAverage || "N/A")}</small></div>
          <div><span>Vehicle Comparison</span><strong>${escapeHtml(safety.vehicleOosComparison || "Not available")}</strong></div>
        </div>
      </div>

      <div class="carrier-rich-section">
        <span class="analytics-field-label">Recent Inspections</span>
        ${renderRecentInspections(profile.inspectionHistory)}
      </div>

      <div class="carrier-rich-grid">
        <div><span>Physical Address</span><strong>${escapeHtml(contact.address || "Not available")}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(contact.phone || "Not available")}</strong><small>${escapeHtml(contact.cellPhone ? `Cell ${contact.cellPhone}` : "")}</small></div>
        <div><span>Email</span><strong>${renderEmailLink(contact.email, "Not available")}</strong></div>
        <div><span>Company Officers</span><strong>${escapeHtml([contact.companyOfficer, contact.companyOfficer2].filter(Boolean).join(" / ") || "Not available")}</strong></div>
        <div><span>Authority Since</span><strong>${escapeHtml(authority.authoritySince || "Not available")}</strong><small>${escapeHtml(authority.mcStatus || "")}</small></div>
        <div><span>Business Details</span><strong>${escapeHtml(business.carrierType || "Not available")}</strong><small>Hazmat ${escapeHtml(business.hazmat || "N/A")} - Passenger ${escapeHtml(business.passengerCarrier || "N/A")}</small></div>
      </div>
    </div>
  `;
}

function percentNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function safetyToneFromText(value) {
  const text = String(value || "").toLowerCase();
  if (!text || text.includes("not") || text.includes("unknown")) return "neutral";
  if (text.includes("alert") || text.includes("unsat") || text.includes("inactive") || text.includes("high")) return "bad";
  if (text.includes("conditional") || text.includes("moderate") || text.includes("review")) return "warn";
  return "good";
}

function meterColor(className) {
  if (className === "high" || className === "bad") return "#ef4444";
  if (className === "medium" || className === "warn") return "#f59e0b";
  return "#1565FF";
}

function oosClass(value) {
  const pct = percentNumber(value);
  if (pct === null) return "low";
  if (pct >= 25) return "high";
  if (pct >= 15) return "medium";
  return "low";
}

function safetyMetricCard(value, label, width = 35, tone = "low") {
  const color = meterColor(tone);
  return `
    <div class="safety-score-card">
      <strong>${escapeHtml(value || "Not available")}</strong>
      <span>${escapeHtml(label)}</span>
      <div class="safety-meter"><i style="--width:${Math.max(8, Math.min(width, 100))}%;--meter-color:${color};"></i></div>
    </div>
  `;
}

function renderSafetyVisuals(profile = {}) {
  const inspectionCount = Number(profile.totalInspections || 0);
  const crashCount = Number(profile.crashTotal || profile.crashes?.total || 0);
  const ratingTone = safetyToneFromText(profile.safetyRating);
  const categories = profile.safetyCategories || {};
  const chips = [
    ["Unsafe Driving", categories.unsafeDriving],
    ["Hours of Service", categories.hoursOfService],
    ["Driver Fitness", categories.driverFitness],
    ["Controlled Substances", categories.controlledSubstances],
    ["Vehicle Maintenance", categories.vehicleMaintenance],
    ["Hazmat", categories.hazmat]
  ];

  return `
    <div class="safety-visual-grid">
      ${safetyMetricCard(profile.safetyRating || "Not rated", "SMS Safety Rating", ratingTone === "bad" ? 88 : ratingTone === "warn" ? 62 : 36, ratingTone)}
      ${safetyMetricCard(profile.totalInspections || "Not available", "Inspection History", Math.min(100, inspectionCount * 6 || 18), "low")}
      ${safetyMetricCard(profile.crashTotal || profile.crashes?.total || "Not available", "Crash Indicator", Math.min(100, crashCount * 18 || 12), crashCount > 1 ? "high" : crashCount === 1 ? "medium" : "low")}
    </div>
    <div class="safety-chip-row">
      ${chips.map(([label, value]) => `<span class="safety-chip ${safetyToneFromText(value)}">${escapeHtml(label)}: ${escapeHtml(value || "Not available")}</span>`).join("")}
    </div>
  `;
}

function renderOosRateRows(oosRates = {}) {
  const rows = [
    ["Vehicle OOS rate", oosRates.vehicle],
    ["Driver OOS rate", oosRates.driver],
    ["Hazmat OOS rate", oosRates.hazmat]
  ];

  const html = rows.map(([label, rate]) => {
    const carrierRate = rate?.carrier ? `${rate.carrier}%` : "Not available";
    const nationalAverage = rate?.nationalAverage ? `${rate.nationalAverage}%` : "Not available";
    const pct = percentNumber(rate?.carrier);
    const tone = oosClass(rate?.carrier);
    return `
      <div class="oos-rate-row ${tone}">
        <strong>${escapeHtml(label)}</strong>
        <span>Carrier: ${escapeHtml(carrierRate)}</span>
        <span>National avg: ${escapeHtml(nationalAverage)}</span>
        <div class="oos-meter"><i style="--width:${Math.max(6, Math.min(pct || 0, 100))}%;--meter-color:${meterColor(tone)};"></i></div>
      </div>
    `;
  }).join("");

  return `<div class="oos-rate-list">${html}</div>`;
}

function formatOosRate(value) {
  if (value === undefined || value === null || value === "") return "Not available";
  const numericValue = Number(String(value).replace("%", ""));
  if (Number.isNaN(numericValue)) return String(value);
  return `${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 1)}%`;
}

function renderInsuranceAlerts(data) {
  const container = document.getElementById("insuranceAlertsContainer");
  if (!container) return;

  if (!data || !data.carriers || data.carriers.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info mb-0">
        <strong>All Clear!</strong> No carriers with expiring insurance in the next 90 days.
      </div>
    `;
    return;
  }

  let html = `
    <div class="alert-group">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="mb-0"><strong>Insurance Expiration Summary</strong></h6>
        <span class="badge bg-danger">${escapeHtml(data.total)}</span>
      </div>
  `;

  if (data.summary) {
    html += `
      <div class="d-flex gap-2 mb-3 flex-wrap">
        ${data.summary.expired > 0 ? `<span class="badge bg-dark">Expired: ${escapeHtml(data.summary.expired)}</span>` : ""}
        ${data.summary.expiringSoon > 0 ? `<span class="badge bg-danger">0-30 days: ${escapeHtml(data.summary.expiringSoon)}</span>` : ""}
        ${data.summary.expiring31_60 > 0 ? `<span class="badge bg-warning text-dark">31-60 days: ${escapeHtml(data.summary.expiring31_60)}</span>` : ""}
        ${data.summary.expiring61_90 > 0 ? `<span class="badge bg-info">61-90 days: ${escapeHtml(data.summary.expiring61_90)}</span>` : ""}
      </div>
    `;
  }

  html += `<div style="max-height: 300px; overflow-y: auto;">`;

  data.carriers.forEach((carrier) => {
    let alertClass = "alert-danger";
    let label = "Alert";

    if (carrier.expiration_status === "Expired") {
      alertClass = "alert-dark";
      label = "Expired";
    } else if (carrier.expiration_status === "Expiring Soon (0-30 days)") {
      alertClass = "alert-danger";
      label = "Urgent";
    } else if (carrier.expiration_status === "Expiring (31-60 days)") {
      alertClass = "alert-warning";
      label = "Soon";
    } else {
      alertClass = "alert-info";
      label = "Upcoming";
    }

    html += `
      <div class="alert alert-sm ${alertClass} d-flex justify-content-between align-items-center mb-2" style="padding: 0.5rem 0.75rem; font-size: 0.9rem;">
        <div>
          <strong>${label}: ${escapeHtml(carrier.carrier_name)}</strong>
          <br>
          <small>DOT: ${escapeHtml(carrier.dot)} | MC: ${escapeHtml(carrier.mc)}</small>
          <br>
          <small>Expires: ${escapeHtml(carrier.insurance_expiration)} (${escapeHtml(carrier.days_until_expiration)} days)</small>
        </div>
        <span class="badge ${alertClass === "alert-dark" ? "bg-secondary" : alertClass.replace("alert-", "bg-")}">
          ${escapeHtml(carrier.expiration_status)}
        </span>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

function renderLeadsTable() {
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (state.leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center small text-muted py-3">
          No leads saved yet. Search a carrier and click "Save as Lead".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  state.leads.forEach((lead, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(lead.carrier_name)}</td>
      <td>${escapeHtml(lead.dot)}</td>
      <td>${escapeHtml(lead.mc)}</td>
      <td>
        <select class="form-select form-select-sm lead-status-select" data-index="${index}">
          <option value="New" ${lead.status === "New" ? "selected" : ""}>New</option>
          <option value="Contacted" ${lead.status === "Contacted" ? "selected" : ""}>Contacted</option>
          <option value="Quoted" ${lead.status === "Quoted" ? "selected" : ""}>Quoted</option>
          <option value="Won" ${lead.status === "Won" ? "selected" : ""}>Won</option>
          <option value="Lost" ${lead.status === "Lost" ? "selected" : ""}>Lost</option>
        </select>
      </td>
      <td>
        <input type="date" class="form-control form-control-sm lead-date-input" data-index="${index}" value="${escapeAttribute(lead.last_contact)}" />
      </td>
      <td>
        <input type="date" class="form-control form-control-sm lead-insurance-input" data-index="${index}" title="Insurance Expiration" value="${escapeAttribute(lead.insurance_expiration)}" />
      </td>
      <td>
        <button class="btn btn-outline-secondary btn-sm lead-notes-btn" data-index="${index}" data-bs-toggle="modal" data-bs-target="#notesModal">
          ${lead.notes && lead.notes.trim() !== "" ? "View / Edit" : "Add"}
        </button>
      </td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm lead-delete-btn" data-index="${index}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateLead(index, updates) {
  const lead = state.leads[index];
  if (!lead || !lead.id) return;

  try {
    await API.updateLead(lead.id, updates);
  } catch (err) {
    console.warn("Could not update lead on backend:", err.message);
  }
}

async function deleteLead(index) {
  const lead = state.leads[index];
  if (!lead) return;

  if (lead.id) {
    try {
      await API.deleteLead(lead.id);
    } catch (err) {
      console.warn("Could not delete lead on backend:", err.message);
    }
  }

  state.leads.splice(index, 1);
  renderLeadsTable();
}

function renderContactInfo(carrier) {
  const panel = document.getElementById("contactInfoPanel");
  if (!panel) return;

  if (!carrier || !canUseCrm() || carrier.access?.canViewContacts === false) {
    panel.style.display = "none";
    setText("dataCompleteness", "0%");
    return;
  }

  const profile = normalizeCarrierProfile(carrier);
  const email = profile.email || "Not available";
  const phone = firstMeaningfulValue(profile.phone, profile.cellPhone, "Not available");
  const address = profile.physicalAddress || "Not available";
  const website = profile.website || "Not available";
  const fields = [profile.email, phone, address, profile.website];
  const completedFields = fields.filter((value) => value && String(value).trim()).length;
  const completeness = Math.round((completedFields / fields.length) * 100);

  setEmailLink("contactEmail", email);
  setText("contactPhone", phone);
  setText("contactAddress", address);
  setText("contactWebsite", website);
  setText("dataCompleteness", `${completeness}%`);
  setText("modalCarrierName", profile.carrierName || "Carrier Name");
  setEmailLink("modalEmail", email);
  setText("modalPhone", phone);
  setText("modalAddress", address);
  setText("modalWebsite", website);
  setText("modalQuality", `${completeness}% complete`);

  const completenessBar = document.getElementById("completenessBar");
  if (completenessBar) {
    completenessBar.style.width = `${completeness}%`;
    completenessBar.setAttribute("aria-valuenow", String(completeness));
  }

  panel.style.display = "block";
}

function canUseCarrierIntelligence() {
  const status = String(API.getCurrentUser()?.subscription_status || "").toLowerCase();
  return getCurrentPlan() === "premium" && (IS_LOCAL_DEV || ["active", "trialing"].includes(status));
}

function numberValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function daysUntilDate(value) {
  const formatted = formatDateOnly(value) || String(value || "").trim();
  if (!formatted) return null;

  const date = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function daysSinceDate(value) {
  const formatted = formatDateOnly(value) || String(value || "").trim();
  if (!formatted) return null;

  const date = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / 86400000);
}

function describeAgeSince(value) {
  const formatted = formatDateOnly(value);
  if (!formatted || !/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return "";

  const date = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  let months = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) return "";

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years <= 0) return `${remainingMonths || 1} month${remainingMonths === 1 ? "" : "s"}`;
  return `${years} year${years === 1 ? "" : "s"}${remainingMonths ? `, ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}` : ""}`;
}

function compactElapsedLabel(days) {
  if (days === null || days === undefined || days < 0) return "";
  if (days <= 60) return `${days}d`;

  if (days < 730) {
    const months = Math.max(1, Math.round(days / 30));
    return `${months}mo`;
  }

  const years = Math.round((days / 365) * 10) / 10;
  return `${String(years).replace(/\.0$/, "")}y`;
}

function classifyAuthorityStatus(...values) {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("not authorized")) return "not-authorized";
  if (text.includes("inactive")) return "inactive";
  if (text.includes("revoked") || text.includes("out of service")) return "out-of-service";

  if (text.includes("private property") || text.includes("intrastate")) {
    if (
      text.includes("authorized for hire") ||
      text.includes("authorized for property") ||
      text.includes("for hire") ||
      text.includes("common") ||
      text.includes("contract") ||
      text.includes("exempt for hire")
    ) {
      return "authorized";
    }
    return "private";
  }

  if (
    text.includes("authorized") ||
    text.includes("for hire") ||
    text.includes("common") ||
    text.includes("contract") ||
    text.includes("exempt for hire")
  ) {
    return "authorized";
  }

  return "unknown";
}

function joinNaturalLanguage(items = []) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function timingLabel(days) {
  if (days === null) return "No renewal date";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Renews today";
  return `Renews in ${days}d`;
}

function newVentureTimingLabel(days) {
  if (days === null) return "New venture";
  if (days <= 30) return `New venture ${days}d`;
  return `New venture ${compactElapsedLabel(days)}`;
}

function classifyEmailType(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "none";

  const domain = email.split("@")[1];
  const freeDomains = [
    "aol.com",
    "gmail.com",
    "hotmail.com",
    "icloud.com",
    "live.com",
    "msn.com",
    "outlook.com",
    "yahoo.com"
  ];
  return freeDomains.includes(domain) ? "consumer" : "business";
}

function addIntelligenceTag(tags, label, tone = "neutral") {
  if (!label || tags.some((tag) => tag.label === label)) return;
  tags.push({ label, tone });
}

function formatPercentComparison(value, benchmark) {
  if (value === null) return "";
  if (benchmark === null) return formatOosRate(value);
  return `${formatOosRate(value)} vs ${formatOosRate(benchmark)} national`;
}

function getMcs150Freshness(value) {
  const days = daysSinceDate(value);
  if (days === null) {
    return {
      ageText: "",
      bucket: "unknown",
      days: null,
      label: "No MCS-150 date",
      tone: "neutral"
    };
  }

  const ageText = compactElapsedLabel(days);
  if (days <= 400) {
    return {
      ageText,
      bucket: "recent",
      days,
      label: "Fresh MCS-150",
      tone: "good"
    };
  }

  if (days <= 760) {
    return {
      ageText,
      bucket: "current",
      days,
      label: "Current MCS-150",
      tone: "good"
    };
  }

  if (days <= 1095) {
    return {
      ageText,
      bucket: "aging",
      days,
      label: "Aging MCS-150",
      tone: "warn"
    };
  }

  if (days <= 3650) {
    return {
      ageText,
      bucket: "stale",
      days,
      label: "Stale MCS-150",
      tone: "warn"
    };
  }

  return {
    ageText,
    bucket: "very-stale",
    days,
    label: "Very stale MCS-150",
    tone: "bad"
  };
}

function getInsuranceFilingSignals(profile) {
  const filings = Array.isArray(profile.insurance?.filings) ? profile.insurance.filings : [];
  const currentFilings = filings.filter((filing) => /current/i.test(String(filing.statusLabel || "")));
  const coverageTypes = uniqueValues(
    filings.map((filing) => firstMeaningfulValue(filing.insuranceType, filing.formCode, "")).filter(Boolean)
  );
  const latestFiledDate = firstMeaningfulValue(
    ...filings.map((filing) => formatDateOnly(filing.transactionDate || filing.insuranceEffectiveDate)),
    formatDateOnly(profile.insurance?.effectiveDate)
  );
  const latestFiledDays = latestFiledDate ? daysSinceDate(latestFiledDate) : null;

  return {
    coverageTypes,
    currentFilings,
    currentFilingCount: currentFilings.length,
    filings,
    hasCargoFiling: coverageTypes.some((item) => /cargo/i.test(item)),
    hasCurrentFiling: currentFilings.length > 0,
    hasInsuranceSignal:
      currentFilings.length > 0 ||
      isMeaningfulValue(profile.insurance?.company) ||
      isMeaningfulValue(profile.insurance?.coverageInfo),
    hasLiabilityFiling: coverageTypes.some((item) => /bipd|primary|liability/i.test(item)),
    hasSuretyFiling: coverageTypes.some((item) => /surety/i.test(item)),
    latestFiledDate: latestFiledDate || "",
    latestFiledDays
  };
}

function getCarrierTimingLabel(renewalDays, mcs150Freshness, insuranceSignals, authorityClass, workflow = {}) {
  const workflowContext = readCarrierWorkflowContext(workflow);
  const newVentureDays = workflowContext.addDate ? daysSinceDate(workflowContext.addDate) : null;

  if (workflowContext.leadType === "new-venture" && newVentureDays !== null) {
    return newVentureTimingLabel(newVentureDays);
  }

  if (renewalDays !== null) return timingLabel(renewalDays);
  if (mcs150Freshness.bucket === "very-stale" || mcs150Freshness.bucket === "stale") return mcs150Freshness.label;
  if (insuranceSignals.hasCurrentFiling) return "Current filing on record";
  if (authorityClass === "inactive") return "Inactive record";
  if (authorityClass === "not-authorized") return "Authority not active";
  return "No public renewal date";
}

function setHtml(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = value;
  }
}

function setIntelligenceTags(tags = []) {
  const fallback = `<span class="intelligence-tag neutral">Awaiting carrier data</span>`;
  const html = tags.length
    ? tags.map((tag) => `<span class="intelligence-tag ${escapeAttribute(tag.tone || "neutral")}">${escapeHtml(tag.label)}</span>`).join("")
    : fallback;
  setHtml("intelligenceTags", html);
}

function applyCarrierIntelligenceSnapshot(snapshot) {
  setText("intelligenceHeadline", snapshot.headline);
  setText("intelligenceSummary", snapshot.summary);
  setText("intelligenceSignalScore", snapshot.signalScore);
  setText("intelligenceRiskHeat", snapshot.riskHeat);
  setText("intelligenceTiming", snapshot.timing);
  setText("intelligenceProspectFit", snapshot.prospectFit);
  setText("intelligenceSafetyIssues", snapshot.safetyIssues);
  setText("intelligenceCoverage", snapshot.coverage);
  setText("intelligenceQuestions", snapshot.questions);
  setText("intelligenceUrgency", snapshot.urgency);
  setText("intelligenceAngle", snapshot.angle);
  setText("intelligenceConfidence", snapshot.confidence);
  setText("intelligenceOpener", snapshot.opener);
  setText("intelligenceFootnote", snapshot.footnote);
  setIntelligenceTags(snapshot.tags);
}

function buildCarrierIntelligenceSnapshot(carrier) {
  const profile = normalizeCarrierProfile(carrier);
  const workflow = profile.workflow || {};
  const fleetSize = numberValue(profile.fleetSize);
  const driverCount = numberValue(profile.drivers);
  const crashCount = numberValue(profile.crashTotal || profile.crashes?.total) || 0;
  const vehicleOos = percentNumber(profile.oosRates.vehicle?.carrier);
  const vehicleOosNational = percentNumber(profile.oosRates.vehicle?.nationalAverage);
  const driverOos = percentNumber(profile.oosRates.driver?.carrier);
  const driverOosNational = percentNumber(profile.oosRates.driver?.nationalAverage);
  const renewalDays = workflow.daysUntilExpiration ?? daysUntilDate(profile.insurance.expirationDate);
  const cargoList = profile.cargoList || [];
  const authorityClass = classifyAuthorityStatus(profile.authorityStatus, profile.operatingStatus, profile.operationsScope);
  const activeAuthority = authorityClass === "authorized";
  const safetyRatingText = normalizeSafetyRating(profile.safetyRating);
  const hasHazmatCargo = cargoList.some((item) => /hazmat|chemical|flammable|liquids\/gases/i.test(item)) || /yes/i.test(String(profile.hazmat || ""));
  const refrigeratedCargo = cargoList.some((item) => /refriger|produce|meat|temperature/i.test(item));
  const isRenewalLead = workflow.leadType === "renewal" || renewalDays !== null;
  const workflowNewVentureDays = workflow.newVentureDate ? daysSinceDate(workflow.newVentureDate) : null;
  const authoritySinceDays = daysSinceDate(profile.authoritySince);
  const mcs150Days = daysSinceDate(profile.mcs150Date);
  const startupAgeDays = workflowNewVentureDays !== null
    ? workflowNewVentureDays
    : authoritySinceDays !== null && authoritySinceDays <= 365
      ? authoritySinceDays
      : mcs150Days !== null && mcs150Days <= 365
        ? mcs150Days
        : null;
  const isNewVentureLead = workflow.leadType === "new-venture" || (activeAuthority && startupAgeDays !== null && startupAgeDays <= 365);
  const freshNewVenture = startupAgeDays !== null && startupAgeDays <= 180;
  const newVentureLabel = startupAgeDays !== null ? newVentureTimingLabel(startupAgeDays) : "New venture";
  const insuranceSignals = getInsuranceFilingSignals(profile);
  const mcs150Freshness = getMcs150Freshness(profile.mcs150Date);
  const mcs150Mileage = numberValue(profile.mcs150Mileage);
  const lowReportedMileage = mcs150Mileage !== null && mcs150Mileage <= 1000;
  const emailType = classifyEmailType(profile.email);
  const contactSignals = [profile.email, profile.phone, profile.companyOfficer1, profile.physicalAddress, profile.website];
  const contactCompleteness = Math.round((contactSignals.filter(isMeaningfulValue).length / contactSignals.length) * 100);
  const sourceCount = profile.dataSources?.length || 0;
  const hasCargo = cargoList.length > 0;
  const hasDecisionMaker = isMeaningfulValue(profile.companyOfficer1) && profile.companyOfficer1 !== "Not listed";

  let score = 50;
  const positives = [];
  const cautions = [];
  const tags = [];

  if (authorityClass === "authorized") {
    score += 14;
    positives.push("authority appears active for live insurance outreach");
    addIntelligenceTag(tags, "Active authority", "good");
  } else if (authorityClass === "private") {
    score -= 5;
    cautions.push("the record points to a private or intrastate operation rather than a standard public for-hire prospect");
    addIntelligenceTag(tags, "Private / intrastate", "warn");
  } else if (authorityClass === "not-authorized") {
    score -= 22;
    cautions.push("the DOT is not currently showing usable for-hire authority, so this is a qualification-first record");
    addIntelligenceTag(tags, "Not authorized", "bad");
  } else if (authorityClass === "inactive") {
    score -= 24;
    cautions.push("the public authority record is inactive, so treat this as dormant or reactivation work first");
    addIntelligenceTag(tags, "Inactive record", "bad");
  } else if (authorityClass === "out-of-service") {
    score -= 28;
    cautions.push("public status suggests the operation may be out of service or revoked");
    addIntelligenceTag(tags, "Out of service", "bad");
  } else {
    score -= 6;
    cautions.push("authority status is still unclear and should be verified before quoting");
    addIntelligenceTag(tags, "Verify authority", "warn");
  }

  if (safetyRatingText.includes("SATISFACTORY")) {
    score += 10;
    positives.push("favorable federal safety rating");
    addIntelligenceTag(tags, "Satisfactory safety", "good");
  } else if (safetyRatingText.includes("CONDITIONAL")) {
    score -= 10;
    cautions.push("conditional safety rating will raise underwriting questions");
    addIntelligenceTag(tags, "Conditional safety", "warn");
  } else if (safetyRatingText.includes("UNSATISFACTORY") || safetyRatingText.includes("INACTIVE")) {
    score -= authorityClass === "inactive" ? 5 : 18;
    cautions.push("public safety status is a major friction point");
    addIntelligenceTag(tags, "High safety friction", "bad");
  } else if (safetyRatingText.includes("NOT RATED")) {
    score -= 2;
    cautions.push("no federal safety rating is published, so inspection and loss history need direct discovery");
    addIntelligenceTag(tags, "Not rated", "neutral");
  } else {
    addIntelligenceTag(tags, "No federal safety rating", "neutral");
  }

  if (renewalDays !== null && renewalDays <= 45 && renewalDays >= 0) {
    score += 10;
    positives.push("renewal timing is close enough for a timely conversation");
    addIntelligenceTag(tags, timingLabel(renewalDays), renewalDays <= 14 ? "warn" : "good");
  } else if (renewalDays !== null && renewalDays <= 90 && renewalDays >= 0) {
    score += 6;
    positives.push("renewal timing is on the near-term calendar");
    addIntelligenceTag(tags, timingLabel(renewalDays), "neutral");
  } else if (renewalDays !== null && renewalDays < 0) {
    score -= 2;
    cautions.push("the expiration date on file has already passed and should be confirmed live");
    addIntelligenceTag(tags, timingLabel(renewalDays), "warn");
  }

  if (workflow.leadType === "renewal") {
    score += 4;
    positives.push("the account surfaced through the renewal workflow, so timing is already part of the sales story");
    addIntelligenceTag(tags, "Renewal desk", renewalDays !== null && renewalDays <= 21 ? "warn" : "good");
  }

  if (isNewVentureLead) {
    score += freshNewVenture ? 5 : 2;
    positives.push("the account is still early enough to shape the insurance structure before the program hardens");
    cautions.push("startup underwriting will turn on owner experience, garaging, planned lanes, and hiring story");
    addIntelligenceTag(tags, newVentureLabel, freshNewVenture ? "good" : "neutral");
    if (workflow.leadType === "new-venture") {
      addIntelligenceTag(tags, "New venture desk", "good");
    }
  }

  if (mcs150Freshness.bucket === "recent") {
    score += 6;
    positives.push("the MCS-150 looks freshly updated");
    addIntelligenceTag(tags, mcs150Freshness.label, "good");
  } else if (mcs150Freshness.bucket === "current") {
    score += 4;
    positives.push("the MCS-150 sits inside a healthy biennial window");
    addIntelligenceTag(tags, mcs150Freshness.label, "good");
  } else if (mcs150Freshness.bucket === "aging") {
    score -= 2;
    cautions.push(`the MCS-150 is getting old${mcs150Freshness.ageText ? ` (${mcs150Freshness.ageText})` : ""}`);
    addIntelligenceTag(tags, mcs150Freshness.label, "warn");
  } else if (mcs150Freshness.bucket === "stale") {
    score -= 8;
    cautions.push(`the MCS-150 is stale${mcs150Freshness.ageText ? ` (${mcs150Freshness.ageText})` : ""}, so the public record may not match current operations`);
    addIntelligenceTag(tags, mcs150Freshness.label, "warn");
  } else if (mcs150Freshness.bucket === "very-stale") {
    score -= 12;
    cautions.push(`the MCS-150 is very stale${mcs150Freshness.ageText ? ` (${mcs150Freshness.ageText})` : ""}, which makes the record unreliable until reconfirmed`);
    addIntelligenceTag(tags, mcs150Freshness.label, "bad");
  }

  if (insuranceSignals.hasCurrentFiling) {
    score += 8;
    positives.push("current public insurance filings are on record");
    addIntelligenceTag(tags, "Current filing", "good");
  } else if (activeAuthority) {
    score -= 8;
    cautions.push("active authority is not showing a current public filing, so coverage status needs confirmation");
    addIntelligenceTag(tags, "Verify filing", "warn");
  }

  if (insuranceSignals.latestFiledDays !== null && insuranceSignals.latestFiledDays <= 120) {
    positives.push("recent filing activity suggests the compliance record is being maintained");
    addIntelligenceTag(tags, "Recent filing activity", "good");
  }

  if (contactCompleteness >= 80) {
    score += 8;
    positives.push("contact coverage is strong enough for immediate outreach");
    addIntelligenceTag(tags, "Contact-ready", "good");
  } else if (contactCompleteness >= 60) {
    score += 4;
    positives.push("there is enough contact data to start a warm first touch");
  } else {
    score -= 6;
    cautions.push("contact coverage is thin, so finding the buyer may take extra work");
    addIntelligenceTag(tags, "Thin contact data", "warn");
  }

  if (emailType === "business") {
    score += 2;
    positives.push("a business email is available for direct outreach");
    addIntelligenceTag(tags, "Business email", "good");
  } else if (emailType === "consumer" && (fleetSize === null || fleetSize <= 2)) {
    positives.push("the record looks owner-led, which can shorten the path to a decision-maker");
    addIntelligenceTag(tags, "Owner-led contact", "neutral");
  }

  if (fleetSize !== null) {
    if (fleetSize <= 2) {
      positives.push("the account looks like a micro-fleet, which can support a faster owner-led conversation");
      addIntelligenceTag(tags, "Micro-fleet", "neutral");
    } else if (fleetSize <= 25) {
      score += 4;
      positives.push("fleet size fits a practical producer-led renewal conversation");
    } else if (fleetSize <= 100) {
      score += 2;
      positives.push("fleet size is meaningful enough to support a broader program discussion");
    } else if (fleetSize > 100) {
      cautions.push("larger fleets can mean stronger incumbent competition and longer underwriting cycles");
    }
  }

  if (hasCargo) {
    score += 4;
    positives.push("cargo data is populated, so the insurance conversation can be specific");
  } else {
    score -= 5;
    cautions.push("cargo is still missing, so the coverage conversation needs discovery early");
    addIntelligenceTag(tags, "Cargo needs discovery", "warn");
  }

  if (hasHazmatCargo) {
    score -= 6;
    cautions.push("hazmat or chemical exposure increases filing, training, and market-eligibility scrutiny");
    addIntelligenceTag(tags, "Hazmat sensitivity", "warn");
  }

  if (refrigeratedCargo) {
    score += 3;
    positives.push("temperature-controlled freight creates a clear cargo and spoilage conversation");
    addIntelligenceTag(tags, "Refrigerated cargo", "good");
  }

  if (activeAuthority && mcs150Mileage !== null) {
    if (mcs150Mileage === 0) {
      score -= 6;
      cautions.push("the latest MCS-150 reports zero mileage, which can mean dormant operations or stale filings");
      addIntelligenceTag(tags, "Zero reported mileage", "warn");
    } else if (lowReportedMileage) {
      score -= 6;
      cautions.push(`the latest MCS-150 reports only ${mcs150Mileage.toLocaleString()} mile${mcs150Mileage === 1 ? "" : "s"}, so current operating scale should be confirmed`);
      addIntelligenceTag(tags, "Ultra-light mileage", "warn");
    }
  }

  if (vehicleOos !== null) {
    if (vehicleOos >= 35) {
      score -= 11;
      cautions.push(`vehicle OOS is elevated at ${formatPercentComparison(vehicleOos, vehicleOosNational)}`);
      addIntelligenceTag(tags, `Vehicle OOS ${formatOosRate(vehicleOos)}`, "bad");
    } else if (vehicleOos >= 25) {
      score -= 8;
      cautions.push(`vehicle OOS is elevated at ${formatPercentComparison(vehicleOos, vehicleOosNational)}`);
      addIntelligenceTag(tags, `Vehicle OOS ${formatOosRate(vehicleOos)}`, "bad");
    } else if (vehicleOos >= 15) {
      score -= 4;
      cautions.push(`vehicle OOS at ${formatPercentComparison(vehicleOos, vehicleOosNational)} deserves explanation`);
      addIntelligenceTag(tags, `Vehicle OOS ${formatOosRate(vehicleOos)}`, "warn");
    }
  }

  if (driverOos !== null) {
    if (driverOos >= 20) {
      score -= 10;
      cautions.push(`driver OOS is elevated at ${formatPercentComparison(driverOos, driverOosNational)}`);
      addIntelligenceTag(tags, `Driver OOS ${formatOosRate(driverOos)}`, "bad");
    } else if (driverOos >= 12) {
      score -= 7;
      cautions.push(`driver OOS is elevated at ${formatPercentComparison(driverOos, driverOosNational)}`);
      addIntelligenceTag(tags, `Driver OOS ${formatOosRate(driverOos)}`, "bad");
    } else if (driverOos >= 8) {
      score -= 4;
      cautions.push(`driver OOS at ${formatPercentComparison(driverOos, driverOosNational)} should be discussed`);
      addIntelligenceTag(tags, `Driver OOS ${formatOosRate(driverOos)}`, "warn");
    }
  }

  if (crashCount >= 3) {
    score -= 8;
    cautions.push(`${crashCount} reportable crashes in the recent public window raise underwriting friction`);
    addIntelligenceTag(tags, `${crashCount} recent crashes`, "warn");
  } else if (crashCount >= 1) {
    score -= 3;
    cautions.push(`${crashCount} recent crash event${crashCount === 1 ? "" : "s"} should be reviewed for trend`);
  }

  score = Math.max(18, Math.min(Math.round(score), 96));

  const riskPoints =
    (authorityClass === "authorized" ? 0 : authorityClass === "private" ? 2 : authorityClass === "not-authorized" ? 4 : authorityClass === "inactive" ? 5 : authorityClass === "out-of-service" ? 6 : 2) +
    (/conditional/i.test(safetyRatingText) ? 2 : /unsatisfactory|inactive/i.test(safetyRatingText) ? 3 : /not rated/i.test(safetyRatingText) ? 1 : 0) +
    (vehicleOos !== null && vehicleOos >= 35 ? 3 : vehicleOos !== null && vehicleOos >= 25 ? 2 : vehicleOos !== null && vehicleOos >= 15 ? 1 : 0) +
    (driverOos !== null && driverOos >= 20 ? 3 : driverOos !== null && driverOos >= 12 ? 2 : driverOos !== null && driverOos >= 8 ? 1 : 0) +
    (crashCount >= 3 ? 2 : crashCount >= 1 ? 1 : 0) +
    (hasHazmatCargo ? 2 : 0) +
    (mcs150Freshness.bucket === "very-stale" ? 3 : mcs150Freshness.bucket === "stale" ? 2 : mcs150Freshness.bucket === "aging" ? 1 : 0) +
    (activeAuthority && !insuranceSignals.hasCurrentFiling ? 2 : 0) +
    (activeAuthority && lowReportedMileage ? 2 : 0) +
    (freshNewVenture ? 1 : 0);

  const riskHeat = riskPoints >= 9
    ? "High"
    : riskPoints >= 6
      ? "Elevated"
      : riskPoints >= 3
        ? "Guarded"
        : "Low";

  const confidenceSignals = [
    hasCargo,
    authorityClass !== "unknown",
    isMeaningfulValue(profile.safetyRating),
    mcs150Freshness.days !== null,
    isMeaningfulValue(profile.physicalAddress),
    contactCompleteness >= 60,
    insuranceSignals.hasInsuranceSignal,
    sourceCount >= 2
  ].filter(Boolean).length;

  const confidenceLabel = confidenceSignals >= 7
    ? "High"
    : confidenceSignals >= 5
      ? "Medium"
      : "Basic";

  const topStrengths = positives.slice(0, 3);
  const topCautions = cautions.slice(0, 3);

  const questions = [
    authorityClass === "inactive"
      ? "Is this DOT still operating, being reactivated, or should it be treated as a dormant public record?"
      : authorityClass === "not-authorized"
        ? "Is the operation staying private/intrastate, or is there a plan to restore for-hire authority?"
        : isNewVentureLead
          ? "What prior operating experience, CDL tenure, and loss history should be positioned to startup markets?"
          : renewalDays !== null
            ? "When does the incumbent expect submissions, loss runs, and a decision on the renewal?"
          : "What is the actual renewal timing, and is the account open to a second market this cycle?",
    hasHazmatCargo
      ? "Which hazmat-sensitive commodities, placards, filings, and shipper requirements are driving market appetite today?"
      : refrigeratedCargo
        ? "Any reefer breakdown, spoilage, temperature-control loss history, or trailer interchange requirements in the last 12 months?"
        : hasCargo
          ? "Which commodities and operating radius create the most pricing or claims pressure right now?"
          : "What cargo mix and operating radius should the insurance program actually be built around?",
    isNewVentureLead
      ? "How are garaging, dispatch radius, unit financing, and first-hire driver plans being set up for the first 90 days?"
      : vehicleOos !== null && vehicleOos >= 15
      ? "What corrective actions were put in place after the recent inspection or out-of-service activity?"
      : lowReportedMileage && activeAuthority
        ? "The latest MCS-150 shows very light mileage. Is that accurate, or has the operation changed since the filing?"
        : "Any fleet growth, unit turnover, or hiring changes planned in the next 90 days?",
    isRenewalLead && renewalDays !== null && renewalDays <= 45
      ? "What does the current broker or incumbent handle well today, and where are they vulnerable before renewal binds?"
      : !insuranceSignals.hasCurrentFiling && activeAuthority
      ? "Can they confirm who currently writes the filing and whether the public filing record is up to date?"
      : contactCompleteness < 60 || !hasDecisionMaker
        ? "Who is the actual insurance decision-maker, and what is the best direct line or email?"
        : "Who owns insurance strategy today, and what would they want improved before the next renewal?"
  ];

  const cargoPhrase = hasCargo ? joinNaturalLanguage(cargoList.slice(0, 3)) : "their operation";
  const coveragePoints = [
    isRenewalLead && renewalDays !== null
      ? `renewal timing is visible with roughly ${renewalDays} day${renewalDays === 1 ? "" : "s"} left on the current program`
      : isNewVentureLead
        ? "startup placement will hinge on owner experience, garaging, planned lanes, and how fast filings need to be turned around"
        : null,
    insuranceSignals.hasCurrentFiling
      ? `public filings already show ${joinNaturalLanguage(insuranceSignals.coverageTypes.slice(0, 3)) || "current insurance activity"} on record`
      : activeAuthority
        ? "public filing detail needs to be confirmed before a clean coverage strategy can be assumed"
        : "public filing detail is limited, so coverage structure needs live confirmation",
    hasCargo ? `${cargoPhrase} should drive the auto liability and cargo conversation` : "cargo mix still needs to be confirmed before coverage structure is discussed",
    fleetSize !== null ? `fleet size is ${fleetSize} power units${driverCount !== null ? ` with ${driverCount} drivers` : ""}` : "fleet size is not fully populated yet",
    authorityClass === "private" || authorityClass === "not-authorized"
      ? "confirm whether the account is private, intrastate, or preparing to restore for-hire authority before positioning markets"
      : null,
    hasHazmatCargo ? "hazmat filings, commodity detail, storage or transfer exposure, and market appetite need explicit confirmation" : null,
    refrigeratedCargo ? "reefer breakdown, spoilage, trailer interchange, and cargo-limit adequacy should be positioned early" : null
  ].filter(Boolean);

  let headline = "Usable carrier target with a few underwriting checks";
  if (authorityClass === "inactive") {
    headline = "Dormant or inactive carrier record that needs status verification first";
  } else if (authorityClass === "not-authorized") {
    headline = "Not-authorized record that needs operating-model qualification before quoting";
  } else if (authorityClass === "private") {
    headline = "Private or intrastate carrier that needs a different outreach angle";
  } else if (isRenewalLead && renewalDays !== null && renewalDays <= 30) {
    headline = hasHazmatCargo || refrigeratedCargo
      ? "High-priority specialty renewal with a real closing clock"
      : "High-priority renewal opportunity with a real closing clock";
  } else if (isNewVentureLead && freshNewVenture) {
    headline = hasHazmatCargo || refrigeratedCargo
      ? "Fresh specialty new venture that needs a startup-market conversation"
      : "Fresh new venture that needs a startup-market conversation";
  } else if (score >= 78 && riskHeat === "Low") {
    headline = hasHazmatCargo || refrigeratedCargo
      ? "Strong specialty prospect with a clear underwriting story"
      : "Strong active prospect with a clean public operating story";
  } else if (score >= 66 && riskHeat !== "High") {
    headline = hasHazmatCargo || refrigeratedCargo
      ? "Specialty carrier with a focused underwriting angle"
      : "Solid active opportunity if the program is truly in play";
  } else if (activeAuthority && riskHeat !== "Low") {
    headline = "Active carrier, but compliance friction needs to be addressed early";
  } else if (score < 48) {
    headline = "Guarded opportunity that needs sharper qualification before quoting";
  }

  const summary = [
    topStrengths.length ? `Best signals: ${joinNaturalLanguage(topStrengths)}.` : "",
    topCautions.length ? `Main watch items: ${joinNaturalLanguage(topCautions)}.` : ""
  ].filter(Boolean).join(" ");

  return {
    headline,
    summary: summary || "The carrier profile is usable, but the next step should be a quick discovery call to fill the missing story.",
    signalScore: `${score}/100`,
    riskHeat,
    timing: getCarrierTimingLabel(renewalDays, mcs150Freshness, insuranceSignals, authorityClass, workflow),
    prospectFit: authorityClass === "inactive"
      ? `${profile.carrierName} does not read like a live quote-first renewal target right now. Treat it as a reactivation or record-cleanup conversation until someone confirms the DOT is still operating and the public filings are current.`
      : authorityClass === "not-authorized"
        ? `${profile.carrierName} may still be an insurance opportunity, but not as a normal public for-hire prospect. Start by confirming whether the operation is private, intrastate, or planning to restore authority before spending quoting time.`
        : authorityClass === "private"
          ? `${profile.carrierName} can still be a fit, but the pitch should be built around a private or intrastate operation rather than a standard authority-and-renewal play. Confirm the operating model before discussing market strategy.`
          : isNewVentureLead
            ? `${profile.carrierName} should be treated like a startup placement conversation, not a generic quote chase. The best path is to qualify owner experience, garaging, operating radius, and first-hire plans, then position markets that can support a young authority cleanly.`
            : isRenewalLead && renewalDays !== null && renewalDays <= 45
              ? `${profile.carrierName} is sitting inside a live renewal window, so this is less about cold prospecting and more about whether you can interrupt the incumbent story with sharper execution. Lead with timing, current frustrations, and what has to be submitted before the market locks.`
          : score >= 72 && riskHeat === "Low"
            ? `${profile.carrierName} looks like a strong outbound target. Authority appears active, ${hasCargo ? `cargo is defined around ${cargoPhrase}` : "cargo still needs discovery"}, and the record has enough live detail to support a focused first conversation.`
            : score >= 68 && activeAuthority
              ? `${profile.carrierName} is active and data-rich enough to pursue, but the public record is not clean enough for a lazy quote pitch. Lead with compliance, inspection, and operating-reality questions before you invest quoting time.`
            : score >= 55
              ? `${profile.carrierName} is workable, but it is better treated as a qualified lead than a fast quote. Use the first conversation to confirm decision-maker, renewal timing, operating reality, and any compliance cleanup still in motion.`
              : `${profile.carrierName} should be triaged carefully before heavy quoting work. Start with authority, safety, filing status, and operating changes so you do not spend time on the wrong risk.`,
    safetyIssues: topCautions.length
      ? `Primary underwriting friction: ${joinNaturalLanguage(topCautions)}. Safety rating reads ${formatSafetyRating(profile.safetyRating) || profile.safetyRating || "Unknown"}, so the call should surface corrective actions, inspection discipline, and any recent loss activity.`
      : `Public safety signals are comparatively calm. Safety rating reads ${formatSafetyRating(profile.safetyRating) || profile.safetyRating || "Unknown"}, so use the call to confirm nothing material changed after the last FMCSA update.`,
    coverage: `${coveragePoints.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(". ")}.`,
    questions: `Start with: ${questions.slice(0, 3).join(" ")}`,
    urgency: authorityClass === "inactive"
      ? "This is not a timing-first renewal lead. First confirm whether the DOT is still operating, whether the carrier is being reactivated, and whether the public record is simply stale."
      : authorityClass === "not-authorized"
        ? "Urgency depends on operating intent more than renewal timing. First find out whether the carrier is staying private or trying to restore for-hire authority."
        : isNewVentureLead
          ? freshNewVenture
            ? "This sits in the most valuable startup contact window. Early in a new venture, carrier setup, filings, down payment tolerance, and first-market selection are still fluid, so a fast consultative call matters."
            : "The authority is still young enough for a startup-market conversation, but you should move before the first placement and operating habits harden into the default program."
        : renewalDays === null
          ? insuranceSignals.hasCurrentFiling
            ? "No public renewal date is posted, but current filing activity suggests the account is still being maintained. Use the first call to pin down the true renewal window and whether the incumbent already has the inside track."
            : "No public renewal date is available, so urgency has to be qualified live on the first call. Ask whether the account is already in review with the incumbent or broker."
      : renewalDays < 0
        ? `The expiration date on file appears to be past due by ${Math.abs(renewalDays)} day${Math.abs(renewalDays) === 1 ? "" : "s"}. Confirm whether the filing date is stale, whether coverage already renewed, or whether there is a real service issue to solve.`
        : renewalDays <= 30
          ? `This sits inside a high-value call window. With renewal roughly ${renewalDays} day${renewalDays === 1 ? "" : "s"} away, move quickly before the incumbent and other markets lock the conversation.`
          : `Renewal is visible but not immediate. Use the time to position expertise, learn the loss story, and set a follow-up before the remarketing rush.`,
    angle: authorityClass === "inactive"
      ? "Lead with record-status verification: determine whether the DOT is still live, whether the carrier plans to reactivate, and whether there is a cleanup opportunity before you pitch markets."
      : authorityClass === "not-authorized" || authorityClass === "private"
        ? "Lead with operating-model clarity: verify whether the business is private, intrastate, or moving back into for-hire authority, then position coverage advice around that real operating lane."
      : isNewVentureLead && hasHazmatCargo
        ? "Lead with startup market fit: qualify owner experience, planned commodities, filings, and shipper requirements first, then position hazmat-capable markets before price ever becomes the center of the conversation."
      : isNewVentureLead && refrigeratedCargo
        ? "Lead with startup program design for refrigerated freight: owner experience, reefer breakdown, spoilage exposure, trailer interchange, and broker cargo-limit requirements should frame the call."
      : isNewVentureLead
        ? "Lead with startup program design: owner experience, garaging, operating radius, hiring plan, filings, and down payment tolerance will matter more than a generic quote pitch."
      : isRenewalLead && renewalDays !== null && renewalDays <= 45 && hasHazmatCargo
        ? "Lead with the renewal clock, then pivot straight into hazmat commodity mix, filings, driver training, and whether the current market still fits the exposure."
      : isRenewalLead && renewalDays !== null && renewalDays <= 45 && refrigeratedCargo
        ? "Lead with the renewal window, then move into spoilage, reefer breakdown, trailer interchange, and whether current cargo limits still match broker and shipper demands."
      : renewalDays !== null && renewalDays <= 45 && renewalDays >= 0
        ? `Lead with timing: tie the conversation to the upcoming renewal, then pivot into ${hasCargo ? cargoPhrase : "operations"}, unit count, and whether the current program still fits the business.`
      : hasHazmatCargo
        ? "Lead with expertise: position yourself around hazmat compliance, commodity handling, filings, and market appetite before you ever open with price."
        : refrigeratedCargo
          ? "Lead with cargo specialization: reefer, spoilage, maintenance discipline, and trailer interchange create a sharper angle than a generic insurance pitch."
          : activeAuthority && lowReportedMileage
            ? "Lead with operating reality: confirm whether the DOT is truly moving at the reported mileage level before you spend energy on a full market discussion."
          : "Lead with operational fit: use fleet size, authority status, and public safety visibility to open a consultative conversation rather than a hard quote ask.",
    confidence: `${confidenceLabel} confidence. The brief is built from ${sourceCount || 1} data source${sourceCount === 1 ? "" : "s"} and ${confidenceSignals} populated signal group${confidenceSignals === 1 ? "" : "s"}. ${contactCompleteness < 60 ? "Contact coverage is still thin, so treat outreach logistics as part of discovery." : insuranceSignals.hasCurrentFiling || mcs150Freshness.bucket === "recent" || mcs150Freshness.bucket === "current" ? "The public record is detailed enough to support a targeted first call." : "The signal set is usable, but a few compliance details still need live confirmation."}`,
    opener: authorityClass === "inactive"
      ? `Hi, I was reviewing ${profile.carrierName}'s DOT record and saw the public status is showing inactive. Is the operation still moving, or is this a record that is being reactivated or cleaned up?`
      : authorityClass === "not-authorized" || authorityClass === "private"
        ? `Hi, I was reviewing ${profile.carrierName}'s DOT record and noticed the public authority picture looks more private or not currently authorized than a standard for-hire profile. Are you the right person to ask how the operation is set up today and whether any authority changes are planned?`
        : isNewVentureLead
          ? `Hi, I was reviewing ${profile.carrierName}'s DOT profile and it looks like the authority is still pretty new${startupAgeDays !== null ? ` at about ${compactElapsedLabel(startupAgeDays)}` : ""}. Are you the right person to talk with about how the trucking insurance program is being set up for the first operating stretch?`
          : isRenewalLead && renewalDays !== null && renewalDays >= 0
            ? `Hi, I was reviewing ${profile.carrierName}'s DOT profile and saw the current insurance timing is getting closer${renewalDays <= 45 ? " before the renewal window tightens up" : ""}. Are you the right person to speak with about the current program and whether the incumbent still has the account positioned the way it should be?`
            : hasHazmatCargo
              ? `Hi, I was reviewing ${profile.carrierName}'s DOT profile and noticed the operation shows hazmat-sensitive or chemical freight. Are you the right person to speak with about whether the current insurance program still fits the filings and market appetite that exposure needs?`
              : refrigeratedCargo
                ? `Hi, I was reviewing ${profile.carrierName}'s DOT profile and noticed refrigerated cargo in the operation. Are you the right person to speak with about whether the current program still fits the spoilage, reefer breakdown, and cargo-limit demands that freight creates?`
                : `Hi, I was reviewing ${profile.carrierName}'s DOT profile and noticed ${renewalDays !== null && renewalDays >= 0 ? `the renewal timing is coming into view` : hasCargo ? `your operation is showing ${cargoPhrase}` : "a few public operating signals that caught my eye"}. Are you the right person to speak with about the current trucking insurance program and any changes coming up this year?`,
    footnote: `Generated from ${sourceCount ? joinNaturalLanguage(profile.dataSources.slice(0, 3)) : "available carrier intelligence sources"} and refreshed around ${formatDateOnly(profile.lastUpdated) || "the latest available update"}.${workflow.entryPoint ? ` Entry point: ${workflow.entryPoint}.` : ""}${mcs150Freshness.ageText ? ` MCS-150 age: ${mcs150Freshness.ageText}.` : ""}`,
    tags
  };
}

function renderCarrierIntelligence(carrier) {
  const panel = document.getElementById("carrierIntelligencePanel");
  if (!panel) return;

  if (!canUseCarrierIntelligence()) {
    applyCarrierIntelligenceSnapshot({
      headline: "AI carrier copilot is available on Agency Unlimited.",
      summary: "Upgrade to unlock a richer carrier brief that reads safety, cargo, authority, timing, and contact signals together.",
      signalScore: "--",
      riskHeat: "Locked",
      timing: "Locked",
      prospectFit: "Agency Unlimited scores prospect fit from live carrier signals.",
      safetyIssues: "Agency Unlimited explains underwriting friction from safety, OOS, and crash indicators.",
      coverage: "Agency Unlimited highlights likely coverage pressure points before your first call.",
      questions: "Agency Unlimited suggests discovery questions tailored to the carrier record.",
      urgency: "Agency Unlimited frames renewal urgency and competitive timing.",
      angle: "Agency Unlimited identifies the strongest outreach angle instead of generic scripting.",
      confidence: "Agency Unlimited tells you how complete and trustworthy the current signal set is.",
      opener: "Agency Unlimited writes a more targeted first-touch opener for the account.",
      footnote: "Upgrade to Agency Unlimited to unlock premium carrier intelligence.",
      tags: [{ label: "Agency Unlimited feature", tone: "neutral" }]
    });
    return;
  }

  if (!carrier) {
    applyCarrierIntelligenceSnapshot({
      headline: "Search a carrier to generate a prospecting brief.",
      summary: "The assistant will read safety, cargo, authority, fleet, contact, and renewal signals here.",
      signalScore: "--",
      riskHeat: "Waiting",
      timing: "Waiting",
      prospectFit: "Search a carrier to review fit.",
      safetyIssues: "Safety score context will appear here.",
      coverage: "Coverage concerns will appear here.",
      questions: "Suggested discovery questions will appear here.",
      urgency: "Renewal timing guidance will appear here.",
      angle: "The strongest outreach angle will appear here.",
      confidence: "Signal confidence will appear here.",
      opener: "A suggested opener will appear here.",
      footnote: "This brief updates from live and cached carrier signals as data becomes available.",
      tags: [{ label: "Awaiting carrier data", tone: "neutral" }]
    });
    return;
  }

  applyCarrierIntelligenceSnapshot(buildCarrierIntelligenceSnapshot(carrier));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setEmailLink(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = renderEmailLink(value, "Not available");
  }
}

function copyToClipboard() {
  if (!state.selectedCarrier) return;

  const profile = normalizeCarrierProfile(state.selectedCarrier);
  const lines = [
    `Carrier: ${profile.carrierName || "Not available"}`,
    `Email: ${profile.email || "Not available"}`,
    `Phone: ${profile.phone || "Not available"}`,
    `Address: ${profile.physicalAddress || "Not available"}`,
    `Website: ${profile.website || "Not available"}`
  ];

  const text = lines.join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.warn("Could not copy contact info:", err.message);
    });
  }
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return String(text ?? "").replace(/[&<>"']/g, (match) => map[match]);
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/`/g, "");
}

document.addEventListener("DOMContentLoaded", async () => {
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const saveLeadBtn = document.getElementById("saveLeadBtn");
  const leadsTableBody = document.getElementById("leadsTableBody");
  const prospectFilterForm = document.getElementById("prospectFilterForm");
  const exportProspectsBtn = document.getElementById("exportProspectsBtn");
  const sheetTopExportBtn = document.getElementById("sheetTopExportBtn");
  const prospectSelectAll = document.getElementById("prospectSelectAll");
  const prospectReportBody = document.getElementById("prospectReportBody");
  const newVentureFilterForm = document.getElementById("newVentureFilterForm");
  const exportNewVenturesBtn = document.getElementById("exportNewVenturesBtn");
  const newVentureSelectAll = document.getElementById("newVentureSelectAll");
  const newVentureBody = document.getElementById("newVentureBody");
  const renewalMonth = document.getElementById("renewalMonth");
  const newVentureMonth = document.getElementById("newVentureMonth");
  const notesModal = document.getElementById("notesModal");
  const notesTextarea = document.getElementById("notesTextarea");
  const saveNotesBtn = document.getElementById("saveNotesBtn");
  const insuranceAlertsContainer = document.getElementById("insuranceAlertsContainer");
  const isDashboardPage = Boolean(
    searchForm ||
    leadsTableBody ||
    saveLeadBtn ||
    prospectFilterForm ||
    newVentureFilterForm
  );

  if (isDashboardPage && !API.isAuthenticated()) {
    const user = await API.refreshCurrentUser().catch(() => null);
    if (!user) {
      window.location.replace(`/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
  }

  applySubscriptionUiControls();
  initResizableLeadTables();

  if (leadsTableBody) {
    loadLeads();
  }

  if (insuranceAlertsContainer) {
    loadInsuranceAlerts();
  }

  if (prospectFilterForm) {
    if (renewalMonth) renewalMonth.value = renewalMonth.value || "";

    prospectFilterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      searchProspectReport();
    });
  }

  if (exportProspectsBtn) {
    exportProspectsBtn.addEventListener("click", exportProspectReport);
  }

  if (sheetTopExportBtn) {
    sheetTopExportBtn.addEventListener("click", () => {
      const activePane = document.querySelector(".tab-pane.active");
      if (activePane?.id === "newVenturePane") {
        exportNewVentureReport();
        return;
      }

      exportProspectReport();
    });
  }

  if (prospectSelectAll) {
    prospectSelectAll.addEventListener("change", () => {
      setVisibleRowsChecked(".prospect-row-checkbox", prospectSelectAll.checked);
      updateSelectAllState("prospectSelectAll", ".prospect-row-checkbox");
    });
  }

  if (prospectReportBody) {
    prospectReportBody.addEventListener("change", (event) => {
      if (event.target.classList.contains("prospect-row-checkbox")) {
        updateSelectAllState("prospectSelectAll", ".prospect-row-checkbox");
      }
    });
  }

  if (newVentureFilterForm) {
    if (newVentureMonth) newVentureMonth.value = newVentureMonth.value || "";

    newVentureFilterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      searchNewVentureReport();
    });
  }

  if (exportNewVenturesBtn) {
    exportNewVenturesBtn.addEventListener("click", exportNewVentureReport);
  }

  if (newVentureSelectAll) {
    newVentureSelectAll.addEventListener("change", () => {
      setVisibleRowsChecked(".new-venture-row-checkbox", newVentureSelectAll.checked);
      updateSelectAllState("newVentureSelectAll", ".new-venture-row-checkbox");
    });
  }

  if (newVentureBody) {
    newVentureBody.addEventListener("change", (event) => {
      if (event.target.classList.contains("new-venture-row-checkbox")) {
        updateSelectAllState("newVentureSelectAll", ".new-venture-row-checkbox");
      }
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      searchCarrier(searchInput.value, { workflowContext: null });
    });

    const params = new URLSearchParams(window.location.search);
    const initialCarrierQuery = params.get("dot") || params.get("mc") || params.get("name");
    const initialWorkflowContext = readCarrierWorkflowContext(params);
    if (initialCarrierQuery) {
      searchInput.value = initialCarrierQuery;
      searchCarrier(initialCarrierQuery, { workflowContext: initialWorkflowContext });
    }
  }

  if (saveLeadBtn) {
    saveLeadBtn.addEventListener("click", saveLead);
  }

  if (leadsTableBody) {
    leadsTableBody.addEventListener("change", async (event) => {
      const target = event.target;
      const index = target.getAttribute("data-index");
      if (index === null) return;

      const leadIndex = parseInt(index, 10);
      if (target.classList.contains("lead-status-select")) {
        state.leads[leadIndex].status = target.value;
        await updateLead(leadIndex, { status: target.value });
      } else if (target.classList.contains("lead-date-input")) {
        state.leads[leadIndex].last_contact = target.value;
        await updateLead(leadIndex, { last_contact: target.value });
      } else if (target.classList.contains("lead-insurance-input")) {
        state.leads[leadIndex].insurance_expiration = target.value;
        await updateLead(leadIndex, { insurance_expiration: target.value });
        loadInsuranceAlerts();
      }
    });

    leadsTableBody.addEventListener("click", (event) => {
      const target = event.target;
      const index = target.getAttribute("data-index");
      if (index === null) return;

      const leadIndex = parseInt(index, 10);
      if (target.classList.contains("lead-delete-btn")) {
        if (confirm("Delete this lead?")) {
          deleteLead(leadIndex);
        }
      } else if (target.classList.contains("lead-notes-btn")) {
        state.activeLeadIndex = leadIndex;
        if (notesTextarea) {
          notesTextarea.value = state.leads[leadIndex].notes || "";
        }
      }
    });
  }

  document.addEventListener("click", (event) => {
    const lookupButton = event.target.closest(".row-lookup-btn");
    if (!lookupButton) return;

    const dot = lookupButton.getAttribute("data-dot");
    if (!dot) return;

    const workflowContext = readCarrierWorkflowContext({
      leadType: lookupButton.dataset.leadType,
      entryPoint: lookupButton.dataset.entryPoint,
      renewalDate: lookupButton.dataset.renewalDate,
      daysUntilExpiration: lookupButton.dataset.daysUntilExpiration,
      insuranceCompany: lookupButton.dataset.insuranceCompany,
      addDate: lookupButton.dataset.addDate,
      carrierOperation: lookupButton.dataset.carrierOperation,
      powerUnits: lookupButton.dataset.powerUnits,
      drivers: lookupButton.dataset.drivers
    });

    window.location.href = buildCarrierAnalyticsUrl(dot, workflowContext);
  });

  if (saveNotesBtn && notesTextarea) {
    saveNotesBtn.addEventListener("click", async () => {
      if (state.activeLeadIndex === null || state.activeLeadIndex === undefined) return;

      state.leads[state.activeLeadIndex].notes = notesTextarea.value;
      await updateLead(state.activeLeadIndex, { notes: notesTextarea.value });

      const modal = globalThis.bootstrap?.Modal?.getInstance(notesModal);
      if (modal) {
        modal.hide();
      }

      renderLeadsTable();
    });
  }

  renderCarrierDetails(null);
});

window.copyToClipboard = copyToClipboard;

