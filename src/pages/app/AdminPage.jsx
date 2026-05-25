import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, Badge, Button } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const OWNER_EMAIL = "owner@mytruckingleads.com";

const mockSubscribers = [
  { id: 1, email: "marcus.r@safehaul.com", name: "Marcus Rivera", plan: "pro", status: "active", joined: "2026-03-12", lastLogin: "2 hours ago" },
  { id: 2, email: "jwalsh@truckshield.com", name: "Jennifer Walsh", plan: "agency", status: "active", joined: "2026-01-08", lastLogin: "1 hour ago" },
  { id: 3, email: "dpark@interstatecover.com", name: "David Park", plan: "pro", status: "active", joined: "2026-04-22", lastLogin: "5 hours ago" },
  { id: 4, email: "tony.m@premiumins.com", name: "Tony Martinez", plan: "starter", status: "active", joined: "2026-05-01", lastLogin: "1 day ago" },
  { id: 5, email: "sarah.k@coverageplus.com", name: "Sarah Kim", plan: "pro", status: "trial", joined: "2026-05-23", lastLogin: "30 min ago" },
  { id: 6, email: "jbrown@allstate-ag.com", name: "James Brown", plan: "starter", status: "churned", joined: "2026-02-15", lastLogin: "2 weeks ago" },
];

const mockMetrics = {
  totalRevenue: "$12,840",
  mrr: "$4,280",
  activeSubscribers: 24,
  trialUsers: 7,
  churnRate: "4.2%",
  hotLeadsSold: 142,
  quoteRequests: 38,
  apiCallsToday: 2847,
};

const mockHealthChecks = [
  { name: "Supabase Database", status: "healthy", latency: "12ms" },
  { name: "FMCSA API (QCMobile)", status: "healthy", latency: "340ms" },
  { name: "FMCSA Census (Socrata)", status: "healthy", latency: "180ms" },
  { name: "Auth Service", status: "healthy", latency: "8ms" },
  { name: "Edge Functions", status: "healthy", latency: "45ms" },
  { name: "SMS Safety Scraper", status: "degraded", latency: "2100ms" },
];

const mockActivity = [
  { time: "2 min ago", event: "New signup", detail: "sarah.k@coverageplus.com started Pro trial" },
  { time: "15 min ago", event: "Hot lead purchased", detail: "Marcus Rivera bought premium lead ($45)" },
  { time: "1 hour ago", event: "CSV export", detail: "Jennifer Walsh exported 500 renewal leads" },
  { time: "3 hours ago", event: "Quote request", detail: "JR Transport Services submitted quote form" },
  { time: "5 hours ago", event: "Subscription upgrade", detail: "Tony Martinez: Starter -> Pro" },
  { time: "8 hours ago", event: "Support ticket", detail: "David Park: 'Carrier profile not loading for DOT 3892011'" },
];

