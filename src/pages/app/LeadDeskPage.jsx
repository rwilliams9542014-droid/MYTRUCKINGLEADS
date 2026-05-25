import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";

const mockNewDotLeads = [
  { id: 1, name: "Martinez Trucking LLC", dot: "4102847", mc: "MC-1298374", state: "TX", city: "Houston", trucks: 4, drivers: 5, type: "new_dot", date: "2026-05-23", phone: "(713) 555-0142", rating: "None", cargo: ["General Freight"], hasEmail: true },
  { id: 2, name: "Bayou Express LLC", dot: "4110923", mc: "MC-1310482", state: "LA", city: "Baton Rouge", trucks: 2, drivers: 2, type: "new_dot", date: "2026-05-24", phone: "(225) 555-0143", rating: "None", cargo: ["Household Goods"], hasEmail: true },
  { id: 3, name: "Heartland Freight Co", dot: "4098331", mc: "MC-1301892", state: "OH", city: "Columbus", trucks: 3, drivers: 3, type: "new_dot", date: "2026-05-22", phone: "(614) 555-0167", rating: "None", cargo: ["Building Materials"], hasEmail: false },
  { id: 4, name: "Blue Ridge Carriers", dot: "4105882", mc: "MC-1305519", state: "NC", city: "Charlotte", trucks: 6, drivers: 7, type: "new_dot", date: "2026-05-21", phone: "(704) 555-0189", rating: "None", cargo: ["General Freight", "Machinery"], hasEmail: true },
  { id: 5, name: "Desert Sun Transport", dot: "4099102", mc: "MC-1302847", state: "AZ", city: "Phoenix", trucks: 5, drivers: 5, type: "new_dot", date: "2026-05-23", phone: "(602) 555-0177", rating: "None", cargo: ["Refrigerated Food"], hasEmail: true },
  { id: 6, name: "Mountain Pass Freight", dot: "4112003", mc: "MC-1311920", state: "CO", city: "Denver", trucks: 3, drivers: 4, type: "new_dot", date: "2026-05-24", phone: "(303) 555-0199", rating: "None", cargo: ["General Freight"], hasEmail: false },
];

const mockRenewalLeads = [
  { id: 7, name: "Pacific Ridge Transport", dot: "3891024", mc: "MC-982114", state: "CA", city: "Fresno", trucks: 12, drivers: 14, type: "renewal", date: "2026-05-28", phone: "(559) 555-0198", rating: "Satisfactory", cargo: ["General Freight", "Machinery"], hasEmail: true },
  { id: 8, name: "Summit Logistics Inc", dot: "3774219", mc: "MC-891203", state: "IL", city: "Chicago", trucks: 22, drivers: 28, type: "renewal", date: "2026-06-01", phone: "(312) 555-0234", rating: "Satisfactory", cargo: ["Intermodal Cont.", "General Freight"], hasEmail: true },
  { id: 9, name: "Great Plains Haul Co", dot: "3920174", mc: "MC-1011284", state: "KS", city: "Wichita", trucks: 8, drivers: 9, type: "renewal", date: "2026-05-30", phone: "(316) 555-0156", rating: "Conditional", cargo: ["Grain", "Livestock"], hasEmail: true },
  { id: 10, name: "Cascade Freight Lines", dot: "3845201", mc: "MC-945623", state: "WA", city: "Seattle", trucks: 15, drivers: 18, type: "renewal", date: "2026-05-26", phone: "(206) 555-0211", rating: "Satisfactory", cargo: ["Logs/Poles", "Building Materials"], hasEmail: true },
  { id: 11, name: "Iron Horse Logistics", dot: "3801456", mc: "MC-923501", state: "PA", city: "Pittsburgh", trucks: 18, drivers: 22, type: "renewal", date: "2026-06-03", phone: "(412) 555-0192", rating: "Satisfactory", cargo: ["Metal/Sheets", "Machinery"], hasEmail: true },
  { id: 12, name: "Gulf Coast Express", dot: "3867102", mc: "MC-958412", state: "FL", city: "Tampa", trucks: 9, drivers: 11, type: "renewal", date: "2026-06-05", phone: "(813) 555-0188", rating: "Satisfactory", cargo: ["General Freight"], hasEmail: false },
];

