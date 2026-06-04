import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge, Card } from "@/components/ui";
import ScoutEmptyState from "@/components/ScoutEmptyState";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  collectContactNumbers,
  formatAllContactNumbers,
  getContactNumberByType,
  getPrimaryContactNumber,
} from "@/lib/contactNumbers";
import { canUseAiEmailDraft, copyAiEmailDraft, openEmailClientForLeads } from "@/lib/emailDrafts";

const stages = [
  { id: "New", title: "New", color: "bg-brand-500" },
  { id: "Called", title: "Contacted", color: "bg-warning-500" },
  { id: "Quoted", title: "Quoted", color: "bg-accent-500" },
  { id: "Follow Up", title: "Follow Up", color: "bg-brand-300" },
  { id: "Negotiation", title: "Negotiation", color: "bg-warning-400" },
  { id: "Won", title: "Won", color: "bg-accent-600" },
  { id: "Lost", title: "Lost", color: "bg-navy-600" },
];

function normalizeLead(lead) {
  const status = lead.status === "Contacted" ? "Called" : (lead.status || "New");
  const contactNumbers = collectContactNumbers(lead);
  const primaryContact = getPrimaryContactNumber(contactNumbers);
  return {
    ...lead,
    status,
    name: lead.carrier_name || lead.carrierName || "Unknown carrier",
    dot: lead.dot_number || lead.dot || "",
    mc: lead.mc_number || lead.mc || "",
    state: lead.state || lead.physicalState || "",
    address: lead.address || lead.physicalAddress || "",
    phone: primaryContact?.number || lead.phone || "",
    phoneNumber: primaryContact?.number || lead.phone || "",
    fax: getContactNumberByType(contactNumbers, "fax")?.number || lead.fax || "",
    contactNumbers,
    email: lead.email || lead.email_address || "",
    leadType: lead.lead_type || lead.leadType || "",
    nextFollowUp: lead.next_follow_up || lead.nextFollowUp || "",
    lastContacted: lead.last_contacted || lead.lastContacted || "",
    trucks: lead.vehicle_count || lead.fleetSize || "",
    powerUnits: lead.power_units || lead.powerUnits || lead.vehicle_count || lead.fleetSize || "",
    drivers: lead.drivers || lead.driver_count || "",
    cargoHauled: lead.cargo_hauled || lead.cargoHauled || lead.cargo || "",
    renewalDate: lead.renewal_date || lead.renewalDate || lead.insurance_expiration || "",
    value: lead.estimated_value || "",
    lastActivity: lead.notes || "Saved lead",
  };
}

function leadForOutreach(lead) {
  return {
    ...lead,
    carrierName: lead.name,
    dotNumber: lead.dot,
    mcNumber: lead.mc,
    phone: lead.phone,
    contactNumbers: lead.contactNumbers || [],
    email: lead.email,
    state: lead.state,
    cargoHauled: lead.cargoHauled,
    renewalDate: lead.renewalDate,
    leadType: lead.leadType,
    powerUnits: lead.powerUnits || lead.trucks,
    drivers: lead.drivers,
  };
}

function phoneColumns(lead = {}) {
  const numbers = lead.contactNumbers || [];
  const primary = getPrimaryContactNumber(numbers);
  const business = getContactNumberByType(numbers, "business") || primary;
  const mobile = getContactNumberByType(numbers, "mobile");
  const fax = getContactNumberByType(numbers, "fax");
  return {
    primaryPhone: primary?.number || lead.phone || "",
    businessPhone: business?.number || "",
    mobilePhone: mobile?.number || "",
    faxNumber: fax?.number || lead.fax || "",
    allContactNumbers: formatAllContactNumbers(numbers),
  };
}

