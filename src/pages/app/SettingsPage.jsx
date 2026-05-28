import { useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

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
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name" placeholder="John Smith" defaultValue={user?.name || ""} />
              <Input label="Agency Name" placeholder="Your Insurance Agency" defaultValue={user?.businessName || ""} />
            </div>
            <Input label="Email" type="email" value={user?.email || ""} disabled />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Phone" type="tel" placeholder="(555) 123-4567" defaultValue={user?.phone || ""} />
              <div>
                <label className="block text-sm font-medium text-navy-200 mb-2">Primary State</label>
                <select className="input-field" defaultValue={user?.leadState || ""}>
                  <option value="" className="bg-navy-900">Select your state</option>
                  {["TX","CA","FL","IL","OH","PA","NY","GA","NC","WA"].map((s) => (
                    <option key={s} value={s} className="bg-navy-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-4">
              <Button type="button" onClick={() => setMessage("Profile updates use the existing account backend when enabled.")}>Save Changes</Button>
            </div>
          </div>
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
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Current Plan</h2>
                <p className="text-navy-400 text-sm mt-1">{user?.subscriptionStatus || user?.subscription_status || "Data unavailable."}</p>
              </div>
              <Badge variant="brand">{user?.plan || "Data unavailable"}</Badge>
            </div>
            <div className="mt-6 p-4 bg-navy-800/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{user?.plan ? `${user.plan} plan` : "Plan data unavailable."}</p>
                  <p className="text-xs text-navy-400 mt-1">Access expires: {user?.subscription_expires_at || user?.trialEndsAt || "Data unavailable."}</p>
                </div>
                <Button variant="secondary" size="sm" type="button">Manage</Button>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Usage This Period</h2>
            <div className="space-y-4">
              {[
                { label: "Carrier Profiles Viewed", used: user?.dailyProfileViews ?? 0, limit: "Plan based" },
                { label: "Contact Views", used: user?.dailyContactViews ?? 0, limit: "Plan based" },
                { label: "Saved Prospects", used: user?.dailySavedProspects ?? 0, limit: "Plan based" },
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