const mockHotLeads = [
  { id: 13, name: "JR Transport Services", dot: "4108821", state: "TX", city: "Dallas", trucks: 3, phone: "(214) 555-0245", email: "jr@jrtransport.com", coverage: "Full Package", tier: "premium", price: "$45", submitted: "2 hours ago", completeness: 95 },
  { id: 14, name: "Midwest Carrier Inc", dot: "3998102", state: "MO", city: "Kansas City", trucks: 7, phone: "(816) 555-0177", email: "ops@midwestcarrier.com", coverage: "Auto Liability", tier: "standard", price: "$25", submitted: "4 hours ago", completeness: 72 },
  { id: 15, name: "Sunrise Hauling", dot: "", state: "GA", city: "Atlanta", trucks: 1, phone: "(404) 555-0133", email: "", coverage: "Auto Liability", tier: "basic", price: "$10", submitted: "6 hours ago", completeness: 35 },
  { id: 16, name: "Valley Fresh Logistics", dot: "4101293", state: "CA", city: "Bakersfield", trucks: 5, phone: "(661) 555-0209", email: "valleyfresh@gmail.com", coverage: "Full Package", tier: "premium", price: "$45", submitted: "8 hours ago", completeness: 98 },
  { id: 17, name: "Thunder Road LLC", dot: "4099877", state: "OK", city: "Oklahoma City", trucks: 2, phone: "(405) 555-0162", email: "thunderroad@yahoo.com", coverage: "Cargo", tier: "standard", price: "$25", submitted: "1 day ago", completeness: 68 },
];

const cargoOptions = ["General Freight", "Household Goods", "Building Materials", "Machinery", "Refrigerated Food", "Intermodal Cont.", "Grain", "Livestock", "Logs/Poles", "Metal/Sheets", "Hazardous Materials"];
const ratingOptions = ["Any", "Satisfactory", "Conditional", "None/Unrated"];
const stateOptions = ["Any","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const tabs = [
  { id: "new_dot", label: "New DOT", count: mockNewDotLeads.length },
  { id: "renewal", label: "Renewals", count: mockRenewalLeads.length },
  { id: "hot", label: "Hot Leads", count: mockHotLeads.length },
];