function contactSummary(lead = {}) {
  const numbers = lead.contactNumbers || [];
  const primary = getPrimaryContactNumber(numbers);
  const more = Math.max(0, numbers.length - (primary ? 1 : 0));
  return [primary?.number || lead.phone, more ? `+${more} more` : ""].filter(Boolean).join(" / ");
}

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function CrmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [draggedLead, setDraggedLead] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const aiDraftAllowed = canUseAiEmailDraft(user);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getLeads()
      .then((data) => {
        if (active) setLeads((data?.leads || []).map(normalizeLead));
      })
      .catch((err) => {
        if (active) setError(err.message || "Saved clients could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => stages.map((stage) => ({
    ...stage,
    cards: leads.filter((lead) => lead.status === stage.id || (stage.id === "New" && lead.status === "New Lead")),
  })), [leads]);

  const allCards = columns.flatMap((col) => col.cards.map((card) => ({ ...card, stage: col.title, stageColor: col.color })));

  async function moveLead(lead, toStatus) {
    const previous = leads;
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status: toStatus } : item));
    try {
      await api.updateLead(lead.id, { status: toStatus });
    } catch (err) {
      setLeads(previous);
      setError(err.message || "Lead status could not be updated.");
    }
  }

  function handleDrop(e, toStatus) {
    e.preventDefault();
    if (draggedLead && draggedLead.status !== toStatus) {
      moveLead(draggedLead, toStatus);
    }
    setDraggedLead(null);
    setDragOverStage(null);
  }

  async function hydrateRows(rows) {
    const dots = rows.map((lead) => lead.dot).filter(Boolean);
    if (!dots.length) return rows;
    const data = await api.enrichSelectedCarriers(dots, "crm");
    const byDot = new Map((data?.carriers || []).map((carrier) => {
      const normalized = normalizeLead(carrier);
      return [normalized.dot, normalized];
    }));
    const hydrated = rows.map((lead) => ({ ...lead, ...(byDot.get(lead.dot) || {}) }));
    setLeads((current) => current.map((lead) => ({ ...lead, ...(byDot.get(lead.dot) || {}) })));
    return hydrated;
  }

  async function emailLead(lead) {
    try {
      const [hydrated] = await hydrateRows([lead]);
      const result = openEmailClientForLeads([leadForOutreach(hydrated || lead)]);
      setError(result.ok ? "" : result.message);
      if (result.ok) setStatusMessage(result.message);
    } catch (err) {
      setError(err.message || "Carrier details could not be refreshed.");
    }
  }

  async function emailSelectedLeads() {
    const selectedRows = allCards.filter((lead) => selectedLeadIds.includes(lead.id));
    if (!selectedRows.length) {
      setError("Select at least one CRM carrier before emailing.");
      return;
    }
    try {
      const result = openEmailClientForLeads((await hydrateRows(selectedRows)).map(leadForOutreach));
      setError(result.ok ? "" : result.message);
      if (result.ok) setStatusMessage(result.message);
    } catch (err) {
      setError(err.message || "Selected carrier details could not be refreshed.");
    }
  }

  async function copyDraftForLead(lead) {
    if (!aiDraftAllowed) {
      setError("AI draft assistance is available on Pro and Agency plans.");
      return;
    }
    try {
      await copyAiEmailDraft(leadForOutreach(lead));
      setError("");
      setStatusMessage("AI email draft copied. Paste it into your email app.");
    } catch {
      setError("Copy failed. Your browser may not allow clipboard access.");
    }
  }

  function toggleSelectedLead(lead) {
    setSelectedLeadIds((current) => (
      current.includes(lead.id)
        ? current.filter((id) => id !== lead.id)
        : [...current, lead.id]
    ));
  }

  function toggleAllVisibleLeads() {
    const visibleIds = allCards.map((lead) => lead.id);
    if (!visibleIds.length) return;
    const allSelected = visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds(allSelected ? [] : visibleIds);
  }

  async function exportSelectedCsv() {
    const selectedRows = allCards.filter((lead) => selectedLeadIds.includes(lead.id));
    if (!selectedRows.length) return;
    let enrichedRows;
    try {
      enrichedRows = await hydrateRows(selectedRows);
    } catch (err) {
      setError(err.message || "Selected carrier details could not be refreshed for export.");
      return;
    }
    const headers = ["Carrier Name", "DOT Number", "MC Number", "Primary Phone", "Business Phone", "Mobile Phone", "Fax Number", "All Contact Numbers", "Email", "State", "Physical Address", "Lead Type", "Status", "Power Units", "Drivers", "Cargo Hauled", "Renewal Date"];
    const rows = enrichedRows.map((lead) => {
      const phones = phoneColumns(lead);
      return [
        lead.name,
        lead.dot,
        lead.mc,
        phones.primaryPhone,
        phones.businessPhone,
        phones.mobilePhone,
        phones.faxNumber,
        phones.allContactNumbers,
        lead.email,
        lead.state,
        lead.address,
        lead.leadType,
        lead.status,
        lead.powerUnits || lead.trucks,
        lead.drivers,
        lead.cargoHauled,
        lead.renewalDate,
      ].map(csvValue).join(",");
    });
    const csv = [headers.map(csvValue).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mytruckingleads-crm-selected.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Pipeline</h1>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Scout is reviewing your saved pipeline..." : `${allCards.length} saved client${allCards.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportSelectedCsv} disabled={!selectedLeadIds.length} className="btn-secondary px-3 py-2 text-sm">Export Selected</button>
          <button type="button" onClick={emailSelectedLeads} disabled={!selectedLeadIds.length} className="btn-secondary px-3 py-2 text-sm">Email Selected Leads</button>
          <button type="button" onClick={() => setSelectedLeadIds([])} disabled={!selectedLeadIds.length} className="btn-secondary px-3 py-2 text-sm">Clear Selection</button>
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {["kanban", "table"].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all border ${
                  viewMode === mode ? "bg-brand-500/20 text-brand-300 border-brand-500/30" : "text-navy-400 border-transparent hover:text-white hover:bg-white/5"
                }`}
              >
                {mode === "kanban" ? "Kanban View" : "Table View"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
          {error}
        </div>
      )}
      {statusMessage && (
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">
          {statusMessage}
        </div>
      )}

      {viewMode === "kanban" ? (
        <div className="w-full max-w-full overflow-x-auto pb-3">
          <div className="grid grid-flow-col auto-cols-[minmax(260px,320px)] lg:grid-flow-row lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 min-w-max lg:min-w-0">
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.025] transition-all duration-200 min-h-[360px] max-h-[calc(100vh-220px)] ${
                dragOverStage === column.id ? "ring-2 ring-brand-500/40" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(column.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-3 border-b border-white/[0.06] bg-navy-950/90 backdrop-blur">
                <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                <span className="text-xs text-navy-500 bg-navy-800 px-2 py-0.5 rounded-full">{column.cards.length}</span>
              </div>
              <div className="space-y-2 p-2 overflow-y-auto min-h-[240px]">
                {column.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggedLead(card)}
                    className="rounded-xl border border-white/[0.06] bg-navy-900/45 p-3 cursor-grab active:cursor-grabbing hover:border-white/12 hover:bg-navy-900/70 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-navy-900"
                          checked={selectedLeadIds.includes(card.id)}
                          onChange={() => toggleSelectedLead(card)}
                          aria-label={`Select ${card.name}`}
                        />
                        <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} state={{ from: `${location.pathname}${location.search}`, label: "Back to CRM" }} className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors hover:underline line-clamp-2">
                          {card.name}
                        </Link>
                      </div>
                      {card.state && <Badge variant="outline" className="text-[10px] shrink-0">{card.state}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-400">
                      {card.dot && <span className="font-mono">DOT {card.dot}</span>}
                      {card.mc && <span className="font-mono">{card.mc}</span>}
                      {contactSummary(card) && <span>{contactSummary(card)}</span>}
                      {card.email && <span className="truncate max-w-[220px]">{card.email}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{card.status}</Badge>
                      {card.leadType && <Badge variant="brand" className="text-[10px]">{card.leadType}</Badge>}
                    </div>
                    {card.nextFollowUp && <p className="text-[11px] text-navy-400 mt-2">Next follow-up: {card.nextFollowUp}</p>}
                    <p className="text-[11px] text-navy-500 mt-2 line-clamp-2">{card.lastActivity}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button type="button" onClick={() => emailLead(card)} className="text-[11px] text-brand-400 hover:text-brand-300">Email This Carrier</button>
                      {aiDraftAllowed && <button type="button" onClick={() => copyDraftForLead(card)} className="text-[11px] text-sky-300 hover:text-sky-200">Copy AI Draft</button>}
                    </div>
                  </div>
                ))}
                {!column.cards.length && (
                  <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-center text-xs text-navy-500">
                    No CRM records in this stage.
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden border-white/[0.08]">
          <div className="overflow-x-auto">
            <table className="premium-table w-full min-w-[1120px] border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-navy-900/70">
                  <th className="sticky top-0 text-left text-xs font-semibold text-navy-200 uppercase tracking-wider px-4 py-3 border-r border-white/[0.06] bg-navy-900/95">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-navy-900"
                      checked={allCards.length > 0 && allCards.every((lead) => selectedLeadIds.includes(lead.id))}
                      onChange={toggleAllVisibleLeads}
                      aria-label="Select all CRM carriers"
                    />
                  </th>
                  {["Company / Carrier", "DOT #", "MC #", "Phone", "Email", "State", "Lead Type", "Status", "Next Follow-Up", "Last Contacted", "Action"].map((heading) => (
                    <th key={heading} className="sticky top-0 text-left text-xs font-semibold text-navy-200 uppercase tracking-wider px-4 py-3 border-r border-white/[0.06] last:border-r-0 bg-navy-900/95">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCards.map((card) => (
                  <tr key={card.id} className="border-b border-white/[0.06] odd:bg-white/[0.015] hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3 border-r border-white/[0.04]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-navy-900"
                        checked={selectedLeadIds.includes(card.id)}
                        onChange={() => toggleSelectedLead(card)}
                        aria-label={`Select ${card.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-white/[0.04]">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} state={{ from: `${location.pathname}${location.search}`, label: "Back to CRM" }} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">
                        {card.name}
                      </Link>
                      <p className="text-xs text-navy-500 line-clamp-1">{card.lastActivity}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-300 font-mono border-r border-white/[0.04]">{card.dot || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 font-mono border-r border-white/[0.04]">{card.mc || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{contactSummary(card) || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04] max-w-[220px] truncate">{card.email || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.state || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.leadType || "-"}</td>
                    <td className="px-4 py-3 border-r border-white/[0.04]"><Badge variant="outline">{card.stage}</Badge></td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.nextFollowUp || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.lastContacted || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} state={{ from: `${location.pathname}${location.search}`, label: "Back to CRM" }} className="text-xs text-brand-400 hover:text-brand-300 font-medium">View</Link>
                        <button type="button" onClick={() => emailLead(card)} className="text-xs text-brand-400 hover:text-brand-300 font-medium">Email This Carrier</button>
                        {aiDraftAllowed && <button type="button" onClick={() => copyDraftForLead(card)} className="text-xs text-sky-300 hover:text-sky-200 font-medium">Copy AI Draft</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && allCards.length === 0 && (
        <div className="text-center py-12">
          <ScoutEmptyState
            title="Your pipeline is empty."
            message="Save leads from Lead Desk to start building your trucking book."
            actionLabel="Find Leads"
            onAction={() => navigate("/lead-desk")}
          />
        </div>
      )}
    </div>
  );
}
