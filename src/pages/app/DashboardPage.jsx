import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const metrics = [
  {
    label: "New Leads Today",
    value: "47",
    change: "+12",
    trend: "up",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: "Expiring This Week",
    value: "128",
    change: "+8%",
    trend: "up",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: "Pipeline Value",
    value: "$34.2K",
    change: "+23%",
    trend: "up",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: "Close Rate",
    value: "18.4%",
    change: "+2.1%",
    trend: "up",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
];

const recentLeads = [
  { id: 1, name: "Martinez Trucking LLC", dot: "4102847", state: "TX", type: "New DOT", date: "2 hours ago" },
  { id: 2, name: "Pacific Ridge Transport", dot: "3891024", state: "CA", type: "Renewal", date: "3 hours ago" },
  { id: 3, name: "Heartland Freight Co", dot: "4098331", state: "OH", type: "New DOT", date: "5 hours ago" },
  { id: 4, name: "Summit Logistics Inc", dot: "3774219", state: "IL", type: "Renewal", date: "6 hours ago" },
  { id: 5, name: "Blue Ridge Carriers", dot: "4105882", state: "NC", type: "New DOT", date: "8 hours ago" },
];

const pipelineStages = [
  { label: "New", count: 24, color: "bg-brand-500" },
  { label: "Contacted", count: 18, color: "bg-warning-500" },
  { label: "Quoted", count: 12, color: "bg-accent-500" },
  { label: "Won", count: 6, color: "bg-accent-600" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 17) setGreeting("Good evening");
    else if (hour >= 12) setGreeting("Good afternoon");
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}</h1>
          <p className="text-navy-400 text-sm mt-1">Here's what's happening with your leads today.</p>
        </div>
        <Link to="/app/lead-desk" className="btn-primary text-sm">
          View All Leads
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="group hover:border-white/10 transition-all duration-300">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-navy-400">{m.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
              </div>
              <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400 group-hover:bg-brand-500/20 transition-colors">
                {m.icon}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1">
              <svg className="w-3 h-3 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span className="text-xs text-accent-400 font-medium">{m.change}</span>
              <span className="text-xs text-navy-500 ml-1">vs last week</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Leads */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Leads</h2>
              <Link to="/app/lead-desk" className="text-sm text-brand-400 hover:text-brand-300">View all</Link>
            </div>
            <div className="space-y-2">
              {recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="w-10 h-10 bg-navy-800 rounded-lg flex items-center justify-center text-navy-300 text-xs font-mono flex-shrink-0">
                    {lead.state}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                    <p className="text-xs text-navy-500 font-mono">DOT {lead.dot}</p>
                  </div>
                  <Badge variant={lead.type === "New DOT" ? "brand" : "warning"}>
                    {lead.type}
                  </Badge>
                  <span className="text-xs text-navy-500 hidden sm:block">{lead.date}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Pipeline Overview */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Pipeline</h2>
          <div className="space-y-4">
            {pipelineStages.map((stage) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-navy-300">{stage.label}</span>
                  <span className="text-sm font-medium text-white">{stage.count}</span>
                </div>
                <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.color} rounded-full transition-all duration-1000`}
                    style={{ width: `${(stage.count / 24) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/app/crm"
            className="block mt-6 text-center text-sm text-brand-400 hover:text-brand-300 font-medium"
          >
            Open CRM Pipeline
          </Link>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Search Carriers", desc: "Look up any carrier by DOT or name", path: "/app/carrier-search", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
          { label: "New DOT Leads", desc: "Recently registered trucking companies", path: "/app/lead-desk", icon: "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "Renewal Calendar", desc: "Carriers with expiring policies", path: "/app/lead-desk", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
        ].map((action) => (
          <Link key={action.label} to={action.path} className="glass-card p-5 hover:border-brand-500/20 hover:shadow-glow transition-all duration-300 group">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400 group-hover:bg-brand-500/20 transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">{action.label}</p>
                <p className="text-xs text-navy-400 mt-0.5">{action.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
