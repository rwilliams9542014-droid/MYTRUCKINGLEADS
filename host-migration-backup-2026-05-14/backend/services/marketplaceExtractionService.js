function normalizedList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

export function buildInitialExtractionSnapshot({
  currentInsuranceCompany = "",
  currentPremium = null,
  powerUnits = null
} = {}) {
  return {
    aiExtractionStatus: "pending",
    extractedCurrentCarrier: String(currentInsuranceCompany || "").trim() || null,
    extractedCurrentPremium: Number.isFinite(Number(currentPremium)) ? Number(currentPremium) : null,
    extractedCoverageLimits: null,
    extractedVinNumbers: [],
    extractedVehicleCount: Number.isFinite(Number(powerUnits)) ? Number(powerUnits) : null,
    extractedDriverNames: [],
    extractedDriverLicenseStates: [],
    extractedLossHistorySummary: null
  };
}

export function mergeDocumentExtractionSnapshot(existing = {}, incoming = {}) {
  return {
    aiExtractionStatus: incoming.aiExtractionStatus || existing.aiExtractionStatus || "pending",
    extractedCurrentCarrier: incoming.extractedCurrentCarrier || existing.extractedCurrentCarrier || null,
    extractedCurrentPremium: incoming.extractedCurrentPremium ?? existing.extractedCurrentPremium ?? null,
    extractedCoverageLimits: incoming.extractedCoverageLimits || existing.extractedCoverageLimits || null,
    extractedVinNumbers: normalizedList([...(existing.extractedVinNumbers || []), ...(incoming.extractedVinNumbers || [])]),
    extractedVehicleCount: incoming.extractedVehicleCount ?? existing.extractedVehicleCount ?? null,
    extractedDriverNames: normalizedList([...(existing.extractedDriverNames || []), ...(incoming.extractedDriverNames || [])]),
    extractedDriverLicenseStates: normalizedList([...(existing.extractedDriverLicenseStates || []), ...(incoming.extractedDriverLicenseStates || [])]),
    extractedLossHistorySummary: incoming.extractedLossHistorySummary || existing.extractedLossHistorySummary || null
  };
}

export async function queueQuoteRequestExtraction(_quoteRequest, _documents = []) {
  return {
    queued: false,
    status: "pending",
    message: "AI extraction is prepared but not yet enabled."
  };
}
