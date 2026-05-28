import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";
import OutreachComposer from "@/components/OutreachComposer";
import SafetyBarsPanel from "@/components/SafetyBarsPanel";
import { api } from "@/lib/api";
import {
  UNAVAILABLE,
  buildInspectionBars,
  getRenewalDisplay,
  normalizeLeadRecord,
} from "@/lib/leadMapping";

const stateOptions = ["Any","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const LEAD_DESK_STATE_KEY = "mytruckingleads.leadDeskState.v1";
const pageSizeOptions = [20, 30, 40];

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function dateRange(daysBack = 7) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - daysBack);
  return { from: formatDate(from), to: formatDate(to) };
}

function renewalRange(daysAhead = 30) {
  const from = new Date();
  const to = new Date();
  to.setDate(from.getDate() + daysAhead);
  return { from: formatDate(from), to: formatDate(to) };
}

function normalizeLead(lead, type) {
  const normalized = normalizeLeadRecord(lead, type);
  return {
    ...normalized,
    mc: normalized.mcNumber,
    trucks: normalized.powerUnits,
    cargo: normalized.cargoHauled,
    rating: normalized.safetyRating,
    renewalDisplay: getRenewalDisplay(normalized),
  };
}

function leadForOutreach(lead, activeTab) {
  return {
    ...lead,
    carrierName: lead.name,
    dotNumber: lead.dot,
    mcNumber: lead.mc,
    phone: lead.phone,
    email: lead.email,
    state: lead.state,
    cargoHauled: Array.isArray(lead.cargo) ? lead.cargo.join(", ") : lead.cargo,
    renewalDate: lead.renewalDisplay?.date || "",
    renewalDateSource: lead.renewalDisplay?.label || "",
    leadType: activeTab === "renewal" ? "Renewal Opportunity" : activeTab === "new_dot" ? "New DOT Lead" : "Marketplace Lead",
    powerUnits: lead.trucks,
    drivers: lead.drivers,
  };
}

