import axios from "axios";
import dns from "dns/promises";

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com"
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ROLE_ACCOUNT_NAMES = new Set([
  "admin",
  "billing",
  "contact",
  "dispatch",
  "hello",
  "info",
  "office",
  "operations",
  "sales",
  "support"
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getEmailParts(email) {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain, ...extra] = normalizedEmail.split("@");
  return {
    normalizedEmail,
    localPart,
    domain,
    hasSingleAtSign: Boolean(localPart && domain && extra.length === 0)
  };
}

function hasValidSyntax(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

async function verifyWithHunter(email) {
  if (!process.env.HUNTER_IO_API_KEY) return null;

  const response = await axios.get("https://api.hunter.io/v2/email-verifier", {
    params: {
      email,
      api_key: process.env.HUNTER_IO_API_KEY
    },
    timeout: 10000
  });

  const data = response.data?.data || {};
  const status = data.status || data.result || "unknown";
  const deliverable = ["valid", "deliverable", "accept_all"].includes(String(status).toLowerCase());

  return {
    provider: "Hunter.io",
    status,
    verified: deliverable,
    confidence: data.score ?? data.confidence ?? null,
    raw: {
      regexp: data.regexp ?? null,
      mx_records: data.mx_records ?? null,
      smtp_server: data.smtp_server ?? null,
      smtp_check: data.smtp_check ?? null,
      accept_all: data.accept_all ?? null,
      block: data.block ?? null,
      gibberish: data.gibberish ?? null,
      disposable: data.disposable ?? null,
      webmail: data.webmail ?? null
    }
  };
}

async function verifyWithAbstractApi(email) {
  if (!process.env.ABSTRACT_EMAIL_VALIDATION_API_KEY) return null;

  const response = await axios.get("https://emailvalidation.abstractapi.com/v1/", {
    params: {
      api_key: process.env.ABSTRACT_EMAIL_VALIDATION_API_KEY,
      email
    },
    timeout: 10000
  });

  const data = response.data || {};
  const deliverability = String(data.deliverability || "unknown").toLowerCase();
  const verified = deliverability === "deliverable";

  return {
    provider: "AbstractAPI",
    status: data.deliverability || "unknown",
    verified,
    confidence: data.quality_score ?? null,
    raw: {
      is_valid_format: data.is_valid_format?.value ?? null,
      is_mx_found: data.is_mx_found?.value ?? null,
      is_smtp_valid: data.is_smtp_valid?.value ?? null,
      is_disposable_email: data.is_disposable_email?.value ?? null,
      is_role_email: data.is_role_email?.value ?? null,
      is_free_email: data.is_free_email?.value ?? null
    }
  };
}

async function verifyWithAbstractReputation(email) {
  const apiKey =
    process.env.ABSTRACT_EMAIL_REPUTATION_API_KEY ||
    process.env.ABSTRACT_EMAIL_VALIDATION_API_KEY;

  if (!apiKey) return null;

  let response;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await axios.get("https://emailreputation.abstractapi.com/v1/", {
        params: {
          api_key: apiKey,
          email
        },
        timeout: 45000
      });
      break;
    } catch (err) {
      lastError = err;
      if (err.response || attempt === 2) throw err;
      await sleep(1000);
    }
  }

  if (!response) throw lastError;

  const data = response.data || {};
  const deliverability = data.email_deliverability || {};
  const quality = data.email_quality || {};
  const risk = data.email_risk || {};
  const status = String(deliverability.status || "unknown").toLowerCase();
  const verified = status === "deliverable";

  return {
    provider: "AbstractAPI Email Reputation",
    status,
    verified,
    confidence: quality.score ?? null,
    raw: {
      status_detail: deliverability.status_detail ?? null,
      is_valid_format: deliverability.is_format_valid ?? null,
      is_mx_found: deliverability.is_mx_valid ?? null,
      is_smtp_valid: deliverability.is_smtp_valid ?? null,
      mx_records: deliverability.mx_records ?? [],
      is_disposable_email: quality.is_disposable ?? null,
      is_role_email: quality.is_role ?? null,
      is_free_email: quality.is_free_email ?? null,
      is_catchall_email: quality.is_catchall ?? null,
      address_risk_status: risk.address_risk_status ?? null,
      domain_risk_status: risk.domain_risk_status ?? null
    }
  };
}

async function verifyWithLocalChecks(email) {
  const { localPart, domain } = getEmailParts(email);
  let mxRecords = [];

  try {
    mxRecords = await dns.resolveMx(domain);
  } catch {
    mxRecords = [];
  }

  const hasMxRecords = mxRecords.length > 0;

  return {
    provider: "Local DNS",
    status: hasMxRecords ? "mx_found" : "no_mx_records",
    verified: false,
    confidence: hasMxRecords ? 50 : 0,
    raw: {
      mx_records: hasMxRecords,
      mx_hosts: mxRecords.map(record => record.exchange),
      disposable: DISPOSABLE_DOMAINS.has(domain),
      role_account: ROLE_ACCOUNT_NAMES.has(localPart)
    }
  };
}

export async function verifyEmailAddress(email) {
  const { normalizedEmail, localPart, domain, hasSingleAtSign } = getEmailParts(email);

  const baseResult = {
    email: normalizedEmail,
    verified: false,
    status: "invalid",
    provider: "Local syntax",
    confidence: 0,
    reason: "",
    checks: {
      syntax: false,
      domain: false,
      mx: false,
      disposable: false,
      roleAccount: false
    }
  };

  if (!normalizedEmail) {
    return { ...baseResult, reason: "Email is empty" };
  }

  if (!hasSingleAtSign || !hasValidSyntax(normalizedEmail)) {
    return { ...baseResult, reason: "Email format is invalid" };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ...baseResult,
      status: "disposable",
      reason: "Email uses a disposable domain",
      checks: {
        ...baseResult.checks,
        syntax: true,
        domain: true,
        disposable: true,
        roleAccount: ROLE_ACCOUNT_NAMES.has(localPart)
      }
    };
  }

  let providerResult = null;

  for (const verifier of [verifyWithAbstractReputation, verifyWithAbstractApi, verifyWithHunter]) {
    try {
      providerResult = await verifier(normalizedEmail);
      if (providerResult) break;
    } catch (err) {
      console.warn(`Email verification provider failed: ${err.message}`);
    }
  }

  if (!providerResult) {
    providerResult = await verifyWithLocalChecks(normalizedEmail);
  }

  const mxFound = Boolean(
    providerResult.raw?.mx_records ||
    providerResult.raw?.is_mx_found ||
    providerResult.status === "mx_found"
  );

  return {
    email: normalizedEmail,
    verified: Boolean(providerResult.verified),
    status: providerResult.status,
    provider: providerResult.provider,
    confidence: providerResult.confidence,
    reason: providerResult.verified
      ? "Email passed deliverability verification"
      : providerResult.provider === "Local DNS" && mxFound
        ? "Email syntax and domain mail records passed; configure a verification provider to confirm inbox deliverability"
        : "Email could not be confirmed as deliverable",
    checks: {
      syntax: true,
      domain: true,
      mx: mxFound,
      disposable: Boolean(providerResult.raw?.disposable || providerResult.raw?.is_disposable_email),
      roleAccount: Boolean(providerResult.raw?.role_account || providerResult.raw?.is_role_email || ROLE_ACCOUNT_NAMES.has(localPart))
    },
    raw: providerResult.raw
  };
}
