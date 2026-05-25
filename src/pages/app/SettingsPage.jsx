import { useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [theme, setTheme] = useState("dark");
  const [accentColor, setAccentColor] = useState("blue");
  const [crmLayout, setCrmLayout] = useState("kanban");

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "subscription", label: "Subscription" },
    { id: "appearance", label: "Appearance" },
    { id: "notifications", label: "Notifications" },
  ];

  const accentColors = [
    { id: "blue", label: "Blue", color: "bg-blue-500", ring: "ring-blue-500" },
    { id: "teal", label: "Teal", color: "bg-teal-500", ring: "ring-teal-500" },
    { id: "emerald", label: "Emerald", color: "bg-emerald-500", ring: "ring-emerald-500" },
    { id: "amber", label: "Amber", color: "bg-amber-500", ring: "ring-amber-500" },
    { id: "rose", label: "Rose", color: "bg-rose-500", ring: "ring-rose-500" },
    { id: "slate", label: "Slate", color: "bg-slate-400", ring: "ring-slate-400" },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-navy-400 text-sm mt-1">Manage your account, preferences, and display</p>
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
              <Input label="Full Name" placeholder="John Smith" defaultValue={user?.user_metadata?.full_name || ""} />
              <Input label="Agency Name" placeholder="Your Insurance Agency" defaultValue={user?.user_metadata?.agency_name || ""} />
            </div>
            <Input label="Email" type="email" value={user?.email || ""} disabled />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Phone" type="tel" placeholder="(555) 123-4567" />
              <div>
                <label className="block text-sm font-medium text-navy-200 mb-2">Primary State</label>
                <select className="input-field">
                  <option value="" className="bg-navy-900">Select your state</option>
                  {["TX","CA","FL","IL","OH","PA","NY","GA","NC","WA"].map((s) => (
                    <option key={s} value={s} className="bg-navy-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-4">
              <Button>Save Changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Subscription Tab */}
      {activeTab === "subscription" && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Current Plan</h2>
                <p className="text-navy-400 text-sm mt-1">You're on the Pro plan</p>
              </div>
              <Badge variant="brand">Pro</Badge>
            </div>
            <div className="mt-6 p-4 bg-navy-800/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">Pro Plan - $199/month</p>
                  <p className="text-xs text-navy-400 mt-1">Next billing date: June 25, 2026</p>
                </div>
                <Button variant="secondary" size="sm">Manage</Button>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Usage This Period</h2>
            <div className="space-y-4">
              {[
                { label: "Leads Accessed", used: 847, limit: "Unlimited" },
                { label: "CSV Exports", used: 1240, limit: 5000 },
                { label: "Hot Leads Purchased", used: 3, limit: 20 },
                { label: "Carrier Profiles Viewed", used: 312, limit: "Unlimited" },
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

      {/* Appearance Tab */}
      {activeTab === "appearance" && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-white mb-6">Theme</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: "dark", label: "Dark Mode", desc: "Easy on the eyes, great for long sessions", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" },
                { id: "light", label: "Light Mode", desc: "Classic bright interface", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
                { id: "system", label: "System", desc: "Match your device settings", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    theme === t.id ? "border-brand-500/40 bg-brand-500/10" : "border-white/5 hover:border-white/10 bg-navy-800/30"
                  }`}
                >
                  <svg className={`w-6 h-6 mb-3 ${theme === t.id ? "text-brand-400" : "text-navy-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={t.icon} />
                  </svg>
                  <p className="text-sm font-medium text-white">{t.label}</p>
                  <p className="text-[11px] text-navy-400 mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-6">Accent Color</h2>
            <div className="flex flex-wrap gap-3">
              {accentColors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAccentColor(c.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
                    accentColor === c.id ? `border-white/20 bg-white/5 ring-2 ${c.ring} ring-offset-2 ring-offset-navy-900` : "border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full ${c.color}`} />
                  <span className="text-sm text-navy-200">{c.label}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-6">CRM Default Layout</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setCrmLayout("kanban")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  crmLayout === "kanban" ? "border-brand-500/40 bg-brand-500/10" : "border-white/5 hover:border-white/10 bg-navy-800/30"
                }`}
              >
                <svg className={`w-6 h-6 mb-3 ${crmLayout === "kanban" ? "text-brand-400" : "text-navy-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                <p className="text-sm font-medium text-white">Kanban Board</p>
                <p className="text-[11px] text-navy-400 mt-1">Drag-and-drop cards between pipeline stages. Visual and modern.</p>
              </button>
              <button
                onClick={() => setCrmLayout("table")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  crmLayout === "table" ? "border-brand-500/40 bg-brand-500/10" : "border-white/5 hover:border-white/10 bg-navy-800/30"
                }`}
              >
                <svg className={`w-6 h-6 mb-3 ${crmLayout === "table" ? "text-brand-400" : "text-navy-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <p className="text-sm font-medium text-white">Classic Table View</p>
                <p className="text-[11px] text-navy-400 mt-1">Traditional spreadsheet-style list. Simple and familiar.</p>
              </button>
            </div>
          </Card>

          <div className="pt-2">
            <Button>Save Appearance Settings</Button>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-6">Notification Preferences</h2>
          <div className="space-y-4">
            {[
              { label: "New DOT Alerts", desc: "Get notified when new trucking companies register in your states", default: true },
              { label: "Renewal Reminders", desc: "Alerts when carrier policies are expiring soon", default: true },
              { label: "Hot Lead Notifications", desc: "When truckers request quotes in your area", default: true },
              { label: "Weekly Performance Summary", desc: "Pipeline and lead activity overview every Monday", default: false },
              { label: "CRM Activity Reminders", desc: "Follow-up reminders for leads in your pipeline", default: true },
            ].map((pref) => (
              <div key={pref.label} className="flex items-start justify-between p-4 bg-navy-800/30 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">{pref.label}</p>
                  <p className="text-xs text-navy-400 mt-0.5">{pref.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
                  <input type="checkbox" defaultChecked={pref.default} className="sr-only peer" />
                  <div className="w-10 h-5 bg-navy-700 peer-checked:bg-brand-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button>Save Preferences</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
