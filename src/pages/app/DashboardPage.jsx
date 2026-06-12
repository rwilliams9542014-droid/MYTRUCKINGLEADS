import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, Badge } from "@/components/ui";
import ScoutEmptyState from "@/components/ScoutEmptyState";
import ScoutMascot from "@/components/ScoutMascot";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { trackFreeTrialStartedConversion } from "@/lib/googleAds";

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
  const [expandedLeadId, setExpandedLeadId] = useState("");
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 17) setGreeting("Good evening");
    else if (hour >= 12) setGreeting("Good afternoon");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") || params.get("sessionId");
    if (!sessionId) return;

    let cancelled = false;
    api.getCheckoutStatus(sessionId)
      .then((checkout) => {
        if (cancelled) return;
        if (String(checkout?.checkoutStatus || "").toLowerCase() !== "complete") return;
        trackFreeTrialStartedConversion({
          transactionId: sessionId,
        });
      })
      .catch((err) => {
        console.warn("Stripe checkout verification failed:", err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getDashboardSummary()
      .then((data) => {
        if (active) {
          setSummary(data || {});
          showToast("Dashboard updated");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Dashboard data could not be loaded.");
          showToast("Dashboard could not be updated", "danger");
        }
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
    <div className="dashboard-premium-surface animate-fade-in">
      {toast && (
        <div className={`dashboard-toast ${toast.type === "danger" ? "dashboard-toast-danger" : ""}`} role="status" aria-live="polite">
          <span className="dashboard-toast-dot" />
          {toast.message}
        </div>
      )}
      <div className="dashboard-content-stack">
        {/* Header */}
        <div className="dashboard-hero-panel flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge variant="brand" className="mb-5 border border-brand-300/20 bg-brand-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">
              Command Center
            </Badge>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{greeting}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100/62">
              {user?.name || user?.username ? `${user.name || user.username}, here is your live lead activity.` : "Here is your live lead activity."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
            <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] px-4 py-3 text-sm text-sky-100/70">
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/55">Workspace</span>
              <span className="mt-1 block font-semibold text-white">Lead operations live</span>
            </div>
            <Link to="/lead-desk" className="btn-primary text-sm">
              View All Leads
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger-500/20 bg-danger-500/10 p-4 text-sm text-danger-300">
            {error}
          </div>
        )}

        {/* Metrics */}
        <section className="dashboard-section">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="dashboard-kicker">Performance Snapshot</p>
              <h2 className="dashboard-section-title">Your lead desk at a glance</h2>
            </div>
            <p className="text-xs text-sky-100/42">Updated from your live account activity</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.label} className="dashboard-metric-card group">
                <div className="flex min-h-[142px] flex-col justify-between sm:min-h-[150px]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100/45 sm:text-[11px] sm:tracking-[0.16em]">{m.label}</p>
                      <p className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
                        {loading ? (
                          <span className="dashboard-skeleton mt-1 block h-8 w-20 rounded-lg" />
                        ) : m.value === "undefined" ? "Data unavailable." : <AnimatedNumber value={m.value} />}
                      </p>
                    </div>
                    <div className="dashboard-icon-tile hidden sm:flex">
                      {m.icon}
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-2 rounded-full border border-accent-300/10 bg-accent-400/[0.055] px-2.5 py-1.5 sm:mt-6 sm:px-3">
                    <svg className="h-3.5 w-3.5 text-accent-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    {loading ? (
                      <span className="dashboard-skeleton h-3 w-16 rounded-full" />
                    ) : (
                      <span className="text-[11px] font-bold text-accent-300 sm:text-xs">{m.change || "Data unavailable."}</span>
                    )}
                    {m.change && <span className="text-xs text-sky-100/38">vs last week</span>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Main Content Grid */}
        <section className="dashboard-section grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Recent Leads */}
          <div className="xl:col-span-2">
            <Card className="dashboard-panel-card min-h-[430px]">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="dashboard-kicker">Recent Activity</p>
                  <h2 className="dashboard-section-title">Recent Leads</h2>
                </div>
                <Link to="/lead-desk" className="rounded-full border border-brand-300/20 bg-brand-400/10 px-3 py-1.5 text-sm font-semibold text-brand-200 transition-colors hover:bg-brand-400/15 hover:text-white">View all</Link>
              </div>
              <div className="space-y-3">
                {recentLeads.length > 0 ? recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`dashboard-lead-row group ${expandedLeadId === lead.id ? "is-expanded" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setExpandedLeadId((current) => {
                        const next = current === lead.id ? "" : lead.id;
                        showToast(next ? "Lead details opened" : "Lead details collapsed");
                        return next;
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedLeadId((current) => {
                          const next = current === lead.id ? "" : lead.id;
                          showToast(next ? "Lead details opened" : "Lead details collapsed");
                          return next;
                        });
                      }
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.055] text-xs font-black text-cyan-100">
                        {lead.state}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{lead.name}</p>
                        <p className="mt-1 hidden font-mono text-xs text-sky-100/35 sm:block">DOT {lead.dot}</p>
                      </div>
                      <Badge variant={lead.type === "New DOT" ? "brand" : "warning"} className="hidden border border-white/10 sm:inline-flex">
                        {lead.type}
                      </Badge>
                      <span className="hidden text-xs font-medium text-sky-100/35 sm:block">{lead.date}</span>
                      <svg className="h-4 w-4 flex-shrink-0 text-sky-100/38 transition-transform duration-200 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="dashboard-lead-details sm:hidden">
                      <div className="grid grid-cols-2 gap-3 border-t border-cyan-300/10 pt-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/35">DOT</p>
                          <p className="mt-1 font-mono text-xs text-white">{lead.dot || "Not available"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/35">Status</p>
                          <p className="mt-1 text-xs font-semibold text-white">{lead.date || "Recent"}</p>
                        </div>
                        <div className="col-span-2">
                          <Badge variant={lead.type === "New DOT" ? "brand" : "warning"} className="border border-white/10">
                            {lead.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  loading ? (
                    <div className="space-y-3">
                      {[0, 1, 2, 3].map((item) => (
                        <div key={item} className="dashboard-lead-row">
                          <div className="flex items-center gap-4">
                            <span className="dashboard-skeleton h-11 w-11 rounded-2xl" />
                            <div className="flex-1">
                              <span className="dashboard-skeleton block h-4 w-3/4 rounded-full" />
                              <span className="dashboard-skeleton mt-2 block h-3 w-28 rounded-full" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ScoutEmptyState
                      title="No saved leads yet."
                      message="Scout will surface recent activity here once you start saving carriers."
                      actionLabel="Open Lead Desk"
                      onAction={() => window.location.assign("/lead-desk")}
                      className="py-6"
                    />
                  )
                )}
              </div>
            </Card>
          </div>

          {/* Pipeline Overview */}
          <Card className="dashboard-panel-card min-h-[430px]">
            <div className="mb-6">
              <p className="dashboard-kicker">Deal Flow</p>
              <h2 className="dashboard-section-title">Pipeline</h2>
            </div>
            <div className="dashboard-pipeline-scroll">
              <div className="dashboard-pipeline-list">
              {pipelineStages.map((stage) => (
                <div key={stage.label} className="dashboard-pipeline-stage">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-sky-100/72">{stage.label}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-bold text-white">{stage.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-navy-950/80 ring-1 ring-white/5">
                    <div
                      className={`h-full ${stage.color} rounded-full shadow-[0_0_18px_rgba(34,211,238,0.22)] transition-all duration-1000`}
                      style={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              </div>
            </div>
            <Link
              to="/crm"
              className="mt-8 block rounded-2xl border border-brand-300/20 bg-brand-400/10 px-4 py-3 text-center text-sm font-bold text-brand-100 transition-colors hover:bg-brand-400/15 hover:text-white"
            >
              Open CRM Pipeline
            </Link>
          </Card>
        </section>

        {/* Quick Actions */}
        <section className="dashboard-section">
          <div className="mb-5">
            <p className="dashboard-kicker">Next Best Actions</p>
            <h2 className="dashboard-section-title">Move faster from one place</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              { label: "Search Carriers", desc: "Look up any carrier by DOT or name", path: "/carrier-search", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
              { label: "New DOT Leads", desc: "Recently registered trucking companies", path: "/lead-desk", icon: "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" },
              { label: "Renewal Calendar", desc: "Carriers with expiring policies", path: "/lead-desk", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
            ].map((action) => (
              <Link key={action.label} to={action.path} className="dashboard-action-card group">
                <div className="dashboard-icon-tile">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
                  </svg>
                </div>
                <div className="mt-5">
                  <p className="text-base font-bold text-white">{action.label}</p>
                  <p className="mt-2 text-sm leading-5 text-sky-100/48">{action.desc}</p>
                </div>
                <div className="mt-6 flex items-center text-xs font-bold uppercase tracking-[0.16em] text-brand-200">
                  Open
                  <svg className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
