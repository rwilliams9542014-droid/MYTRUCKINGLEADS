function normalizeLeadState(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

export function getAccountLeadState(user = {}) {
  return normalizeLeadState(
    user?.leadState ??
    user?.lead_state ??
    user?.access?.leadState ??
    user?.access?.lead_state
  );
}

export function resolvePlanLeadState({ selectedState = "", user = null, oneStatePlan = false } = {}) {
  const requestedState = normalizeLeadState(selectedState);
  if (!oneStatePlan) return requestedState;

  return getAccountLeadState(user) || requestedState;
}
