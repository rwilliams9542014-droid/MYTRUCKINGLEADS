import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, Badge, Button } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const OWNER_EMAIL = "owner@mytruckingleads.com";

function statusVariant(status) {
  const normalized = String(status || "").toLowerCase();
  if (["healthy", "success", "active", "trialing"].includes(normalized)) return "success";
  if (["degraded", "trial", "past_due", "incomplete"].includes(normalized)) return "warning";
  if (["failed", "unpaid", "canceled", "cancelled"].includes(normalized)) return "danger";
  return "outline";
}

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isOwner = user?.isOwner || user?.role === "owner" || user?.role === "admin" || user?.email === OWNER_EMAIL;

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    setLoading(true);
    Promise.allSettled([
      api.getAdminOverview(),
      api.getAdminUsers(),
      api.getAdminHealth(),
    ]).then(([overviewResult, usersResult, healthResult]) => {
      if (!active) return;
      if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      if (usersResult.status === "fulfilled") setUsers(usersResult.value?.users || []);
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      const rejected = [overviewResult, usersResult, healthResult].find((result) => result.status === "rejected");
      if (rejected) setError(rejected.reason?.message || "Some admin data could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isOwner]);

  if (!isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  const metrics = overview?.metrics || {};
  const webhookSummary = health?.summary || overview?.webhook?.summary || [];
  const webhookRecent = health?.recent || overview?.webhook?.recent || [];
  const contactRequests = overview?.contactRequests?.recent || [];

  const overviewCards = [
    { label: "Total Users", value: metrics.total_users ?? 0, sub: `${metrics.new_signups_30d ?? 0} new in 30 days` },
    { label: "Access Enabled", value: metrics.access_enabled_users ?? 0, sub: "Active or trialing" },
    { label: "Active Subscriptions", value: metrics.active_subscriptions ?? 0, sub: `${metrics.trial_subscriptions ?? 0} trials` },
    { label: "Needs Attention", value: metrics.attention_subscriptions ?? 0, sub: `${metrics.expiring_soon ?? 0} expiring soon` },
    { label: "New Quote Requests", value: metrics.new_contact_requests ?? 0, sub: `${metrics.open_contact_requests ?? 0} open` },
  ];
  const hasOverview = Boolean(overview?.metrics);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Owner Dashboard</h1>
            <Badge variant="danger">Admin</Badge>
          </div>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Loading live platform data..." : "Platform health, subscribers, and quote requests"}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Refresh</Button>
      </div>

      {error && <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">{error}</div>}

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

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {overviewCards.map((card) => (
              <Card key={card.label}>
                <p className="text-sm text-navy-400">{card.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{hasOverview ? card.value : "Data unavailable."}</p>
                <p className="text-xs text-navy-500 mt-1">{hasOverview ? card.sub : "No records found."}</p>
              </Card>
            ))}
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Plan Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(overview?.planBreakdown || []).map((plan) => (
                <div key={plan.plan} className="p-4 bg-navy-800/30 rounded-xl">
                  <Badge variant={plan.plan === "premium" ? "brand" : plan.plan === "pro" ? "success" : "outline"}>{plan.plan}</Badge>
                  <p className="text-2xl font-bold text-white mt-3">{plan.total}</p>
                  <p className="text-xs text-navy-500">{plan.active} active, {plan.trialing} trialing</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "subscribers" && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-sm text-navy-300"><span className="text-white font-medium">{users.length}</span> users loaded</p>
          </div>
          <div className="overflow-x-auto">
            <table className="premium-table w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["User", "Plan", "Status", "Access", "Joined"].map((heading) => (
                    <th key={heading} className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((sub) => (
                  <tr key={`${sub.source || "local"}-${sub.id || sub.email}`} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-white">{sub.name || sub.username || sub.email}</p>
                      <p className="text-xs text-navy-500">{sub.email}</p>
                    </td>
                    <td className="px-6 py-3"><Badge variant={sub.plan === "premium" ? "brand" : sub.plan === "pro" ? "success" : "outline"}>{sub.plan || "basic"}</Badge></td>
                    <td className="px-6 py-3"><Badge variant={statusVariant(sub.subscription_status)}>{sub.subscription_status || "unknown"}</Badge></td>
                    <td className="px-6 py-3"><Badge variant={sub.has_access ? "success" : "danger"}>{sub.has_access ? "enabled" : "blocked"}</Badge></td>
                    <td className="px-6 py-3 text-sm text-navy-400">{String(sub.created_at || "").slice(0, 10) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === "health" && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Stripe Webhook Health</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {webhookSummary.map((item) => (
                <div key={item.status} className="flex items-center justify-between p-4 bg-navy-800/30 rounded-xl">
                  <span className="text-sm text-white">{item.status}</span>
                  <Badge variant={statusVariant(item.status)}>{item.count}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Webhook Events</h2>
            <div className="space-y-3">
              {webhookRecent.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 bg-navy-800/30 rounded-lg">
                  <div>
                    <p className="text-sm text-white">{event.type}</p>
                    <p className="text-xs text-navy-500">{event.message || "No message"}</p>
                  </div>
                  <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "activity" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Recent Quote Requests</h2>
          <div className="space-y-0">
            {contactRequests.map((request) => (
              <div key={request.id} className="flex gap-4 py-3 border-b border-white/[0.03] last:border-0">
                <div className="w-24 text-xs text-navy-500 pt-0.5 flex-shrink-0">{String(request.submitted_at || "").slice(0, 10)}</div>
                <div>
                  <p className="text-sm text-white font-medium">{request.name || request.agency || request.email}</p>
                  <p className="text-xs text-navy-400 mt-0.5">{request.email} {request.phone ? `- ${request.phone}` : ""}</p>
                </div>
                <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
              </div>
            ))}
            {contactRequests.length === 0 && <p className="text-sm text-navy-400 py-6 text-center">No recent quote requests loaded.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
