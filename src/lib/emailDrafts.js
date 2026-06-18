function clean(value, fallback = "Not available") {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value ?? "").trim();
  return text || fallback;
}

export function normalizeEmailLead(lead = {}) {
  return {
    carrierName: clean(lead.carrierName || lead.name || lead.carrier_name, "Carrier"),
    dotNumber: clean(lead.dotNumber || lead.dot || lead.dot_number),
    mcNumber: clean(lead.mcNumber || lead.mc || lead.mc_number),
    phone: clean(lead.phone),
    email: String(lead.email || lead.email_address || "").trim(),
    state: clean(lead.state || lead.hq_state),
    cargoHauled: clean(lead.cargoHauled || lead.cargo || lead.cargo_hauled),
    renewalDate: clean(lead.renewalDate || lead.renewal_date || lead.insurance_expiration),
    leadType: clean(lead.leadType || lead.lead_type),
    powerUnits: clean(lead.powerUnits || lead.trucks || lead.vehicle_count || lead.fleetSize),
    drivers: clean(lead.drivers || lead.driver_count),
  };
}

export function emailDraftForLead(lead = {}) {
  const item = normalizeEmailLead(lead);
  return {
    subject: "Commercial Trucking Coverage Review",
    body: [
      `Hello ${item.carrierName},`,
      "",
      "I wanted to see if you would like help reviewing options for your commercial trucking coverage.",
      "",
      "Your DOT information shows:",
      `DOT #: ${item.dotNumber}`,
      `Power Units: ${item.powerUnits}`,
      `Cargo Hauled: ${item.cargoHauled}`,
      item.renewalDate !== "Not available" ? `Renewal / Filing Date: ${item.renewalDate}` : "",
      "",
      "If you would like a quote, reply with the best contact information and I can let you know what information is needed.",
      "",
      "Thank you,"
    ].filter((line) => line !== "").join("\n")
  };
}

export function openEmailClientForLeads(leads = []) {
  const normalized = leads.map(normalizeEmailLead);
  const allRecipients = normalized.map((lead) => lead.email).filter(Boolean);
  const recipients = [...new Set(allRecipients)];
  if (!recipients.length) {
    return { ok: false, message: "No email address is available for the selected carrier." };
  }

  const draft = emailDraftForLead(normalized[0]);
  const url = `mailto:${recipients.map((email) => encodeURIComponent(email)).join(",")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  window.location.href = url;
  const skipped = normalized.length - allRecipients.length;
  const duplicates = allRecipients.length - recipients.length;
  return {
    ok: true,
    message: `Opening your email app for ${recipients.length} carrier${recipients.length === 1 ? "" : "s"}. ${skipped} missing email${skipped === 1 ? "" : "s"}. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} removed.`
  };
}

export async function copyAiEmailDraft(lead = {}) {
  const draft = emailDraftForLead(lead);
  const text = `Subject: ${draft.subject}\n\n${draft.body}`;
  await navigator.clipboard.writeText(text);
  return draft;
}

export function canUseAiEmailDraft(user = {}) {
  const plan = String(user?.access?.plan || user?.plan || "").toLowerCase();
  return ["pro", "producer-pro", "premium", "agency"].includes(plan);
}