function loadSavedLeadDeskState() {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.sessionStorage.getItem(LEAD_DESK_STATE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export default function LeadDeskPage() {
  const location = useLocation();
  const savedState = useMemo(loadSavedLeadDeskState, []);
  const didMountRef = useRef(false);
  const [activeTab, setActiveTab] = useState(savedState.activeTab || "new_dot");
  const [search, setSearch] = useState(savedState.search || "");
  const [state, setState] = useState(savedState.state || "Any");
  const [datePreset, setDatePreset] = useState(savedState.datePreset || "last_7");
  const [customFrom, setCustomFrom] = useState(savedState.customFrom || dateRange(7).from);
  const [customTo, setCustomTo] = useState(savedState.customTo || dateRange(7).to);
  const [leads, setLeads] = useState(Array.isArray(savedState.leads) ? savedState.leads : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [expandedDot, setExpandedDot] = useState("");
  const [safetyDetails, setSafetyDetails] = useState({});
  const [hasSearched, setHasSearched] = useState(Boolean(savedState.hasSearched));
  const [lastUpdated, setLastUpdated] = useState(savedState.lastUpdated || "");
  const [leadSourceMeta, setLeadSourceMeta] = useState(savedState.leadSourceMeta || null);
  const [composer, setComposer] = useState(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [pageSize, setPageSize] = useState(pageSizeOptions.includes(Number(savedState.pageSize)) ? Number(savedState.pageSize) : 20);
  const [currentPage, setCurrentPage] = useState(Number(savedState.currentPage) > 0 ? Number(savedState.currentPage) : 1);

  const range = useMemo(() => {
    if (datePreset === "custom") return { from: customFrom, to: customTo };
    if (activeTab === "renewal") {
      if (datePreset === "next_7") return renewalRange(7);
      if (datePreset === "next_60") return renewalRange(60);
      if (datePreset === "next_90") return renewalRange(90);
      return renewalRange(30);
    }
    if (datePreset === "today") {
      const today = formatDate(new Date());
      return { from: today, to: today };
    }
    if (datePreset === "last_14") return dateRange(14);
    if (datePreset === "last_30") return dateRange(30);
    return dateRange(7);
  }, [activeTab, customFrom, customTo, datePreset]);

  const windowDays = useMemo(() => {
    if (datePreset === "next_7") return 7;
    if (datePreset === "next_60") return 60;
    if (datePreset === "next_90") return 90;
    if (datePreset === "last_14") return 14;
    if (datePreset === "last_30" || datePreset === "next_30") return 30;
    if (datePreset === "today") return 1;
    return 7;
  }, [datePreset]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => [
      lead.name,
      lead.dot,
      lead.mc,
      lead.city,
      lead.state,
      lead.phone,
      lead.email,
    ].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [leads, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, pageSize, safeCurrentPage]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setDatePreset(activeTab === "renewal" ? "next_30" : "last_7");
    setLeads([]);
    setError("");
    setSaveMessage("");
    setExpandedDot("");
    setHasSearched(false);
    setLastUpdated("");
    setLeadSourceMeta(null);
    setSelectedLeadIds([]);
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    setSelectedLeadIds((current) => current.filter((id) => filteredLeads.some((lead) => lead.id === id)));
  }, [filteredLeads]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(LEAD_DESK_STATE_KEY, JSON.stringify({
        activeTab,
        search,
        state,
        datePreset,
        customFrom,
        customTo,
        leads,
        hasSearched,
        lastUpdated,
        leadSourceMeta,
        pageSize,
        currentPage: safeCurrentPage,
      }));
    } catch {
      // Session storage can be unavailable in private browsing modes.
    }
  }, [activeTab, customFrom, customTo, currentPage, datePreset, hasSearched, lastUpdated, leadSourceMeta, leads, pageSize, safeCurrentPage, search, state]);

  async function runSearch(event) {
    event?.preventDefault();
    const params = {
      q: search.trim(),
      from: range.from,
      to: range.to,
      days: windowDays,
      daysBack: windowDays,
      state: state === "Any" ? "" : state,
      limit: 100,
    };

    setLoading(true);
    setError("");
    setSaveMessage("");
    setExpandedDot("");

    try {
      const data = activeTab === "hot"
        ? await api.getMarketplaceLeads({ search, state: state === "Any" ? "" : state })
        : activeTab === "renewal"
          ? await api.getRenewalLeads(params)
          : await api.getNewDotLeads(params);
      const rows = activeTab === "hot"
        ? (data?.leads || data?.results || [])
        : (data?.leads || data?.carriers || data?.results || []);

      if (import.meta.env.DEV) {
        console.debug("[LeadDesk] endpoint result", {
          mode: activeTab,
          endpoint: activeTab === "renewal" ? "/api/leads/renewals" : activeTab === "hot" ? "/api/marketplace/leads" : "/api/leads/new",
          source: data?.source,
          rowCount: rows.length,
          firstRowKeys: rows[0] ? Object.keys(rows[0]) : [],
          hasInsuranceFields: Boolean(rows[0]?.insuranceCancelDate || rows[0]?.insuranceEffectiveDate || rows[0]?.insurance_expiration),
          hasInspectionFields: Boolean(rows[0]?.totalInspections || rows[0]?.smsSafety || rows[0]?.safety),
        });
      }

      setLeads(rows.map((lead) => normalizeLead(lead, activeTab)));
      setHasSearched(true);
      setCurrentPage(1);
      setLastUpdated(new Date().toLocaleString());
      setLeadSourceMeta({
        source: data?.dataSource || data?.source || "",
        lastImportTime: data?.lastImportTime || "",
        importedCarrierCount: data?.importedCarrierCount,
        message: data?.message || ""
      });
    } catch (err) {
      setHasSearched(true);
      setLeads([]);
      setCurrentPage(1);
      setLeadSourceMeta(null);
      setError(err.message || "Leads could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setState("Any");
    setDatePreset(activeTab === "renewal" ? "next_30" : "last_7");
    setCustomFrom(dateRange(7).from);
    setCustomTo(dateRange(7).to);
    setCurrentPage(1);
  }

  async function loadSafetyDetails(lead, { force = false } = {}) {
    if (!lead.dot) return;
    if (!force && safetyDetails[lead.dot]) return;

    try {
      const [profile, safety] = await Promise.allSettled([
        api.getCarrierProfile(lead.dot),
        api.getCarrierSafety(lead.dot),
      ]);
      const profileLead = profile.status === "fulfilled"
        ? normalizeLeadRecord(profile.value?.carrier || profile.value?.profile || profile.value, lead.type)
        : {};
      const safetyLead = safety.status === "fulfilled"
        ? normalizeLeadRecord(safety.value?.safety || safety.value?.carrier || safety.value, lead.type)
        : {};
      setSafetyDetails((current) => ({
        ...current,
        [lead.dot]: {
          ...lead,
          ...profileLead,
          ...safetyLead,
          dot: lead.dot,
          name: lead.name,
        },
      }));
    } catch {
      setSafetyDetails((current) => ({ ...current, [lead.dot]: lead }));
    }
  }

  async function toggleDetails(lead) {
    if (!lead.dot) return;
    const nextDot = expandedDot === lead.dot ? "" : lead.dot;
    setExpandedDot(nextDot);
    if (nextDot) await loadSafetyDetails(lead);
  }

  async function saveLead(lead) {
    setSaveMessage("Saving lead...");
    try {
      await api.addLead({
        carrier_name: lead.name,
        dot_number: lead.dot || null,
        mc_number: lead.mc || null,
        state: lead.state || null,
        status: "New",
        insurance_expiration: activeTab === "renewal" ? lead.renewalDisplay.date || null : null,
        notes: [
          lead.state ? `State: ${lead.state}` : "",
          lead.phone ? `Phone: ${lead.phone}` : "",
          lead.email ? `Email: ${lead.email}` : "",
          lead.cargo.length ? `Cargo: ${lead.cargo.join(", ")}` : "",
        ].filter(Boolean).join(" "),
      });
      setSaveMessage(`${lead.name} saved to CRM.`);
    } catch (err) {
      setSaveMessage(err.message || "Lead could not be saved.");
    }
  }

  function openComposer(channel, lead) {
    setComposer({
      channel: "email",
      lead: leadForOutreach(lead, activeTab),
    });
  }

  function openBulkEmailComposer() {
    const selectedLeads = filteredLeads
      .filter((lead) => selectedLeadIds.includes(lead.id))
      .map((lead) => leadForOutreach(lead, activeTab));

    if (!selectedLeads.length) {
      setSaveMessage("Select at least one lead before emailing.");
      return;
    }

    setComposer({ channel: "email", leads: selectedLeads });
  }

  function toggleSelectedLead(lead) {
    setSelectedLeadIds((current) => (
      current.includes(lead.id)
        ? current.filter((id) => id !== lead.id)
        : [...current, lead.id]
    ));
  }

  function toggleAllVisibleLeads() {
    const visibleIds = paginatedLeads.map((lead) => lead.id);
    if (!visibleIds.length) return;
    const allSelected = visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds((current) => (
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds]))
    ));
  }

  function csvValue(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function safetyIndicator(lead) {
    const { totalInspections, bars } = buildInspectionBars(lead);
    if (totalInspections) return `${totalInspections} inspections`;
    if (bars.length) return "Public inspection ratios available";
    return "";
  }

  function exportCsv(rowsToExport = filteredLeads, fileLabel = "") {
    if (!rowsToExport.length) return;
    const headers = [
      "DOT Number",
      "MC Number",
      "Carrier Name",
      "State",
      "Phone",
      "Email",
      "Power Units",
      "Drivers",
      "Cargo Hauled",
      "MCS-150 Updated",
      "Added / First Seen Date",
      "Lead Type",
      "Authority Status",
      "Insurance Filing Status",
      "Insurance Filing Effective Date",
      "Insurance Filing Cancellation Date",
      "Renewal / Filing Date",
      "Renewal / Filing Date Source",
      "Safety Indicator",
      "Status",
      "Last Refreshed",
    ];
    const rows = rowsToExport.map((lead) => [
      lead.dot,
      lead.mc,
      lead.name,
      lead.state,
      lead.phone,
      lead.email,
      lead.trucks,
      lead.drivers,
      lead.cargo.join(", "),
      lead.mcs150Date,
      lead.addedDate,
      activeTab === "renewal" ? "Renewal Lead" : activeTab === "new_dot" ? "New DOT Lead" : "Marketplace Lead",
      lead.authorityStatus,
      lead.insuranceFilingStatus,
      lead.insuranceEffectiveDate,
      lead.insuranceCancelDate,
      lead.renewalDisplay?.date || "",
      lead.renewalDisplay?.label || "",
      safetyIndicator(safetyDetails[lead.dot] || lead),
      lead.rating,
      lastUpdated,
    ].map(csvValue).join(","));
    const csv = [headers.map(csvValue).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const today = formatDate(new Date());
    const type = fileLabel || (activeTab === "renewal" ? "renewal-leads" : activeTab === "new_dot" ? "new-dot-leads" : "marketplace-leads");
    const link = document.createElement("a");
    link.href = url;
    link.download = `mytruckingleads-${type}-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSelectedCsv() {
    const selectedRows = filteredLeads.filter((lead) => selectedLeadIds.includes(lead.id));
    exportCsv(selectedRows, "selected-leads");
  }

  async function copyEmails() {
    const values = filteredLeads
      .map((lead) => lead.email)
      .filter(Boolean);
    if (!values.length) {
      setSaveMessage("No emails available in current results.");
      return;
    }
    try {
      await navigator.clipboard.writeText(values.join("\n"));
      setSaveMessage(`${values.length} email${values.length === 1 ? "" : "s"} copied.`);
    } catch {
      setSaveMessage("Copy failed. Your browser may not allow clipboard access.");
    }
  }

  const tabs = [
    { id: "new_dot", label: "New DOT Leads" },
    { id: "renewal", label: "Renewal Opportunities" },
    { id: "hot", label: "Hot Leads" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Desk</h1>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Searching..." : hasSearched ? `${filteredLeads.length} result${filteredLeads.length === 1 ? "" : "s"} found` : "Choose filters, then search leads."}
          </p>
        </div>
        {lastUpdated && <p className="text-xs text-navy-500">Last updated {lastUpdated}</p>}
      </div>
      {activeTab === "new_dot" && leadSourceMeta && (
        <div className="rounded-xl border border-white/[0.06] bg-navy-900/35 p-3 text-xs text-navy-300">
          <span className="font-semibold text-white">Data source:</span> {leadSourceMeta.source || "FMCSA Open Data / Database"}
          {leadSourceMeta.lastImportTime && <span> · Last import {new Date(leadSourceMeta.lastImportTime).toLocaleString()}</span>}
          {leadSourceMeta.importedCarrierCount !== undefined && <span> · Imported carriers {leadSourceMeta.importedCarrierCount}</span>}
          {leadSourceMeta.message && <span> · {leadSourceMeta.message}</span>}
        </div>
      )}

      <div className="flex gap-1 border-b border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === tab.id ? "text-white bg-white/5 border-b-2 border-brand-500" : "text-navy-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <form onSubmit={runSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_220px] gap-3">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                className="input-field pl-10"
                placeholder="Search company, DOT, city, phone, or email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <select className="input-field" value={state} onChange={(e) => {
              setState(e.target.value);
              setCurrentPage(1);
            }}>
              {stateOptions.map((item) => <option key={item} value={item} className="bg-navy-900">{item}</option>)}
            </select>
            {activeTab !== "hot" && (
              <select className="input-field" value={datePreset} onChange={(e) => {
                setDatePreset(e.target.value);
                setCurrentPage(1);
              }}>
                {activeTab === "renewal" ? (
                  <>
                    <option value="next_7" className="bg-navy-900">Next 7 Days</option>
                    <option value="next_30" className="bg-navy-900">Next 30 Days</option>
                    <option value="next_60" className="bg-navy-900">Next 60 Days</option>
                    <option value="next_90" className="bg-navy-900">Next 90 Days</option>
                  </>
                ) : (
                  <>
                    <option value="today" className="bg-navy-900">Today</option>
                    <option value="last_7" className="bg-navy-900">Last 7 Days</option>
                    <option value="last_14" className="bg-navy-900">Last 14 Days</option>
                    <option value="last_30" className="bg-navy-900">Last 30 Days</option>
                  </>
                )}
                <option value="custom" className="bg-navy-900">Custom Range</option>
              </select>
            )}
          </div>

          {activeTab !== "hot" && datePreset === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="date" className="input-field" value={customFrom} onChange={(e) => {
                setCustomFrom(e.target.value);
                setCurrentPage(1);
              }} />
              <input type="date" className="input-field" value={customTo} onChange={(e) => {
                setCustomTo(e.target.value);
                setCurrentPage(1);
              }} />
            </div>
          )}

          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={loading}>
                {loading ? "Searching..." : activeTab === "renewal" ? "Search Renewal Opportunities" : activeTab === "new_dot" ? "Search New DOT Leads" : "Search Leads"}
              </Button>
              <button type="button" onClick={resetFilters} className="btn-secondary px-4 py-2 text-sm">Reset Filters</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => exportCsv()} disabled={!filteredLeads.length} className="btn-secondary px-4 py-2 text-sm">Export CSV</button>
              <button type="button" onClick={exportSelectedCsv} disabled={!selectedLeadIds.length} className="btn-secondary px-4 py-2 text-sm">Export Selected</button>
              <button type="button" onClick={copyEmails} disabled={!filteredLeads.length} className="btn-secondary px-4 py-2 text-sm">Copy Emails</button>
              <button type="button" onClick={openBulkEmailComposer} disabled={!selectedLeadIds.length} className="btn-secondary px-4 py-2 text-sm">Email Selected Leads</button>
              <button type="button" onClick={() => setSelectedLeadIds([])} disabled={!selectedLeadIds.length} className="btn-secondary px-4 py-2 text-sm">Clear Selection</button>
            </div>
          </div>
        </form>
      </Card>

      {error && <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">{error}</div>}
      {saveMessage && <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">{saveMessage}</div>}

      <Card className="!p-0 overflow-hidden">
        {hasSearched && filteredLeads.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-navy-300">
              Showing {(safeCurrentPage - 1) * pageSize + 1}-{Math.min(safeCurrentPage * pageSize, filteredLeads.length)} of {filteredLeads.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-navy-400">
                Leads per page
                <select
                  className="input-field ml-2 h-9 w-24 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size} className="bg-navy-900">{size}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage <= 1}
              >
                Previous
              </button>
              <span className="text-xs text-navy-400">Page {safeCurrentPage} of {totalPages}</span>
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="premium-table w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-navy-900"
                    checked={paginatedLeads.length > 0 && paginatedLeads.every((lead) => selectedLeadIds.includes(lead.id))}
                    onChange={toggleAllVisibleLeads}
                    aria-label="Select all visible leads"
                  />
                </th>
                {["Company", "DOT / MC", "Location", "Fleet", "Cargo", "MCS-150", activeTab === "new_dot" ? "Added / First Seen" : activeTab === "renewal" ? "Renewal / Filing Date" : "Submitted", "Status", "Actions"].map((heading) => (
                  <th key={heading} className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-4">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.map((lead) => (
                <Fragment key={lead.id}>
                  <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-navy-900"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleSelectedLead(lead)}
                        aria-label={`Select ${lead.name}`}
                      />
                    </td>
                    <td className="px-6 py-3">
                      {lead.dot ? (
                        <Link to={`/carrier/${lead.dot}`} state={{ from: `${location.pathname}${location.search}`, label: "Back to search results" }} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">{lead.name}</Link>
                      ) : (
                        <p className="text-sm font-medium text-white">{lead.name}</p>
                      )}
                      <p className="text-xs text-navy-500">{lead.phone || lead.email || "Contact details unavailable"}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-sm text-navy-300 font-mono">{lead.dot ? `DOT ${lead.dot}` : "-"}</p>
                      {lead.mc && <p className="text-xs text-navy-500 font-mono">{lead.mc}</p>}
                    </td>
                    <td className="px-6 py-3 text-sm text-navy-300">{[lead.city, lead.state].filter(Boolean).join(", ") || "-"}</td>
                    <td className="px-6 py-3 text-sm text-navy-300">
                      {[lead.trucks && `${lead.trucks} power units`, lead.drivers && `${lead.drivers} drivers`].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td className="px-6 py-3 text-sm text-navy-300">{lead.cargo.length ? lead.cargo.slice(0, 2).join(", ") : UNAVAILABLE}</td>
                    <td className="px-6 py-3 text-sm text-navy-300">{lead.mcs150Date || UNAVAILABLE}</td>
                    <td className="px-6 py-3 text-sm text-navy-300">
                      {activeTab === "renewal" ? (
                        <>
                          <p>{lead.renewalDisplay.date || UNAVAILABLE}</p>
                          <p className="text-xs text-navy-500">{lead.renewalDisplay.label}</p>
                        </>
                      ) : (
                        lead.addedDate || UNAVAILABLE
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={lead.rating === "Satisfactory" ? "success" : lead.rating === "Conditional" ? "warning" : "outline"}>
                        {lead.authorityStatus || lead.rating}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {lead.dot && <Link to={`/carrier/${lead.dot}`} state={{ from: `${location.pathname}${location.search}`, label: "Back to search results" }} className="text-xs text-brand-400 hover:text-brand-300 font-medium">View Carrier Profile</Link>}
                        {lead.dot && <button onClick={() => toggleDetails(lead)} className="text-xs text-navy-300 hover:text-white font-medium">{expandedDot === lead.dot ? "Hide" : "Details"}</button>}
                        <button onClick={() => openComposer("email", lead)} className="text-xs text-brand-400 hover:text-brand-300 font-medium">Email This Carrier</button>
                        {activeTab === "hot" ? (
                          <Button size="sm" className="text-xs">Buy</Button>
                        ) : (
                          <button onClick={() => saveLead(lead)} className="text-xs text-accent-400 hover:text-accent-300 font-medium">Add to CRM</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedDot === lead.dot && (
                    <tr className="border-b border-white/[0.03] bg-navy-950/40">
                      <td colSpan={10} className="px-6 py-5">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                          <div>
                            <p className="text-xs text-navy-500 uppercase mb-2">Insurance Filing</p>
                            <div className="space-y-1 text-sm text-navy-300">
                              <p>Status: <span className="text-white">{lead.insuranceFilingStatus || UNAVAILABLE}</span></p>
                              <p>Effective: <span className="text-white">{lead.insuranceEffectiveDate || UNAVAILABLE}</span></p>
                              <p>Cancellation: <span className="text-white">{lead.insuranceCancelDate || UNAVAILABLE}</span></p>
                              <p>Company: <span className="text-white">{lead.insuranceCompany || UNAVAILABLE}</span></p>
                              <p>Filing Type: <span className="text-white">{lead.filingType || UNAVAILABLE}</span></p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-navy-500 uppercase mb-2">Safety / Inspection Indicator</p>
                            <SafetyBarsPanel record={safetyDetails[lead.dot] || lead} compact />
                          </div>
                          <div>
                            <p className="text-xs text-navy-500 uppercase mb-2">Actions</p>
                            <div className="flex flex-wrap gap-2">
                              {lead.dot && <Link to={`/carrier/${lead.dot}`} state={{ from: `${location.pathname}${location.search}`, label: "Back to search results" }} className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10">View Carrier Profile</Link>}
                              <button onClick={() => openComposer("email", lead)} className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10">Email This Carrier</button>
                              <button onClick={() => saveLead(lead)} className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10">Add to CRM</button>
                              <button onClick={() => loadSafetyDetails(lead, { force: true })} className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10">Refresh FMCSA Data</button>
                              <span className="text-xs text-navy-500 self-center">Ask AI unavailable unless backend supports it.</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && hasSearched && filteredLeads.length === 0 && (
          <div className="text-center py-12">
            <p className="text-navy-400 text-sm">No leads found. Try widening your date range or removing filters.</p>
          </div>
        )}
        {!loading && !hasSearched && (
          <div className="text-center py-12">
            <p className="text-navy-400 text-sm">No search has been run yet.</p>
          </div>
        )}
      </Card>
      <OutreachComposer
        open={Boolean(composer)}
        channel="email"
        lead={composer?.lead || {}}
        leads={composer?.leads || []}
        intent={activeTab === "renewal" ? "renewal" : "new-dot"}
        onClose={() => setComposer(null)}
      />
    </div>
  );
}
