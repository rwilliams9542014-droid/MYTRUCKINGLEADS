import { useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "subscription", label: "Subscription" },
    { id: "notifications", label: "Notifications" },
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
