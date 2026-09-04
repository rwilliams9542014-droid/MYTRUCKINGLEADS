import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const OWNER_EMAIL = "owner@mytruckingleads.com";

function money(value) {
  if (value == null) return "Not tracked yet";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function numberValue(value) {
  if (value == null) return "Not tracked yet";
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

function dateValue(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusVariant(status) {
  const normalized = String(status || "").toLowerCase();
  if (["healthy", "active", "platform healthy", "success"].includes(normalized)) return "success";
  if (["warning", "trial", "needs attention", "past due", "not_configured", "not tracked"].includes(normalized)) return "warning";
  if (["critical", "down", "frozen", "canceled", "suspended"].includes(normalized)) return "danger";
  return "outline";
}

function statusDot(status) {
  const variant = statusVariant(status);
  if (variant === "success") return "bg-accent-400";
  if (variant === "warning") return "bg-warning-400";
  if (variant === "danger") return "bg-danger-400";
  return "bg-slate-500";
}

function ActivityCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-navy-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{numberValue(value)}</p>
    </div>
  );
}

function MicroMetric({ label, value, detail, tone = "slate" }) {
  const tones = {
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    slate: "border-zinc-800 bg-zinc-950/50 text-zinc-100",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

function LeadTile({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function statusLabel(status) {
  return String(status || "unknown").replace(/_/g, " ");
}

function systemStatusLabel(checks) {
  const critical = checks.filter((item) => statusVariant(item.status) === "danger").length;
  const warnings = checks.filter((item) => statusVariant(item.status) === "warning").length;
  if (critical) return `${critical} SYSTEM ISSUE${critical === 1 ? "" : "S"}`;
  if (warnings) return `${warnings} SYSTEM WARNING${warnings === 1 ? "" : "S"}`;
  return "ALL SYSTEMS OPERATIONAL";
}

function isCanceled(subscriber) {
  return String(subscriber?.status || subscriber?.subscriptionStatus || "").toLowerCase().includes("cancel");
}

function DetailDrawer({ detail, loading, note, setNote, onClose, onAction, actionLoading }) {
  if (!detail) return null;
  const sub = detail.subscriber || {};
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-cyan-300/15 bg-[#06111f] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-brand-300">Subscriber Detail</p>
            <h2 className="mt-2 text-2xl font-bold text-white">{sub.name}</h2>
            <p className="text-sm text-navy-400">{sub.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-navy-400">Loading account details...</p>
        ) : (
          <div className="mt-6 space-y-5">
            <Card className="bg-white/[0.03]">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-navy-500">Plan</p><p className="text-white">{sub.plan || "-"}</p></div>
                <div><p className="text-navy-500">Status</p><Badge variant={statusVariant(sub.status)}>{sub.status}</Badge></div>
                <div><p className="text-navy-500">Stripe Customer</p><p className="text-white">{sub.stripeCustomerIdMasked || "Not connected"}</p></div>
                <div><p className="text-navy-500">Stripe Subscription</p><p className="text-white">{sub.stripeSubscriptionIdMasked || "Not connected"}</p></div>
                <div><p className="text-navy-500">Signup Date</p><p className="text-white">{dateValue(sub.createdDate)}</p></div>
                <div><p className="text-navy-500">Last Login</p><p className="text-white">{dateValue(sub.lastLogin)}</p></div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <ActivityCard label="Lead Searches This Month" value={detail.usage?.leadSearchesThisMonth} />
              <ActivityCard label="Exports This Month" value={detail.usage?.exportsThisMonth} />
              <ActivityCard label="Emails Sent This Month" value={detail.usage?.emailsSentThisMonth} />
              <ActivityCard label="Marketplace Leads Purchased" value={detail.usage?.marketplaceLeadsPurchased} />
              <ActivityCard label="Quote Requests Claimed" value={detail.usage?.quoteRequestsClaimed} />
            </div>

            <Card className="bg-white/[0.03]">
              <h3 className="font-semibold text-white">Owner Actions</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" loading={actionLoading === "freeze"} onClick={() => onAction("freeze")}>Freeze Account</Button>
                <Button size="sm" variant="secondary" loading={actionLoading === "unfreeze"} onClick={() => onAction("unfreeze")}>Unfreeze Account</Button>
                <Button size="sm" variant="danger" loading={actionLoading === "cancel"} onClick={() => onAction("cancel")}>Cancel Subscription</Button>
              </div>
              <div className="mt-4">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add an admin note..."
                  className="min-h-24 w-full rounded-xl border border-white/10 bg-navy-950/70 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
                />
                <Button className="mt-2" size="sm" loading={actionLoading === "note"} onClick={() => onAction("note")}>Save Note</Button>
              </div>
            </Card>

            <Card className="bg-white/[0.03]">
              <h3 className="font-semibold text-white">Subscription Consent</h3>
              {detail.subscriptionConsent ? (
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-navy-500">Accepted</p><Badge variant={detail.subscriptionConsent.accepted ? "success" : "danger"}>{detail.subscriptionConsent.accepted ? "Yes" : "No"}</Badge></div>
                  <div><p className="text-navy-500">Accepted At</p><p className="text-white">{dateValue(detail.subscriptionConsent.acceptedAt)}</p></div>
                  <div><p className="text-navy-500">Plan Accepted</p><p className="text-white">{detail.subscriptionConsent.planName || "-"}</p></div>
                  <div><p className="text-navy-500">Price Accepted</p><p className="text-white">{money(detail.subscriptionConsent.planPrice)}</p></div>
                  <div><p className="text-navy-500">Billing Interval</p><p className="text-white">{detail.subscriptionConsent.billingInterval || "-"}</p></div>
                  <div><p className="text-navy-500">Trial Days</p><p className="text-white">{detail.subscriptionConsent.trialDays ?? "-"}</p></div>
                  <div><p className="text-navy-500">Terms Version</p><p className="text-white">{detail.subscriptionConsent.termsVersion || "-"}</p></div>
                  <div><p className="text-navy-500">Agreement Version</p><p className="text-white">{detail.subscriptionConsent.subscriptionAgreementVersion || "-"}</p></div>
                  <div><p className="text-navy-500">Stripe Customer</p><p className="text-white">{detail.subscriptionConsent.stripeCustomerIdMasked || "Pending"}</p></div>
                  <div><p className="text-navy-500">Stripe Subscription</p><p className="text-white">{detail.subscriptionConsent.stripeSubscriptionIdMasked || "Pending"}</p></div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-navy-500">No subscription consent record found for this user.</p>
              )}
            </Card>

            <Card className="bg-white/[0.03]">
              <h3 className="font-semibold text-white">Admin Notes</h3>
              <div className="mt-3 space-y-3">
                {(detail.adminNotes || []).map((item) => (
                  <div key={item.id} className="rounded-lg bg-navy-950/60 p-3">
                    <p className="text-sm text-white">{item.note}</p>
                    <p className="mt-1 text-xs text-navy-500">{dateValue(item.created_at)}</p>
                  </div>
                ))}
                {!detail.adminNotes?.length && <p className="text-sm text-navy-500">No admin notes yet.</p>}
              </div>
            </Card>

            <Card className="bg-white/[0.03]">
              <h3 className="font-semibold text-white">Action History</h3>
              <div className="mt-3 space-y-2">
                {(detail.actionHistory || []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-navy-950/60 p-3">
                    <div>
                      <p className="text-sm text-white">{String(item.action || "").replace(/_/g, " ")}</p>
                      <p className="text-xs text-navy-500">{item.reason || "No reason recorded"}</p>
                    </div>
                    <p className="text-xs text-navy-500">{dateValue(item.created_at)}</p>
                  </div>
                ))}
                {!detail.actionHistory?.length && <p className="text-sm text-navy-500">No owner actions logged yet.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [activity, setActivity] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [healthOpen, setHealthOpen] = useState(false);

  const isOwner = user?.isOwner || user?.role === "owner" || user?.role === "admin" || user?.email === OWNER_EMAIL;

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, healthData, subscribersData, revenueData, activityData, freshnessData, alertsData] = await Promise.all([
        api.getOwnerSummary(),
        api.getOwnerHealth(),
        api.getOwnerSubscribers(),
        api.getOwnerRevenue(),
        api.getOwnerActivity(),
        api.getOwnerDataFreshness(),
        api.getOwnerAlerts(),
      ]);
      setSummary(summaryData);
      setHealth(healthData);
      setSubscribers(subscribersData?.subscribers || []);
      setRevenue(revenueData);
      setActivity(activityData);
      setFreshness(freshnessData);
      setAlerts(alertsData?.alerts || []);
    } catch (err) {
      setError(err.message || "Owner dashboard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) loadAll();
  }, [isOwner]);

  const openSubscriber = async (subscriber) => {
    if (!subscriber?.id || subscriber.source === "stripe_only") {
      setDetail({ subscriber, usage: {}, adminNotes: [], actionHistory: [] });
      return;
    }
    setDetail({ subscriber });
    setDetailLoading(true);
    setNote("");
    try {
      setDetail(await api.getOwnerSubscriber(subscriber.id));
    } catch (err) {
      setError(err.message || "Subscriber detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async (action) => {
    const subscriberId = detail?.subscriber?.id;
    if (!subscriberId) return;
    const reason = action === "note" ? note : window.prompt(`Reason for ${action}?`, "");
    if (action !== "note" && reason == null) return;
    if (action === "cancel" && !window.confirm("Cancel this subscriber's Stripe subscription/access?")) return;
    setActionLoading(action);
    try {
      if (action === "freeze") await api.freezeOwnerSubscriber(subscriberId, reason || "Frozen by owner");
      if (action === "unfreeze") await api.unfreezeOwnerSubscriber(subscriberId, reason || "Unfrozen by owner");
      if (action === "cancel") await api.cancelOwnerSubscriber(subscriberId, reason || "Canceled by owner");
      if (action === "note") {
        if (!note.trim()) return;
        await api.addOwnerSubscriberNote(subscriberId, note.trim());
        setNote("");
      }
      const refreshed = await api.getOwnerSubscriber(subscriberId);
      setDetail(refreshed);
      await loadAll();
    } catch (err) {
      setError(err.message || "Owner action failed.");
    } finally {
      setActionLoading("");
    }
  };

  const handleSubscriberQuickAction = async (subscriber, action) => {
    if (!subscriber?.id) return;
    const reason = window.prompt(`Reason for ${action}?`, "");
    if (reason == null) return;
    const loadingKey = `${action}-${subscriber.id}`;
    setActionLoading(loadingKey);
    try {
      if (action === "freeze") await api.freezeOwnerSubscriber(subscriber.id, reason || "Frozen by owner");
      if (action === "unfreeze") await api.unfreezeOwnerSubscriber(subscriber.id, reason || "Unfrozen by owner");
      await loadAll();
      if (detail?.subscriber?.id === subscriber.id) {
        setDetail(await api.getOwnerSubscriber(subscriber.id));
      }
    } catch (err) {
      setError(err.message || "Owner action failed.");
    } finally {
      setActionLoading("");
    }
  };

  const ownerView = useMemo(() => {
    const healthChecks = health?.checks || [];
    const pastDueSubscriber = subscribers.find((sub) => String(sub.status || "").toLowerCase() === "past due");
    const newSignupsMetric = (summary?.metrics || []).find((metric) => /new signups/i.test(metric.label || ""));
    const quoteRequestsMetric = (summary?.metrics || []).find((metric) => /quote requests/i.test(metric.label || ""));
    const newDotLeadsMetric = (summary?.metrics || []).find((metric) => /new dot/i.test(metric.label || ""));

    const attention = [];
    if ((revenue?.pastDueAccounts || 0) > 0) {
      attention.push({
        tone: "danger",
        badge: "High Priority",
        title: `${revenue.pastDueAccounts} Account${revenue.pastDueAccounts === 1 ? "" : "s"} Past Due`,
        detail: pastDueSubscriber ? `${pastDueSubscriber.name} (${pastDueSubscriber.email})` : "Review subscriber billing status.",
        action: "Review Account",
        subscriber: pastDueSubscriber,
      });
    }
    alerts.slice(0, 4).forEach((alert) => {
      if (attention.some((item) => item.title && alert.message?.includes(item.title))) return;
      attention.push({
        tone: statusVariant(alert.severity) === "danger" ? "danger" : "warning",
        badge: statusLabel(alert.severity),
        title: alert.message,
        detail: dateValue(alert.timestamp),
        action: alert.action,
      });
    });

    return {
      healthChecks,
      systemLabel: systemStatusLabel(healthChecks),
      newDotLeads: activity?.newDotLeadsImported ?? newDotLeadsMetric?.value,
      newSignups: revenue?.newSubscriptionsThisMonth ?? newSignupsMetric?.value,
      quoteRequests: activity?.quoteRequestsSubmitted ?? quoteRequestsMetric?.value,
      attention,
    };
  }, [activity, alerts, health, revenue, subscribers, summary]);

  if (!isOwner) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen space-y-6 bg-zinc-950 text-zinc-100 animate-fade-in">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Owner Console</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Owner Command Center</h1>
            <p className="mt-1 text-sm text-zinc-500">Last updated {dateValue(summary?.lastUpdated)}</p>
          </div>

          <div className="flex flex-1 flex-col gap-3 xl:max-w-4xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHealthOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-left text-sm font-semibold text-emerald-200 lg:w-auto"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDot(summary?.platformStatus)}`} />
                  <span>{ownerView.systemLabel}</span>
                  <span className="text-xs text-emerald-300">{healthOpen ? "Hide" : "Show"}</span>
                </button>
                {healthOpen && (
                  <div className="absolute right-0 z-20 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl lg:w-[520px]">
                    {ownerView.healthChecks.map((item) => (
                      <div key={item.name} className="grid gap-2 rounded-lg px-3 py-2 hover:bg-zinc-900 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`h-2 w-2 rounded-full ${statusDot(item.status)}`} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{item.name}</p>
                            <p className="truncate text-xs text-zinc-500">{item.message}</p>
                          </div>
                        </div>
                        <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                    ))}
                    {!ownerView.healthChecks.length && <p className="px-3 py-2 text-sm text-zinc-500">Loading system checks...</p>}
                  </div>
                )}
              </div>
              <Button size="sm" variant="secondary" loading={loading} onClick={loadAll}>Refresh</Button>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <span><strong className="text-white">{numberValue(ownerView.newDotLeads)}</strong> New DOT Leads <span className="text-zinc-600">(This Week)</span></span>
              <span className="hidden text-zinc-700 sm:inline">-&gt;</span>
              <span><strong className="text-white">{numberValue(ownerView.newSignups)}</strong> New Signup{Number(ownerView.newSignups) === 1 ? "" : "s"}</span>
              <span className="hidden text-zinc-700 sm:inline">-&gt;</span>
              <span><strong className="text-white">{numberValue(ownerView.quoteRequests)}</strong> Quote Requests</span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger-500/20 bg-danger-500/10 p-3 text-sm text-danger-300">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
        <div className="space-y-6 lg:col-span-7">
          <Card className="border-zinc-800 bg-zinc-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Financial Health</h2>
                <p className="text-xs text-zinc-500">{revenue?.source || "Loading revenue source..."}</p>
              </div>
              <Badge variant={statusVariant(revenue?.paymentHealth?.webhookStatus)}>{revenue?.paymentHealth?.webhookStatus || "Unknown"}</Badge>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MicroMetric label="MRR" value={money(revenue?.mrr)} tone="green" />
              <MicroMetric label="ARR" value={money(revenue?.arr)} tone="cyan" />
              <MicroMetric label="Avg Revenue / Account" value={money(revenue?.averageRevenuePerAccount)} tone="slate" />
            </div>
            {(revenue?.pastDueAccounts || 0) > 0 && (
              <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {revenue.pastDueAccounts} account{revenue.pastDueAccounts === 1 ? "" : "s"} past due. Review billing before access issues spread.
              </div>
            )}
          </Card>

          <Card className="border-zinc-800 bg-zinc-900">
            <h2 className="text-lg font-semibold text-white">Lead Platform</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LeadTile label="Data Freshness" value={`Last Import: ${dateValue(freshness?.lastNewDotImport)}`} detail={`Renewal refresh: ${dateValue(freshness?.lastRenewalRefresh)}`} />
              <LeadTile label="Cache Engine" value={`${numberValue(freshness?.totalCarriersCached)} Carriers Cached`} detail={`${numberValue(freshness?.totalCarriersEnriched)} enriched | ${numberValue(freshness?.failedEnrichmentCount)} failed`} />
              <LeadTile label="User Productivity" value={`${numberValue(activity?.emailOutreachSent)} Outreach Sent`} detail={`${numberValue(activity?.marketplaceLeadsSold)} leads sold | ${numberValue(activity?.carriersSavedToCrm)} saved to CRM`} />
              <LeadTile label="Search Demand" value={`${numberValue(activity?.leadSearchesToday)} Searches Today`} detail={`${numberValue(activity?.leadSearchesThisMonth)} searches this month`} />
            </div>
          </Card>
        </div>

        <aside className="lg:col-span-3">
          <div className="sticky top-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold text-white">Needs Attention</h2>
            <div className="mt-4 space-y-3">
              {ownerView.attention.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className={`rounded-xl border p-4 ${
                    item.tone === "danger"
                      ? "border-red-400/25 bg-red-500/10"
                      : "border-amber-400/25 bg-amber-500/10"
                  }`}
                >
                  <Badge variant={item.tone === "danger" ? "danger" : "warning"}>{item.badge}</Badge>
                  <p className="mt-3 text-sm font-semibold text-white">{item.title}</p>
                  <p className={`mt-1 text-xs ${item.tone === "danger" ? "text-red-200" : "text-amber-200"}`}>{item.detail}</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant={item.tone === "danger" ? "danger" : "secondary"}
                    onClick={() => item.subscriber ? openSubscriber(item.subscriber) : setHealthOpen(true)}
                  >
                    {item.action || "Review"}
                  </Button>
                </div>
              ))}
              {!ownerView.attention.length && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                  No active owner alerts.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <Card className="!p-0 overflow-hidden border-zinc-800 bg-zinc-900">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Current Subscribers</h2>
          <p className="text-xs text-zinc-500">Click a row to view usage, notes, billing IDs, and owner actions.</p>
        </div>
        <div className="hidden md:block">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-white/5">
                {["Subscriber Details", "Plan & Billing", "Activity & Metrics", "Quick Actions"].map((heading) => (
                  <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr
                  key={`${sub.source}-${sub.id || sub.email}`}
                  className={`cursor-pointer border-b border-zinc-800/70 odd:bg-zinc-950/20 hover:bg-zinc-800/45 ${isCanceled(sub) ? "opacity-60" : ""}`}
                  onClick={() => openSubscriber(sub)}
                >
                  <td className="px-5 py-4 align-top">
                    <p className={`text-sm font-semibold ${isCanceled(sub) ? "text-zinc-400" : "text-white"}`}>{sub.name}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{sub.email}</p>
                    <p className="mt-1 truncate text-xs text-zinc-600">{sub.company || "No company listed"}</p>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sub.plan === "premium" ? "brand" : sub.plan === "pro" ? "success" : "outline"}>{sub.plan}</Badge>
                      <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-white">{money(sub.monthlyPrice)} <span className="text-xs text-zinc-500">/ month</span></p>
                    <p className="mt-1 text-xs text-zinc-500">Renews {dateValue(sub.currentPeriodEnds)}</p>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm text-white">{numberValue(sub.leadsUsed)} leads used</p>
                    <p className="mt-1 text-xs text-zinc-500">{numberValue(sub.emailsSent)} emails sent | {numberValue(sub.exportsThisMonth)} exports</p>
                    <p className="mt-1 text-xs text-zinc-600">Last login {dateValue(sub.lastLogin)}</p>
                  </td>
                  <td className="px-5 py-4 align-top" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openSubscriber(sub)}>View</Button>
                      {sub.accountStatus === "frozen" ? (
                        <Button size="sm" variant="secondary" loading={actionLoading === `unfreeze-${sub.id}`} onClick={() => handleSubscriberQuickAction(sub, "unfreeze")}>Unfreeze</Button>
                      ) : (
                        <Button size="sm" variant="secondary" loading={actionLoading === `freeze-${sub.id}`} onClick={() => handleSubscriberQuickAction(sub, "freeze")}>Freeze</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {subscribers.map((sub) => (
            <button
              key={`${sub.source}-${sub.id || sub.email}-mobile`}
              type="button"
              className={`w-full rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-left odd:bg-zinc-950/70 ${isCanceled(sub) ? "opacity-60" : ""}`}
              onClick={() => openSubscriber(sub)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${isCanceled(sub) ? "text-zinc-400" : "text-white"}`}>{sub.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{sub.email}</p>
                </div>
                <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                <p><span className="block text-zinc-300">{sub.plan}</span>{money(sub.monthlyPrice)}</p>
                <p><span className="block text-zinc-300">{numberValue(sub.leadsUsed)}</span>Leads used</p>
                <p><span className="block text-zinc-300">{numberValue(sub.emailsSent)}</span>Emails sent</p>
                <p><span className="block text-zinc-300">{dateValue(sub.lastLogin)}</span>Last login</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <DetailDrawer
        detail={detail}
        loading={detailLoading}
        note={note}
        setNote={setNote}
        onClose={() => setDetail(null)}
        onAction={handleAction}
        actionLoading={actionLoading}
      />
    </div>
  );
}