export default function AdminPage() {
  const { user, isDemo } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  if (!isDemo && user?.email !== OWNER_EMAIL) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Owner Dashboard</h1>
            <Badge variant="danger">Admin</Badge>
          </div>
          <p className="text-navy-400 text-sm mt-1">Platform health, subscribers, and analytics</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 overflow-x-auto">
        {[
          { id: "overview", label: "Overview" },
          { id: "subscribers", label: "Subscribers" },
          { id: "health", label: "System Health" },
          { id: "activity", label: "Activity Log" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === tab.id ? "text-white bg-white/5 border-b-2 border-brand-500" : "text-navy-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Monthly Revenue", value: mockMetrics.totalRevenue, sub: "This month" },
              { label: "MRR", value: mockMetrics.mrr, sub: "Recurring" },
              { label: "Active Subscribers", value: mockMetrics.activeSubscribers, sub: `+${mockMetrics.trialUsers} in trial` },
              { label: "Churn Rate", value: mockMetrics.churnRate, sub: "Last 30 days" },
            ].map((m) => (
              <Card key={m.label}>
                <p className="text-sm text-navy-400">{m.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
                <p className="text-xs text-navy-500 mt-1">{m.sub}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Hot Leads Sold", value: mockMetrics.hotLeadsSold, desc: "This month" },
              { label: "Quote Requests", value: mockMetrics.quoteRequests, desc: "Pending assignment" },
              { label: "API Calls Today", value: mockMetrics.apiCallsToday.toLocaleString(), desc: "FMCSA queries" },
            ].map((m) => (
              <Card key={m.label}>
                <p className="text-sm text-navy-400">{m.label}</p>
                <p className="text-xl font-bold text-white mt-1">{m.value}</p>
                <p className="text-xs text-navy-500 mt-1">{m.desc}</p>
              </Card>
            ))}
          </div>

          {/* Quick Health */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">System Status</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mockHealthChecks.map((check) => (
                <div key={check.name} className="flex items-center gap-3 p-3 bg-navy-800/30 rounded-xl">
                  <div className={`w-2.5 h-2.5 rounded-full ${check.status === "healthy" ? "bg-accent-500" : check.status === "degraded" ? "bg-warning-500 animate-pulse" : "bg-danger-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{check.name}</p>
                    <p className="text-xs text-navy-500">{check.latency}</p>
                  </div>
                  <Badge variant={check.status === "healthy" ? "success" : check.status === "degraded" ? "warning" : "danger"}>
                    {check.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Subscribers */}
      {activeTab === "subscribers" && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <p className="text-sm text-navy-300"><span className="text-white font-medium">{mockSubscribers.length}</span> total users</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-3">User</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-3">Plan</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-3">Joined</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase px-4 py-3">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {mockSubscribers.map((sub) => (
                  <tr key={sub.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-white">{sub.name}</p>
                      <p className="text-xs text-navy-500">{sub.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={sub.plan === "agency" ? "brand" : sub.plan === "pro" ? "success" : "outline"}>
                        {sub.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={sub.status === "active" ? "success" : sub.status === "trial" ? "warning" : "danger"}>
                        {sub.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-400">{sub.joined}</td>
                    <td className="px-4 py-3 text-sm text-navy-400">{sub.lastLogin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* System Health */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Service Health Checks</h2>
            <div className="space-y-3">
              {mockHealthChecks.map((check) => (
                <div key={check.name} className="flex items-center justify-between p-4 bg-navy-800/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${check.status === "healthy" ? "bg-accent-500" : check.status === "degraded" ? "bg-warning-500 animate-pulse" : "bg-danger-500 animate-pulse"}`} />
                    <div>
                      <p className="text-sm font-medium text-white">{check.name}</p>
                      <p className="text-xs text-navy-500">Response time: {check.latency}</p>
                    </div>
                  </div>
                  <Badge variant={check.status === "healthy" ? "success" : check.status === "degraded" ? "warning" : "danger"}>
                    {check.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">FMCSA Data Sync</h2>
            <div className="space-y-3">
              {[
                { label: "Last Census Sync", value: "2026-05-25 03:00 UTC", status: "success" },
                { label: "New DOT Import", value: "47 carriers added today", status: "success" },
                { label: "Insurance Expiration Refresh", value: "2026-05-25 06:00 UTC", status: "success" },
                { label: "Cache Hit Rate", value: "87.3% (last 24h)", status: "success" },
                { label: "Failed API Calls", value: "3 of 2,847 (0.1%)", status: "success" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 bg-navy-800/30 rounded-lg">
                  <span className="text-sm text-navy-300">{item.label}</span>
                  <span className="text-sm text-white font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Activity Log */}
      {activeTab === "activity" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-0">
            {mockActivity.map((event, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-white/[0.03] last:border-0">
                <div className="w-16 text-xs text-navy-500 pt-0.5 flex-shrink-0">{event.time}</div>
                <div>
                  <p className="text-sm text-white font-medium">{event.event}</p>
                  <p className="text-xs text-navy-400 mt-0.5">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
