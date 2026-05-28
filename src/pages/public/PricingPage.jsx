import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";

const plans = [
  {
    name: "Starter",
    price: "$79",
    period: "/month",
    description: "For individual agents getting started with trucking leads.",
    features: [
      "New DOT alerts (24hr delay)",
      "Basic carrier profiles",
      "Carrier search",
      "Lead Desk with basic filters",
      "CRM pipeline (table view)",
      "CSV export limited to 300 rows/month",
      "Daily export limit of 100 rows",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$199",
    period: "/month",
    description: "For serious producers ready to scale their trucking book.",
    badge: "Most Popular",
    features: [
      "Unlimited leads",
      "Real-time New DOT alerts",
      "Full carrier intelligence profiles",
      "Insurance renewal calendar",
      "Advanced search (cargo, rating, fleet size)",
      "CRM pipeline (Kanban + Table views)",
      "CSV export limited to 1,000 rows/month",
      "Daily export limit of 250 rows",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Agency",
    price: "$499",
    period: "/month",
    description: "For teams and agencies dominating their market.",
    features: [
      "Everything in Pro",
      "Up to 10 team seats",
      "Unlimited CSV exports",
      "Dedicated account manager",
      "Custom integrations & API access",
      "White-label reports",
      "Early access to new features",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "How does the free trial work?",
    a: "You get full access to your selected plan for 3 days, no credit card required. If you love it (you will), pick a plan and keep going.",
  },
  {
    q: "What are 'hot leads' from truckers?",
    a: "Trucking companies actively requesting insurance quotes through our platform. These are pre-qualified prospects who need coverage now -- delivered exclusively to Pro and Agency subscribers.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Cancel from your settings page and your access continues until the end of your billing period.",
  },
  {
    q: "Do you offer volume discounts?",
    a: "Agency plans include team seats. For larger organizations or custom needs, reach out to our sales team for enterprise pricing.",
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
            Choose Your Plan
          </h1>
          <p className="text-lg text-navy-300 max-w-xl mx-auto">
            Every plan includes a 3-day free trial. No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-24">
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
