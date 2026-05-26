import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";

const stateOptions = ["Any","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

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

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function splitCargo(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLead(lead, type) {
  const dot = pick(lead.dotNumber, lead.dot_number, lead.dot);
  const name = pick(lead.carrierName, lead.carrier_name, lead.legalName, lead.name, "Unknown carrier");
  return {
    id: pick(lead.id, dot, `${name}-${lead.phone}`),
    type,
    name,
    dot,
    mc: pick(lead.mcNumber, lead.mc_number, lead.mc),
    state: pick(lead.state, lead.hq_state),
    city: pick(lead.city, lead.hq_city),
    trucks: pick(lead.fleetSize, lead.powerUnits, lead.vehicle_count, lead.vehicleCount),
    drivers: pick(lead.drivers, lead.driver_count, lead.driverCount),
    phone: pick(lead.phone, lead.phoneNumber, lead.cell_phone),
    email: pick(lead.email),
    rating: pick(lead.safetyRating, lead.safety_rating, "Not rated"),
    cargo: splitCargo(pick(lead.cargoHauled, lead.cargo_hauled, lead.cargo, lead.cargoTypes)),
    date: type === "new_dot"
      ? pick(lead.addDate, lead.add_date, lead.dateCreated)
      : pick(lead.insurance_expiration, lead.insuranceExpiration, lead.insuranceExpirationDate),
    coverage: pick(lead.coverage, lead.coverage_type),
    price: pick(lead.price, lead.purchasePrice),
    completeness: pick(lead.data_completeness_percent, lead.completeness),
    raw: lead,
  };
}

export default function LeadDeskPage() {
  const [activeTab, setActiveTab] = useState("new_dot");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("Any");
  const [datePreset, setDatePreset] = useState("last_7");
  const [customFrom, setCustomFrom] = useState(dateRange(7).from);
  const [customTo, setCustomTo] = useState(dateRange(7).to);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

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
    if (datePreset === "last_30") return dateRange(30);
    return dateRange(7);
  }, [activeTab, customFrom, customTo, datePreset]);

  useEffect(() => {
    setDatePreset(activeTab === "renewal" ? "next_30" : "last_7");
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    const params = {
      from: range.from,
      to: range.to,
      state: state === "Any" ? "" : state,
      limit: 100,
    };

    setLoading(true);
    setError("");

    const request = activeTab === "hot"
      ? api.getMarketplaceLeads({ search, state: state === "Any" ? "" : state })
      : activeTab === "renewal"
        ? api.getRenewalLeads(params)
        : api.getNewDotLeads(params);

    request
      .then((data) => {
        if (!active) return;
        const rows = activeTab === "hot"
          ? (data?.leads || data?.results || [])
          : (data?.leads || data?.carriers || data?.results || []);
        setLeads(rows.map((lead) => normalizeLead(lead, activeTab)));
      })
      .catch((err) => {
        if (active) setError(err.message || "Leads could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, range.from, range.to, search, state]);

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

  async function saveLead(lead) {
    setSaveMessage("Saving lead...");
    try {
      await api.addLead({
        carrier_name: lead.name,
        dot_number: lead.dot || null,
        mc_number: lead.mc || null,
        state: lead.state || null,
        status: "New",
        insurance_expiration: activeTab === "renewal" ? lead.date || null : null,
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

  const tabs = [
    { id: "new_dot", label: "New DOT" },
    { id: "renewal", label: "Renewals" },
    { id: "hot", label: "Hot Leads" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Desk</h1>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Loading live leads..." : `${filteredLeads.length} live lead${filteredLeads.length === 1 ? "" : "s"} found`}
          </p>
        </div>
      </div>

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

      <Card className="space-y-4">
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input-field" value={state} onChange={(e) => setState(e.target.value)}>
            {stateOptions.map((item) => <option key={item} value={item} className="bg-navy-900">{item}</option>)}
          </select>
          {activeTab !== "hot" && (
            <select className="input-field" value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
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
                  <option value="last_30" className="bg-navy-900">Last 30 Days</option>
                </>
              )}
              <option value="custom" className="bg-navy-900">Custom Range</option>
            </select>
          )}
        </div>
        {activeTab !== "hot" && datePreset === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="date" className="input-field" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" className="input-field" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </Card>

      {error && <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">{error}</div>}
      {saveMessage && <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">{saveMessage}</div>}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Company", "DOT / MC", "Location", "Fleet", "Rating", activeTab === "new_dot" ? "Registered" : activeTab === "renewal" ? "Expires" : "Submitted", "Actions"].map((heading) => (
                  <th key={heading} className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-4">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3">
                    {lead.dot ? (
                      <Link to={`/carrier/${lead.dot}`} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">{lead.name}</Link>
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
                    {[lead.trucks && `${lead.trucks} trucks`, lead.drivers && `${lead.drivers} drivers`].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="px-6 py-3"><Badge variant={lead.rating === "Satisfactory" ? "success" : lead.rating === "Conditional" ? "warning" : "outline"}>{lead.rating}</Badge></td>
                  <td className="px-6 py-3 text-sm text-navy-300">{lead.date || "-"}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {lead.dot && <Link to={`/carrier/${lead.dot}`} className="text-xs text-brand-400 hover:text-brand-300 font-medium">View</Link>}
                      {activeTab === "hot" ? (
                        <Button size="sm" className="text-xs">Buy</Button>
                      ) : (
                        <button onClick={() => saveLead(lead)} className="text-xs text-accent-400 hover:text-accent-300 font-medium">+ CRM</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filteredLeads.length === 0 && (
          <div className="text-center py-12">
            <p className="text-navy-400 text-sm">No leads match this search.</p>
            <p className="text-navy-600 text-xs mt-2">Try a different state, date range, or search term.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
