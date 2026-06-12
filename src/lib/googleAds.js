export const GOOGLE_ADS_ID = "AW-18211312936";
export const GOOGLE_ADS_PURCHASE_SEND_TO = "AW-18211312936/2Z6KCLj1yrgcEKiq6utD";

const CONVERSION_STORAGE_PREFIX = "mtl_google_ads_conversion:";

function getStorageKey(transactionId) {
  return `${CONVERSION_STORAGE_PREFIX}${transactionId || "unknown"}`;
}

export function trackPurchaseConversion({ transactionId = "", value = 1.0, currency = "USD" } = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  const storageKey = getStorageKey(transactionId);
  try {
    if (transactionId && window.localStorage.getItem(storageKey)) {
      return false;
    }
  } catch {
    // Tracking should still work if storage is blocked by the browser.
  }

  window.gtag("event", "conversion", {
    send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
    value,
    currency,
    transaction_id: transactionId,
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
