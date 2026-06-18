import { useEffect, useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    businessName: "",
    phone: "",
    leadState: "",
  });

  useEffect(() => {
    setProfileForm({
      name: user?.name || "",
      businessName: user?.businessName || "",
      phone: user?.phone || "",
      leadState: user?.leadState || "",
    });
  }, [user]);

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "security", label: "Security" },
    { id: "subscription", label: "Subscription" },
  ];

  async function updatePassword(e) {
    e.preventDefault();
    setMessage("");

    if (passwordForm.newPassword.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      await api.updatePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage("Password updated successfully.");
    } catch (err) {
      setMessage(err.status === 404 ? "Password updates are not enabled on the server yet." : (err.message || "Password could not be updated."));
    } finally {
      setPasswordLoading(false);
    }
  }

  async function updateProfile(e) {
    e.preventDefault();
    setMessage("");
    setProfileLoading(true);
    try {
      await api.updateProfile(profileForm);
      await refreshUser();
      setMessage("Profile updated successfully.");
    } catch (err) {
      setMessage(err.message || "Profile could not be updated.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function cancelSubscription() {
    setSubscriptionMessage("");
    setSubscriptionError("");

    const confirmed = window.confirm(
      "Cancel your free trial or subscription? If you are in a trial, it will be canceled before billing starts. If you have a paid subscription, access continues until the end of the current billing period when Stripe allows it."
    );
    if (!confirmed) return;

    setCancelLoading(true);
    try {
      const result = await api.cancelSubscription();
      await refreshUser();
      setSubscriptionMessage(result.message || "Your subscription cancellation request was processed.");
    } catch (err) {
      setSubscriptionError(err.message || "Subscription could not be canceled. Please contact support.");
    } finally {
      setCancelLoading(false);
    }
  }

  async function openBillingPortal() {
    setSubscriptionMessage("");
    setSubscriptionError("");
    setPortalLoading(true);
    try {
      const result = await api.createBillingPortalSession();
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      setSubscriptionError("Billing portal is not configured yet. Please contact support to cancel.");
    } catch (err) {
      setSubscriptionError(err.message || "Billing portal is not configured yet. Please contact support to cancel.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-navy-400 text-sm mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex gap-1 border-b border-white/5 pb-px overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "text-white bg-white/5 border-b-2 border-brand-500"
                : "text-navy-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-6">Profile Information</h2>
          <form onSubmit={updateProfile} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name" placeholder="John Smith" value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} />
              <Input label="Agency Name" placeholder="Your Insurance Agency" value={profileForm.businessName} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessName: e.target.value }))} />
            </div>
            <Input label="Email" type="email" value={user?.email || ""} disabled />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Phone" type="tel" placeholder="(555) 123-4567" value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-navy-200 mb-2">Primary State</label>
                <select className="input-field" value={profileForm.leadState} onChange={(e) => setProfileForm((prev) => ({ ...prev, leadState: e.target.value }))}>
                  <option value="" className="bg-navy-900">Select your state</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s} className="bg-navy-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-4">
              <Button type="submit" loading={profileLoading}>Save Changes</Button>
            </div>
          </form>
        </Card>
      )}

      {message && <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">{message}</div>}

      {activeTab === "security" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-6">Change Password</h2>
          <form onSubmit={updatePassword} className="space-y-5 max-w-xl">
            <Input
              label="Current Password"
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              required
            />
            <Input
              label="New Password"
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              required
            />
            <Button type="submit" loading={passwordLoading}>Update Password</Button>
          </form>
        </Card>
      )}

      {/* Subscription Tab */}
      {activeTab === "subscription" && (
        <div className="space-y-6">
          {subscriptionMessage && (
            <div className="bg-accent-500/10 border border-accent-500/20 rounded-xl p-3 text-sm text-accent-200">
              {subscriptionMessage}
            </div>
          )}
          {subscriptionError && (
            <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-200">
              {subscriptionError}
            </div>
          )}
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Current Plan</h2>
                <p className="text-navy-400 text-sm mt-1">{user?.subscriptionStatus || user?.subscription_status || "Data unavailable."}</p>
              </div>
              <Badge variant="brand">{user?.plan || "Data unavailable"}</Badge>
            </div>
            <div className="mt-6 p-4 bg-navy-800/50 rounded-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{user?.plan ? `${user.plan} plan` : "Plan data unavailable."}</p>
                  <p className="text-xs text-navy-400 mt-1">Access expires: {user?.subscription_expires_at || user?.trialEndsAt || "Data unavailable."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    loading={portalLoading}
                    onClick={openBillingPortal}
                  >
                    Manage Billing
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    loading={cancelLoading}
                    disabled={["canceled", "cancelled", "inactive", "expired"].includes(String(user?.subscriptionStatus || user?.subscription_status || "").toLowerCase())}
                    onClick={cancelSubscription}
                  >
                    Cancel Trial / Subscription
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-warning-500/20 bg-warning-500/10 p-4">
              <p className="text-sm font-medium text-warning-200">Cancel anytime</p>
              <p className="mt-1 text-xs leading-relaxed text-navy-300">
                You may cancel from your Billing page before your trial ends to avoid future charges. Trial accounts are canceled before billing starts. Paid subscriptions are canceled safely through Stripe and normally remain active until the current billing period ends.
              </p>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Usage This Period</h2>
            <div className="space-y-4">
              {[
                { label: "Carrier Profiles Viewed", used: user?.dailyProfileViews ?? 0, limit: "Plan based" },
                { label: "Contact Views", used: user?.dailyContactViews ?? 0, limit: "Plan based" },
                { label: "Saved Prospects", used: user?.dailySavedProspects ?? 0, limit: "Plan based" },
                { label: "CSV Exports Today", used: user?.dailyExportRows ?? 0, limit: user?.dailyExportLimit ?? "Plan based" },
                { label: "CSV Exports", used: user?.monthlyExportRows ?? 0, limit: user?.monthlyExportLimit ?? "Plan based" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-navy-300">{item.label}</span>
                    <span className="text-sm text-white font-mono">
                      {item.used.toLocaleString()} / {typeof item.limit === "number" ? item.limit.toLocaleString() : item.limit}
                    </span>
                  </div>
                  {typeof item.limit === "number" && (
                    <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(item.used / item.limit) * 100}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
