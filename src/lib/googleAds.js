export const GOOGLE_ADS_ID = "AW-18211312936";

export const GOOGLE_ADS_CONVERSIONS = {
  freeTrialStarted: {
    name: "Free Trial Started",
    label: "PD4CCLHt_r0cEKiq6utD",
    value: 1.0,
    currency: "USD",
  },
  purchase: {
    name: "Purchase",
    label: "",
    value: 1.0,
    currency: "USD",
    enabled: false,
  },
};

const CONVERSION_STORAGE_PREFIX = "mtl_google_ads_conversion:";

function isDebugEnabled() {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function debugLog(message, details) {
  if (!isDebugEnabled()) return;
  if (details !== undefined) {
    console.info(`[Google Ads] ${message}`, details);
    return;
  }
  console.info(`[Google Ads] ${message}`);
}

function sendTo(label) {
  return `${GOOGLE_ADS_ID}/${label}`;
}

function getStorageKey(conversionKey, transactionId) {
  return `${CONVERSION_STORAGE_PREFIX}${conversionKey}:${transactionId || "unknown"}`;
}

function isConfigured(conversion) {
  return Boolean(conversion?.label && !conversion.label.includes("REPLACE_WITH"));
}

export function logGoogleAdsTagLoaded() {
  if (typeof window === "undefined") return false;
  const loaded = typeof window.gtag === "function";
  if (loaded) {
    debugLog("Google Ads Tag Loaded", { id: GOOGLE_ADS_ID });
  }
  return loaded;
}

export function trackGoogleAdsConversion(conversionKey, { transactionId = "" } = {}) {
  const conversion = GOOGLE_ADS_CONVERSIONS[conversionKey];
  if (!conversion) {
    debugLog("Conversion not found", { conversionKey });
    return false;
  }

  if (conversion.enabled === false) {
    debugLog("Conversion disabled", { conversionKey, name: conversion.name });
    return false;
  }

  if (!transactionId) {
    debugLog("Conversion skipped: missing Stripe session ID", { conversionKey });
    return false;
  }

  debugLog("Stripe Session ID Detected", { conversionKey, transactionId });

  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    debugLog("Conversion skipped: gtag unavailable", { conversionKey });
    return false;
  }

  if (!isConfigured(conversion)) {
    debugLog("Conversion skipped: Google Ads conversion label is not configured", {
      conversionKey,
      name: conversion.name,
    });
    return false;
  }

  const storageKey = getStorageKey(conversionKey, transactionId);
  try {
    if (transactionId && window.localStorage.getItem(storageKey)) {
      debugLog("Conversion skipped: already fired for this Stripe session", {
        conversionKey,
        transactionId,
      });
      return false;
    }
  } catch {
    // Tracking should still work if storage is blocked by the browser.
  }

  window.gtag("event", "conversion", {
    send_to: sendTo(conversion.label),
    value: conversion.value,
    currency: conversion.currency,
    transaction_id: transactionId,
  });

  debugLog("Google Ads Conversion Fired", {
    conversionKey,
    name: conversion.name,
    transactionId,
  });

  try {
    if (transactionId) {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    }
  } catch {
    // No-op. Google Ads also receives transaction_id for its own deduping.
  }

  return true;
}

export function trackFreeTrialStartedConversion(options) {
  return trackGoogleAdsConversion("freeTrialStarted", options);
}
