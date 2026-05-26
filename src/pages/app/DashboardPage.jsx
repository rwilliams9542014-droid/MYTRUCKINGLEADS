import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

function AnimatedNumber({ value, duration = 1000 }) {
  const [display, setDisplay] = useState("0");
  const ref = useRef(null);

  useEffect(() => {
    const numericValue = parseInt(value.replace(/[^0-9]/g, ""));
    if (isNaN(numericValue)) {
      setDisplay(value);
      return;
    }
    const prefix = value.match(/^[^0-9]*/)?.[0] || "";
    const suffix = value.match(/[^0-9]*$/)?.[0] || "";
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * numericValue);
      setDisplay(`${prefix}${current.toLocaleString()}${suffix}`);
      if (progress < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <span>{display}</span>;
}

const metricIcons = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState("Good morning");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 17) setGreeting("Good evening");
    else if (hour >= 12) setGreeting("Good afternoon");
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getDashboardSummary()
      .then((data) => {
        if (active) setSummary(data || {});
      })
      .catch((err) => {
        if (active) setError(err.message || "Dashboard data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = [
    { label: "New DOT Leads", value: summary?.newDotLeads?.value, change: summary?.newDotLeads?.change },
    { label: "Renewal Opportunities", value: summary?.renewalOpportunities?.value, change: summary?.renewalOpportunities?.change },
    { label: "Active Leads", value: summary?.activeLeads?.value, change: summary?.activeLeads?.change },
    { label: "Converted This Month", value: summary?.convertedThisMonth?.value, change: summary?.convertedThisMonth?.change },
  ].map((metric, index) => ({ ...metric, value: String(metric.value), icon: metricIcons[index]?.icon }));

  const recentLeads = (summary?.recentLeads || []).map((lead, index) => ({
    id: `${lead.dotNumber || lead.companyName || index}`,
    name: lead.companyName || "Unknown carrier",
    dot: lead.dotNumber || "",
    state: lead.state || "US",
    type: lead.type || "Carrier",
    date: lead.status || "",
  }));

  const rawPipeline = summary?.pipeline || {};
  const pipelineStages = [
    { label: "New", count: rawPipeline.newLeads ?? 0, color: "bg-brand-500" },
    { label: "Contacted", count: rawPipeline.contacted ?? 0, color: "bg-warning-500" },
    { label: "Quoted", count: rawPipeline.quoted ?? 0, color: "bg-accent-500" },
    { label: "Follow Up", count: rawPipeline.proposalSent ?? 0, color: "bg-brand-300" },
    { label: "Won", count: rawPipeline.won ?? 0, color: "bg-accent-600" },
  ];
  const maxPipeline = Math.max(...pipelineStages.map((stage) => stage.count), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}</h1>
          <p className="text-navy-400 text-sm mt-1">
            {user?.name || user?.username ? `${user.name || user.username}, here is your live lead activity.` : "Here is your live lead activity."}
          </p>
        </div>
        <Link to="/lead-desk" className="btn-primary text-sm">
          View All Leads
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>

      {error && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
          {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="group hover:border-white/10 transition-all duration-300">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-navy-400">{m.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{loading ? "..." : m.value === "undefined" ? "Data unavailable." : <AnimatedNumber value={m.value} />}</p>
              </div>
              <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400 group-hover:bg-brand-500/20 transition-colors">
                {m.icon}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1">
              <svg className="w-3 h-3 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span className="text-xs text-accent-400 font-medium">{m.change || "Data unavailable."}</span>
              {m.change && <span className="text-xs text-navy-500 ml-1">vs last week</span>}
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
              <Link to="/lead-desk" className="text-sm text-brand-400 hover:text-brand-300">View all</Link>
            </div>
            <div className="space-y-2">
              {recentLeads.length > 0 ? recentLeads.map((lead) => (
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
              )) : (
                <p className="text-sm text-navy-400 py-6 text-center">
                  {loading ? "Loading recent leads..." : "No saved leads yet."}
                </p>
              )}
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
                    style={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/crm"
            className="block mt-6 text-center text-sm text-brand-400 hover:text-brand-300 font-medium"
          >
            Open CRM Pipeline
          </Link>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Search Carriers", desc: "Look up any carrier by DOT or name", path: "/carrier-search", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
          { label: "New DOT Leads", desc: "Recently registered trucking companies", path: "/lead-desk", icon: "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "Renewal Calendar", desc: "Carriers with expiring policies", path: "/lead-desk", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
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
