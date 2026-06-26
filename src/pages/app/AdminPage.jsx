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

function MetricCard({ metric }) {
  const isMoney = /revenue|recurring/i.test(metric.label);
  return (
    <Card className="border-cyan-300/10 bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-navy-400">{metric.label}</p>
          <p className="mt-3 text-2xl font-bold text-white">{isMoney ? money(metric.value) : numberValue(metric.value)}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${statusDot(metric.status)}`} />
      </div>
      <p className="mt-3 min-h-4 text-xs text-navy-500">{metric.detail || metric.action || "Live owner metric"}</p>
    </Card>
  );
}

function HealthRow({ item }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0 md:grid-cols-[1.3fr_.8fr_1.4fr_.8fr] md:items-center">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`} />
        <span className="text-sm font-medium text-white">{item.name}</span>
      </div>
      <Badge variant={statusVariant(item.status)}>{String(item.status || "unknown").replace(/_/g, " ")}</Badge>
      <p className="text-sm text-navy-400">{item.message}</p>
      <p className="text-xs text-navy-500">{dateValue(item.lastChecked)}</p>
    </div>
  );
}

function ActivityCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-navy-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{numberValue(value)}</p>
    </div>
  );
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
              <ActivityCard label="SMS Sent This Month" value={detail.usage?.smsSentThisMonth} />
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
  const [insuranceSources, setInsuranceSources] = useState(null);
  const [insuranceImporting, setInsuranceImporting] = useState(false);
  const [insuranceBackfilling, setInsuranceBackfilling] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isOwner = user?.isOwner || user?.role === "owner" || user?.role === "admin" || user?.email === OWNER_EMAIL;

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, healthData, subscribersData, revenueData, activityData, freshnessData, insuranceSourceData, alertsData] = await Promise.all([
        api.getOwnerSummary(),
        api.getOwnerHealth(),
        api.getOwnerSubscribers(),
        api.getOwnerRevenue(),
        api.getOwnerActivity(),
        api.getOwnerDataFreshness(),
        api.getOwnerInsuranceSources(),
        api.getOwnerAlerts(),
      ]);
      setSummary(summaryData);
      setHealth(healthData);
      setSubscribers(subscribersData?.subscribers || []);
      setRevenue(revenueData);
      setActivity(activityData);
      setFreshness(freshnessData);
      setInsuranceSources(insuranceSourceData);
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

  const revenueCards = useMemo(() => ([
    ["MRR", money(revenue?.mrr)],
    ["ARR", money(revenue?.arr)],
    ["Revenue This Month", money(revenue?.revenueThisMonth)],
    ["Revenue Last Month", money(revenue?.revenueLastMonth)],
    ["New Subscriptions", numberValue(revenue?.newSubscriptionsThisMonth)],
    ["Cancellations", numberValue(revenue?.cancellationsThisMonth)],
    ["Failed Payments", numberValue(revenue?.failedPayments)],
    ["Past Due", numberValue(revenue?.pastDueAccounts)],
    ["Avg Revenue / Account", money(revenue?.averageRevenuePerAccount)],
  ]), [revenue]);

  const runInsuranceImport = async () => {
    if (!window.confirm("Run the owner-only insurance filing intelligence import now?")) return;
    setInsuranceImporting(true);
    setError("");
    try {
      await api.runOwnerInsuranceImport();
      const [freshnessData, insuranceSourceData, healthData] = await Promise.all([
        api.getOwnerDataFreshness(),
        api.getOwnerInsuranceSources(),
        api.getOwnerHealth(),
      ]);
      setFreshness(freshnessData);
      setInsuranceSources(insuranceSourceData);
      setHealth(healthData);
    } catch (err) {
      setError(err.message || "Insurance import failed.");
    } finally {
      setInsuranceImporting(false);
    }
  };

  const runInsuranceBackfill = async () => {
    if (!window.confirm("Backfill estimated renewal windows from public filing effective dates now?")) return;
    setInsuranceBackfilling(true);
    setError("");
    try {
      const result = await api.runOwnerInsuranceBackfill();
      const [freshnessData, insuranceSourceData, healthData] = await Promise.all([
        api.getOwnerDataFreshness(),
        api.getOwnerInsuranceSources(),
        api.getOwnerHealth(),
      ]);
      setFreshness(freshnessData);
      setInsuranceSources({
        ...insuranceSourceData,
        warning: result?.message || insuranceSourceData?.warning,
        backfillStats: result?.stats
      });
      setHealth(healthData);
    } catch (err) {
      setError(err.message || "Insurance renewal window backfill failed.");
    } finally {
      setInsuranceBackfilling(false);
    }
  };

  if (!isOwner) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl border border-cyan-300/10 bg-gradient-to-br from-[#071527] via-[#04101f] to-[#020817] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-brand-300">Owner Console</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Owner Command Center</h1>
            <p className="mt-1 text-sm text-navy-400">Monitor subscribers, revenue, data health, and platform activity.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusVariant(summary?.platformStatus)}>{summary?.platformStatus || "Loading"}</Badge>
            <p className="text-xs text-navy-500">Last updated: {dateValue(summary?.lastUpdated)}</p>
            <Button size="sm" variant="secondary" loading={loading} onClick={loadAll}>Refresh</Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger-500/20 bg-danger-500/10 p-3 text-sm text-danger-300">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(summary?.metrics || []).map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        {loading && !summary && Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="h-32 animate-pulse bg-white/[0.03]" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="!p-0 overflow-hidden border-cyan-300/10 bg-white/[0.03]">
          <div className="border-b border-white/5 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">Website Health</h2>
            <p className="text-xs text-navy-500">Safe checks only. Secrets are never returned.</p>
          </div>
          {(health?.checks || []).map((item) => <HealthRow key={item.name} item={item} />)}
        </Card>

        <Card className="border-cyan-300/10 bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-white">Needs Attention</h2>
          <div className="mt-4 space-y-3">
            {alerts.map((alert, index) => (
              <div key={`${alert.message}-${index}`} className="rounded-xl border border-white/10 bg-navy-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={statusVariant(alert.severity)}>{alert.severity}</Badge>
                  <span className="text-xs text-navy-500">{dateValue(alert.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm text-white">{alert.message}</p>
                <p className="mt-1 text-xs text-brand-300">{alert.action}</p>
              </div>
            ))}
            {!alerts.length && <p className="rounded-xl bg-accent-500/10 p-4 text-sm text-accent-300">No active owner alerts.</p>}
          </div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden border-cyan-300/10 bg-white/[0.03]">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Current Subscribers</h2>
          <p className="text-xs text-navy-500">Click a row to view usage, notes, billing IDs, and owner actions.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table w-full min-w-[1180px]">
            <thead>
              <tr className="border-b border-white/5">
                {["Name", "Email", "Company / Agency", "Plan", "Status", "Trial Ends", "Current Period Ends", "Monthly Price", "Users/Seats", "Last Login", "Leads Used", "Emails Sent", "Created", "Actions"].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-navy-400">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={`${sub.source}-${sub.id || sub.email}`} className="cursor-pointer border-b border-white/[0.03] hover:bg-white/[0.04]" onClick={() => openSubscriber(sub)}>
                  <td className="px-4 py-3 text-sm font-medium text-white">{sub.name}</td>
                  <td className="px-4 py-3 text-sm text-navy-300">{sub.email}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{sub.company || "-"}</td>
                  <td className="px-4 py-3"><Badge variant={sub.plan === "premium" ? "brand" : sub.plan === "pro" ? "success" : "outline"}>{sub.plan}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={statusVariant(sub.status)}>{sub.status}</Badge></td>
                  <td className="px-4 py-3 text-sm text-navy-400">{dateValue(sub.trialEnds)}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{dateValue(sub.currentPeriodEnds)}</td>
                  <td className="px-4 py-3 text-sm text-white">{money(sub.monthlyPrice)}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{sub.seats || 1}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{dateValue(sub.lastLogin)}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{numberValue(sub.leadsUsed)}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{numberValue(sub.emailsSent)}</td>
                  <td className="px-4 py-3 text-sm text-navy-400">{dateValue(sub.createdDate)}</td>
                  <td className="px-4 py-3"><Button size="sm" variant="ghost">View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-cyan-300/10 bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-white">Revenue / Production</h2>
          <p className="mt-1 text-xs text-navy-500">{revenue?.source || "Loading revenue source..."}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {revenueCards.map(([label, value]) => <ActivityCard key={label} label={label} value={value} />)}
          </div>
          <div className="mt-5 rounded-xl border border-white/10 bg-navy-950/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Payment Health</h3>
              <Badge variant={statusVariant(revenue?.paymentHealth?.webhookStatus)}>{revenue?.paymentHealth?.webhookStatus || "Unknown"}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ActivityCard label="Successful Payments" value={revenue?.paymentHealth?.successfulPayments} />
              <ActivityCard label="Webhook Failures" value={revenue?.paymentHealth?.failedPayments} />
            </div>
          </div>
        </Card>

        <Card className="border-cyan-300/10 bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-white">Lead Platform Activity</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActivityCard label="Lead Searches Today" value={activity?.leadSearchesToday} />
            <ActivityCard label="Lead Searches This Month" value={activity?.leadSearchesThisMonth} />
            <ActivityCard label="New DOT Leads Imported" value={activity?.newDotLeadsImported} />
            <ActivityCard label="Renewal Leads Available" value={activity?.renewalLeadsAvailable} />
            <ActivityCard label="Carriers Saved to CRM" value={activity?.carriersSavedToCrm} />
            <ActivityCard label="Exports This Month" value={activity?.exportsThisMonth} />
            <ActivityCard label="Copy Email Actions" value={activity?.copyEmailActions} />
            <ActivityCard label="Email Outreach Sent" value={activity?.emailOutreachSent} />
            <ActivityCard label="Marketplace Leads Sold" value={activity?.marketplaceLeadsSold} />
            <ActivityCard label="Quote Requests Submitted" value={activity?.quoteRequestsSubmitted} />
          </div>
        </Card>
      </div>

      <Card className="border-cyan-300/10 bg-white/[0.03]">
        <h2 className="text-lg font-semibold text-white">Data Freshness</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActivityCard label="Last FMCSA Carrier Lookup" value={dateValue(freshness?.lastFmcsaCarrierLookup)} />
          <ActivityCard label="Last Motus/Public Import" value={dateValue(freshness?.lastMotusPublicDataImport)} />
          <ActivityCard label="Last New DOT Import" value={dateValue(freshness?.lastNewDotImport)} />
          <ActivityCard label="Last Renewal Refresh" value={dateValue(freshness?.lastRenewalRefresh)} />
          <ActivityCard label="Last Safety/SMS Check" value={dateValue(freshness?.lastSafetySmsDataCheck)} />
          <ActivityCard label="Total Carriers Cached" value={freshness?.totalCarriersCached} />
          <ActivityCard label="Total Carriers Enriched" value={freshness?.totalCarriersEnriched} />
          <ActivityCard label="Failed Enrichment Count" value={freshness?.failedEnrichmentCount} />
        </div>
      </Card>

      <Card className="border-cyan-300/10 bg-white/[0.03]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Insurance Data Sources</h2>
            <p className="mt-1 text-xs text-navy-500">
              Frozen sources are historical only. Verified cancellation leads require a current public source.
            </p>
            {insuranceSources?.warning && <p className="mt-2 text-sm text-amber-200">{insuranceSources.warning}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={runInsuranceImport} disabled={insuranceImporting || insuranceBackfilling}>
              {insuranceImporting ? "Running..." : "Run Insurance Import Now"}
            </Button>
            <Button size="sm" variant="secondary" onClick={runInsuranceBackfill} disabled={insuranceImporting || insuranceBackfilling}>
              {insuranceBackfilling ? "Backfilling..." : "Backfill Renewal Windows"}
            </Button>
          </div>
        </div>
        {insuranceSources?.backfillStats && (
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {Object.entries(insuranceSources.backfillStats).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-white/10 bg-navy-900/40 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-navy-500">{key.replace(/([A-Z])/g, " $1")}</p>
                <p className="mt-1 text-sm font-semibold text-white">{numberValue(value)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="premium-table w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-white/5">
                {["Source", "Status", "Latest Record", "Records", "Safe For Current Leads", "Message"].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-navy-400">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(insuranceSources?.sources || freshness?.insuranceSources || []).map((source) => (
                <tr key={source.source_name} className="border-b border-white/[0.03]">
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    <p>{source.source_name}</p>
                    <p className="text-xs text-navy-500">{source.dataset_id}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant={statusVariant(source.status)}>{String(source.status || "unknown").replace(/_/g, " ")}</Badge></td>
                  <td className="px-4 py-3 text-sm text-navy-300">{source.latest_record_date || "-"}</td>
                  <td className="px-4 py-3 text-sm text-navy-300">{numberValue(source.record_count)}</td>
                  <td className="px-4 py-3"><Badge variant={source.safe_for_current_leads ? "success" : "warning"}>{source.safe_for_current_leads ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3 text-sm text-navy-400">{source.message || source.error_message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
