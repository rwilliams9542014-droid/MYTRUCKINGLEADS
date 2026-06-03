import { Link } from "react-router-dom";

const UPDATED = "June 3, 2026";

export default function SubscriptionAgreementPage() {
  return (
    <div className="min-h-screen pt-28 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Subscription Agreement</h1>
          <p className="text-navy-400 mt-2 text-sm">Last updated: {UPDATED}</p>
        </div>

        <div className="glass-card p-8 space-y-8 text-sm text-navy-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Free Trial</h2>
            <p>Your selected plan may begin with a free trial. The trial length, plan name, billing interval, and price after trial are shown before checkout. You must cancel before the trial ends to avoid automatic billing.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Automatic Renewal</h2>
            <p>After the trial, your subscription renews automatically at the disclosed price and billing interval unless you cancel before the renewal date.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Billing Authorization</h2>
            <p>By starting a trial or subscription, you authorize MyTruckingLeads and its payment processor, Stripe, to charge your selected payment method for recurring subscription fees, applicable taxes, and any authorized plan changes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Cancellation</h2>
            <p>You may cancel from Settings &gt; Subscription or through the Stripe billing portal when available. Trial cancellations stop future trial conversion charges. Paid subscription cancellations generally keep access active through the current billing period unless otherwise stated.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. No Guaranteed Results</h2>
            <p>MyTruckingLeads provides lead, data, and workflow tools. We do not guarantee sales, appointments, bound policies, revenue, or specific business outcomes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Acceptable Use</h2>
            <p>You may not misuse the platform, abuse exports, scrape beyond normal product use, spam carriers, share accounts outside your plan, resell data without permission, or violate communication laws and opt-out requests.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Data Source Limitations</h2>
            <p>Carrier information may come from FMCSA, Motus/public registration sources, SMS/SAFER, user-submitted data, and other public or licensed sources. Availability, timing, completeness, and accuracy may vary.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Account Suspension / Freeze</h2>
            <p>We may freeze, suspend, or cancel access for payment failure, abuse, account sharing, rule violations, security concerns, or unlawful use. Freezing access does not automatically cancel billing unless cancellation is separately processed.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Refund Policy</h2>
            <p>Refunds are reviewed case by case. Subscription charges are generally non-refundable once a billing period begins, except where required by law or approved by MyTruckingLeads.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Changes to Plans/Pricing</h2>
            <p>We may update plans, features, trial availability, or pricing. We will provide reasonable notice when changes materially affect active subscriptions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Contact Information</h2>
            <p>Questions about billing, cancellation, or this agreement can be sent to <a href="mailto:rwilliams9542014@gmail.com" className="text-brand-400">rwilliams9542014@gmail.com</a>.</p>
          </section>
        </div>

        <div className="mt-8 text-center">
          <Link to="/signup" className="text-brand-400 hover:text-brand-300 text-sm font-medium">Back to Signup</Link>
        </div>
      </div>
    </div>
  );
}

