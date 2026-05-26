import { useEffect, useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const themeModes = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

const colorSchemes = [
  { id: "blue", label: "Blue", swatch: "bg-brand-500" },
  { id: "slate", label: "Slate", swatch: "bg-slate-500" },
  { id: "green", label: "Green", swatch: "bg-emerald-500" },
];

function applyTheme(mode, scheme) {
  const resolved = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : mode;
  document.documentElement.dataset.themeMode = resolved;
  document.documentElement.dataset.themePreference = mode;
  document.documentElement.dataset.colorScheme = scheme;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("mtlDisplayMode") || "dark");
  const [colorScheme, setColorScheme] = useState(() => localStorage.getItem("mtlColorScheme") || "blue");
  const [message, setMessage] = useState("");

  useEffect(() => {
    applyTheme(themeMode, colorScheme);
    localStorage.setItem("mtlDisplayMode", themeMode);
    localStorage.setItem("mtlColorScheme", colorScheme);
  }, [themeMode, colorScheme]);

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "subscription", label: "Subscription" },
    { id: "appearance", label: "Appearance" },
  ];

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

      {activeTab === "appearance" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-6">Appearance</h2>
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-navy-200 mb-3">Display Mode</p>
              <div className="flex flex-wrap gap-2">
                {themeModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setThemeMode(mode.id)}
                    className={`px-4 py-2 text-sm rounded-lg border transition-colors ${themeMode === mode.id ? "bg-brand-500/20 text-brand-200 border-brand-500/40" : "text-navy-300 border-white/10 hover:bg-white/5"}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-navy-200 mb-3">Color Scheme</p>
              <div className="flex flex-wrap gap-2">
                {colorSchemes.map((scheme) => (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => setColorScheme(scheme.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${colorScheme === scheme.id ? "bg-brand-500/20 text-brand-200 border-brand-500/40" : "text-navy-300 border-white/10 hover:bg-white/5"}`}
                  >
                    <span className={`w-3 h-3 rounded-full ${scheme.swatch}`} />
                    {scheme.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
