import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";

const mockLeads = [
  { id: 1, name: "Martinez Trucking LLC", dot: "4102847", mc: "MC-1298374", state: "TX", city: "Houston", trucks: 4, type: "new_dot", date: "2026-05-23", phone: "(713) 555-0142", status: "new" },
  { id: 2, name: "Pacific Ridge Transport", dot: "3891024", mc: "MC-982114", state: "CA", city: "Fresno", trucks: 12, type: "renewal", date: "2026-05-28", phone: "(559) 555-0198", status: "new" },
  { id: 3, name: "Heartland Freight Co", dot: "4098331", mc: "MC-1301892", state: "OH", city: "Columbus", trucks: 3, type: "new_dot", date: "2026-05-22", phone: "(614) 555-0167", status: "contacted" },
  { id: 4, name: "Summit Logistics Inc", dot: "3774219", mc: "MC-891203", state: "IL", city: "Chicago", trucks: 22, type: "renewal", date: "2026-06-01", phone: "(312) 555-0234", status: "new" },
  { id: 5, name: "Blue Ridge Carriers", dot: "4105882", mc: "MC-1305519", state: "NC", city: "Charlotte", trucks: 6, type: "new_dot", date: "2026-05-21", phone: "(704) 555-0189", status: "new" },
  { id: 6, name: "Great Plains Haul Co", dot: "3920174", mc: "MC-1011284", state: "KS", city: "Wichita", trucks: 8, type: "renewal", date: "2026-05-30", phone: "(316) 555-0156", status: "quoted" },
  { id: 7, name: "Bayou Express LLC", dot: "4110923", mc: "MC-1310482", state: "LA", city: "Baton Rouge", trucks: 2, type: "new_dot", date: "2026-05-24", phone: "(225) 555-0143", status: "new" },
  { id: 8, name: "Cascade Freight Lines", dot: "3845201", mc: "MC-945623", state: "WA", city: "Seattle", trucks: 15, type: "renewal", date: "2026-05-26", phone: "(206) 555-0211", status: "contacted" },
  { id: 9, name: "Desert Sun Transport", dot: "4099102", mc: "MC-1302847", state: "AZ", city: "Phoenix", trucks: 5, type: "new_dot", date: "2026-05-23", phone: "(602) 555-0177", status: "new" },
  { id: 10, name: "Iron Horse Logistics", dot: "3801456", mc: "MC-923501", state: "PA", city: "Pittsburgh", trucks: 18, type: "renewal", date: "2026-06-03", phone: "(412) 555-0192", status: "new" },
];

const filters = [
  { label: "All Leads", value: "all" },
  { label: "New DOT", value: "new_dot" },
  { label: "Renewals", value: "renewal" },
  { label: "Hot Leads", value: "hot" },
];

export default function LeadDeskPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLeads = mockLeads.filter((lead) => {
    if (activeFilter !== "all" && lead.type !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.dot.includes(q) ||
        lead.state.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Desk</h1>
          <p className="text-navy-400 text-sm mt-1">{mockLeads.length} leads available today</p>
        </div>
        <Button variant="secondary" size="sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeFilter === f.value
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                  : "text-navy-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search leads..."
            className="input-field pl-10 py-2 text-sm w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-6 py-4">Company</th>
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">DOT / MC</th>
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Location</th>
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Fleet</th>
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Type</th>
                <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Status</th>
                <th className="text-right text-xs font-medium text-navy-400 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div>
                      <Link to={`/app/carrier/${lead.dot}`} className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">
                        {lead.name}
                      </Link>
                      <p className="text-xs text-navy-500 mt-0.5">{lead.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-navy-300 font-mono">DOT {lead.dot}</p>
                    <p className="text-xs text-navy-500 font-mono">{lead.mc}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-navy-300">{lead.city}, {lead.state}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-navy-300">{lead.trucks} trucks</p>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={lead.type === "new_dot" ? "brand" : "warning"}>
                      {lead.type === "new_dot" ? "New DOT" : "Renewal"}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={
                      lead.status === "contacted" ? "success" :
                      lead.status === "quoted" ? "warning" : "outline"
                    }>
                      {lead.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        to={`/app/carrier/${lead.dot}`}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                      >
                        View
                      </Link>
                      <button className="text-xs text-accent-400 hover:text-accent-300 font-medium">
                        Add to CRM
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