export default function LeadDeskPage() {
  const [activeTab, setActiveTab] = useState("new_dot");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ state: "Any", rating: "Any", cargo: [], minTrucks: "", maxTrucks: "", hasEmail: false });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  function getLeads() {
    if (activeTab === "hot") return mockHotLeads;
    const source = activeTab === "new_dot" ? mockNewDotLeads : mockRenewalLeads;
    let result = [...source];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) || l.dot.includes(q) || l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q)
      );
    }
    if (filters.state !== "Any") result = result.filter((l) => l.state === filters.state);
    if (filters.rating !== "Any") {
      if (filters.rating === "None/Unrated") result = result.filter((l) => l.rating === "None");
      else result = result.filter((l) => l.rating === filters.rating);
    }
    if (filters.cargo.length > 0) result = result.filter((l) => l.cargo.some((c) => filters.cargo.includes(c)));
    if (filters.minTrucks) result = result.filter((l) => l.trucks >= parseInt(filters.minTrucks));
    if (filters.maxTrucks) result = result.filter((l) => l.trucks <= parseInt(filters.maxTrucks));
    if (filters.hasEmail) result = result.filter((l) => l.hasEmail);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = a.date.localeCompare(b.date);
      else if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "trucks") cmp = a.trucks - b.trucks;
      else if (sortField === "state") cmp = a.state.localeCompare(b.state);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }

  const leads = getLeads();

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === leads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(leads.map((l) => l.id)));
  }

  function toggleCargo(cargo) {
    setFilters((prev) => ({
      ...prev,
      cargo: prev.cargo.includes(cargo) ? prev.cargo.filter((c) => c !== cargo) : [...prev.cargo, cargo],
    }));
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <svg className="w-3 h-3 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return <svg className={`w-3 h-3 text-brand-400 ${sortDir === "asc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Desk</h1>
          <p className="text-navy-400 text-sm mt-1">
            {activeTab === "hot" ? "Purchase hot leads from truckers requesting quotes" : `${leads.length} leads matching your criteria`}
          </p>
        </div>
        {activeTab !== "hot" && selectedIds.size > 0 && (
          <Button variant="secondary" size="sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedIds(new Set()); setSearchQuery(""); }}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? "text-white bg-white/5 border-b-2 border-brand-500"
                : "text-navy-400 hover:text-white"
            }`}
          >
            {tab.label}
            {tab.id === "hot" && <span className="w-2 h-2 bg-danger-500 rounded-full animate-pulse" />}
            <span className="text-xs bg-navy-800 px-1.5 py-0.5 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search & Filters (not for hot leads) */}
      {activeTab !== "hot" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by company, DOT, city, or state..."
                className="input-field pl-10 py-2.5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary text-sm ${showFilters ? "border-brand-500/30 text-brand-300" : ""}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters {filters.state !== "Any" || filters.rating !== "Any" || filters.cargo.length > 0 || filters.hasEmail ? "(Active)" : ""}
            </button>
          </div>

          {showFilters && (
            <Card className="animate-slide-up">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-navy-400 mb-1.5">State</label>
                  <select className="input-field text-sm py-2" value={filters.state} onChange={(e) => setFilters((p) => ({ ...p, state: e.target.value }))}>
                    {stateOptions.map((s) => <option key={s} value={s} className="bg-navy-900">{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy-400 mb-1.5">Safety Rating</label>
                  <select className="input-field text-sm py-2" value={filters.rating} onChange={(e) => setFilters((p) => ({ ...p, rating: e.target.value }))}>
                    {ratingOptions.map((r) => <option key={r} value={r} className="bg-navy-900">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy-400 mb-1.5">Min Trucks</label>
                  <input type="number" className="input-field text-sm py-2" placeholder="e.g. 1" value={filters.minTrucks} onChange={(e) => setFilters((p) => ({ ...p, minTrucks: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy-400 mb-1.5">Max Trucks</label>
                  <input type="number" className="input-field text-sm py-2" placeholder="e.g. 50" value={filters.maxTrucks} onChange={(e) => setFilters((p) => ({ ...p, maxTrucks: e.target.value }))} />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-navy-400 mb-2">Cargo Types</label>
                <div className="flex flex-wrap gap-2">
                  {cargoOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCargo(c)}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                        filters.cargo.includes(c) ? "bg-brand-500/20 text-brand-300 border border-brand-500/30" : "bg-navy-800 text-navy-400 border border-transparent hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={filters.hasEmail} onChange={(e) => setFilters((p) => ({ ...p, hasEmail: e.target.checked }))} className="rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30" />
                  <span className="text-sm text-navy-300">Has email on file</span>
                </label>
                <button onClick={() => setFilters({ state: "Any", rating: "Any", cargo: [], minTrucks: "", maxTrucks: "", hasEmail: false })} className="text-xs text-navy-500 hover:text-white ml-auto">
                  Clear Filters
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Hot Leads Tab */}
      {activeTab === "hot" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 glass-card">
            <div className="w-10 h-10 bg-danger-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">Hot Leads are truckers actively requesting insurance quotes</p>
              <p className="text-xs text-navy-400 mt-0.5">Purchase individual leads based on their completeness tier. Premium leads include full contact info, DOT number, and coverage details.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { tier: "Premium", price: "$45", desc: "Full info: DOT, email, phone, coverage needs, fleet details", color: "brand" },
              { tier: "Standard", price: "$25", desc: "Partial info: Phone, coverage type, basic company details", color: "warning" },
              { tier: "Basic", price: "$10", desc: "Minimal info: Name, phone, state only", color: "default" },
            ].map((t) => (
              <div key={t.tier} className="glass-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={t.color}>{t.tier}</Badge>
                  <span className="text-lg font-bold text-white">{t.price}</span>
                </div>
                <p className="text-[11px] text-navy-400">{t.desc}</p>
              </div>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-4">Company</th>
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Location</th>
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Coverage</th>
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Tier</th>
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Completeness</th>
                    <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Submitted</th>
                    <th className="text-right text-xs font-medium text-navy-400 uppercase px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mockHotLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-white">{lead.name}</p>
                        <p className="text-xs text-navy-500">{lead.trucks} truck{lead.trucks > 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-navy-300">{lead.city}, {lead.state}</td>
                      <td className="px-4 py-4 text-sm text-navy-300">{lead.coverage}</td>
                      <td className="px-4 py-4">
                        <Badge variant={lead.tier === "premium" ? "brand" : lead.tier === "standard" ? "warning" : "default"}>
                          {lead.tier} - {lead.price}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-navy-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${lead.completeness >= 80 ? "bg-accent-500" : lead.completeness >= 50 ? "bg-warning-500" : "bg-navy-600"}`} style={{ width: `${lead.completeness}%` }} />
                          </div>
                          <span className="text-xs text-navy-400">{lead.completeness}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-navy-400">{lead.submitted}</td>
                      <td className="px-6 py-4 text-right">
                        <Button size="sm" className="text-xs">
                          Buy {lead.price}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        /* Normal Lead Table */
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-6 py-4 w-10">
                    <input type="checkbox" checked={selectedIds.size === leads.length && leads.length > 0} onChange={toggleSelectAll} className="rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30" />
                  </th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <span className="flex items-center gap-1">Company <SortIcon field="name" /></span>
                  </th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">DOT / MC</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4 cursor-pointer select-none" onClick={() => toggleSort("state")}>
                    <span className="flex items-center gap-1">Location <SortIcon field="state" /></span>
                  </th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4 cursor-pointer select-none" onClick={() => toggleSort("trucks")}>
                    <span className="flex items-center gap-1">Fleet <SortIcon field="trucks" /></span>
                  </th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Rating</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4">Cargo</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-4 cursor-pointer select-none" onClick={() => toggleSort("date")}>
                    <span className="flex items-center gap-1">Date <SortIcon field="date" /></span>
                  </th>
                  <th className="text-right text-xs font-medium text-navy-400 uppercase px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${selectedIds.has(lead.id) ? "bg-brand-500/5" : ""}`}>
                    <td className="px-6 py-3">
                      <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30" />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/carrier/${lead.dot}`} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">
                        {lead.name}
                      </Link>
                      <p className="text-xs text-navy-500">{lead.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-navy-300 font-mono">DOT {lead.dot}</p>
                      <p className="text-xs text-navy-500 font-mono">{lead.mc}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-300">{lead.city}, {lead.state}</td>
                    <td className="px-4 py-3 text-sm text-navy-300">{lead.trucks} trucks</td>
                    <td className="px-4 py-3">
                      <Badge variant={lead.rating === "Satisfactory" ? "success" : lead.rating === "Conditional" ? "warning" : "outline"}>
                        {lead.rating}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.cargo.slice(0, 2).map((c) => (
                          <span key={c} className="text-[10px] bg-navy-800 text-navy-300 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                        {lead.cargo.length > 2 && <span className="text-[10px] text-navy-500">+{lead.cargo.length - 2}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-400">{lead.date}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/app/carrier/${lead.dot}`} className="text-xs text-brand-400 hover:text-brand-300 font-medium">View</Link>
                        <button className="text-xs text-accent-400 hover:text-accent-300 font-medium">+ CRM</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leads.length === 0 && (
            <div className="text-center py-12">
              <p className="text-navy-400 text-sm">No leads match your filters.</p>
              <button onClick={() => setFilters({ state: "Any", rating: "Any", cargo: [], minTrucks: "", maxTrucks: "", hasEmail: false })} className="text-brand-400 text-sm mt-2 hover:text-brand-300">Clear all filters</button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
