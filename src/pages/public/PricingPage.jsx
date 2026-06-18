import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";

const plans = [
  {
    name: "Producer Pro",
    price: "$149.99",
    period: "/month",
    description: "One simple workspace for insurance producers building a trucking book.",
    badge: "Simple Plan",
    features: [
      "1 lead state included",
      "Additional states: $49.99/month each",
      "Additional users: $19.99/month each",
      "Renewal opportunities up to 60 days out",
      "New DOT leads from the last 30 days",
      "Carrier intelligence profiles",
      "CRM pipeline with Kanban and table views",
      "CSV exports up to 100 carriers/day and 1,000/month",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
];

const faqs = [
  {
    q: "How does the free trial work?",
    a: "You can preview the workspace for 3 days. Trial accounts can export up to 10 carriers per day from Lead Desk, search renewals up to 15 days out, and search New DOT leads from the last 15 days.",
  },
  {
    q: "What are 'hot leads' from truckers?",
    a: "Trucking companies actively requesting insurance quotes through our platform. These are pre-qualified prospects who need coverage now when marketplace inventory is available.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Cancel from your settings page and your access continues until the end of your billing period.",
  },
  {
    q: "Do you offer volume discounts?",
    a: "The plan starts with one state and one user. Add states for $49.99/month each and users for $19.99/month each.",
  },
];

export default function PricingPage() {
  return (
    <div className="pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="brand" className="mb-4">Simple, Transparent Pricing</Badge>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
            One Simple Plan
          </h1>
          <p className="text-lg text-navy-300 max-w-xl mx-auto">
            Producer Pro is $149.99/month with a focused trial, one included state, and clean add-ons as you grow.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 gap-6 max-w-xl mx-auto mb-24">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 transition-all duration-300 ${
                plan.highlighted
                  ? "bg-brand-500/10 border-2 border-brand-500/40 shadow-glow-lg scale-[1.02]"
                  : "glass-card hover:border-white/10"
              }`}
            >
              {plan.badge && (
                <Badge variant="brand" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  {plan.badge}
                </Badge>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-navy-400 min-h-[40px]">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-navy-400">{plan.period}</span>
              </div>

              <Link
                to="/signup"
                className={`block text-center w-full py-3 rounded-xl font-semibold transition-all duration-200 mb-8 ${
                  plan.highlighted
                    ? "bg-brand-500 hover:bg-brand-600 text-white shadow-glow"
                    : "bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <svg className="w-4 h-4 text-accent-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-navy-200">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-10">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <details key={faq.q} className="glass-card p-6 group cursor-pointer">
                <summary className="flex items-center justify-between text-white font-medium list-none">
                  {faq.q}
                  <svg className="w-5 h-5 text-navy-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-4 text-sm text-navy-300 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
