import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";

const stats = [
  { value: "48,000+", label: "Active Carriers Tracked" },
  { value: "2,400+", label: "New DOTs Monthly" },
  { value: "97%", label: "Data Accuracy" },
];

const features = [
  {
    title: "New DOT Registrations",
    description: "Get notified within 24 hours of new FMCSA filings. Be the first agent to reach new trucking companies before competitors.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Insurance Renewal Leads",
    description: "Know exactly when a carrier's policy expires. Reach out at the perfect time when they're actively shopping for coverage.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "FMCSA Carrier Intel",
    description: "Full carrier profiles with safety scores, authority status, fleet size, and contact info. Everything you need to qualify leads.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Sales CRM Pipeline",
    description: "Manage your entire pipeline from first contact to policy bound. Kanban boards, activity tracking, and deal stages built for insurance.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    title: "Hot Leads from Truckers",
    description: "Truckers actively requesting insurance quotes land directly in your inbox. Pre-qualified, ready-to-close prospects delivered to you.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    ),
  },
  {
    title: "Real-Time Data Sync",
    description: "Our database syncs with FMCSA daily. Always current authority status, inspection history, and insurance filings at your fingertips.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
];

const testimonials = [
  {
    quote: "I closed 3 new accounts in my first week. The renewal leads are gold -- you're reaching carriers right when they need new coverage.",
    name: "Marcus Rivera",
    role: "Commercial Lines Producer",
    agency: "SafeHaul Insurance Group",
  },
  {
    quote: "The CRM pipeline alone is worth the subscription. I finally have one place to track every trucking lead from first call to bound policy.",
    name: "Jennifer Walsh",
    role: "Agency Owner",
    agency: "TruckShield Advisors",
  },
  {
    quote: "New DOT alerts changed my business. Being first to market with newly registered carriers gives me a massive competitive edge.",
    name: "David Park",
    role: "Senior Producer",
    agency: "Interstate Coverage Solutions",
  },
];

export default function HomePage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/5 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-600/3 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <img
              src="/assets/NEW_IMPROVED_FULL_LOGO-removebg-preview.png"
              alt="MyTruckingLeads"
              className="h-16 sm:h-20 mx-auto mb-8 object-contain"
            />
            <Badge variant="brand" className="mb-6">
              Trusted by 500+ Commercial Insurance Agents
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1] mb-6 text-balance">
              Close More Trucking Policies.{" "}
              <span className="gradient-text">Faster.</span>
            </h1>

            <p className="text-lg lg:text-xl text-navy-300 max-w-2xl mx-auto mb-10 leading-relaxed">
              Access new DOT registrations, insurance renewal leads, and carrier intelligence
              from the FMCSA database. The only platform built specifically for commercial trucking insurance producers.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link to="/signup" className="btn-primary text-base px-8 py-4 w-full sm:w-auto">
                Start 3-Day Free Trial
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link to="/pricing" className="btn-secondary text-base px-8 py-4 w-full sm:w-auto">
                View Plans
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl lg:text-3xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-navy-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="relative py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="glass-card p-2 rounded-2xl shadow-panel">
            <div className="bg-navy-900 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-10 bg-navy-800 rounded-t-xl flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-danger-400/60" />
                <div className="w-3 h-3 rounded-full bg-warning-400/60" />
                <div className="w-3 h-3 rounded-full bg-accent-400/60" />
                <span className="ml-4 text-xs text-navy-400 font-mono">mytruckingleads.com/app/lead-desk</span>
              </div>
              <div className="mt-8 grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "New Leads Today", value: "47", trend: "+12%" },
                  { label: "Expiring This Week", value: "128", trend: "+8%" },
                  { label: "Pipeline Value", value: "$34.2K", trend: "+23%" },
                  { label: "Close Rate", value: "18.4%", trend: "+2.1%" },
                ].map((m) => (
                  <div key={m.label} className="bg-navy-800/50 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-navy-400">{m.label}</p>
                    <p className="text-xl font-bold text-white mt-1">{m.value}</p>
                    <span className="text-xs text-accent-400">{m.trend}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { name: "Martinez Trucking LLC", dot: "4102847", state: "TX", status: "New DOT", date: "May 23, 2026" },
                  { name: "Pacific Ridge Transport", dot: "3891024", state: "CA", status: "Renewal", date: "May 28, 2026" },
                  { name: "Heartland Freight Co", dot: "4098331", state: "OH", status: "New DOT", date: "May 22, 2026" },
                  { name: "Summit Logistics Inc", dot: "3774219", state: "IL", status: "Renewal", date: "Jun 01, 2026" },
                ].map((row) => (
                  <div key={row.dot} className="flex items-center gap-4 bg-navy-800/30 border border-white/5 rounded-lg px-4 py-3 text-sm">
                    <span className="text-white font-medium flex-1">{row.name}</span>
                    <span className="text-navy-400 font-mono text-xs">DOT {row.dot}</span>
                    <span className="text-navy-400 w-8">{row.state}</span>
                    <Badge variant={row.status === "New DOT" ? "brand" : "warning"}>{row.status}</Badge>
                    <span className="text-navy-500 text-xs">{row.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Everything You Need to Win Trucking Accounts
            </h2>
            <p className="text-lg text-navy-300 max-w-2xl mx-auto">
              From lead generation to policy binding. One platform, built by people who understand the commercial trucking insurance game.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-card p-6 hover:border-brand-500/20 hover:shadow-glow transition-all duration-300 group"
              >
                <div className="w-12 h-12 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400 mb-4 group-hover:bg-brand-500/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-navy-300 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 lg:py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Agents Are Closing Deals
            </h2>
            <p className="text-lg text-navy-300">See what producers are saying about MyTruckingLeads.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="glass-card p-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-warning-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-navy-200 text-sm leading-relaxed mb-6 italic">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-navy-400">{t.role}, {t.agency}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="glass-card p-12 lg:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-transparent" />
            <div className="relative">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                Ready to Fill Your Pipeline?
              </h2>
              <p className="text-lg text-navy-300 mb-8 max-w-xl mx-auto">
                Join hundreds of producers who are writing more trucking policies with less effort. Start your free trial today.
              </p>
              <Link to="/signup" className="btn-primary text-base px-10 py-4">
                Start Free Trial -- No Credit Card
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
