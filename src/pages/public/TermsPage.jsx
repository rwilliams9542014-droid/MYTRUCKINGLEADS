import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="min-h-screen pt-28 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-navy-400 mt-2 text-sm">Last updated: May 25, 2026</p>
        </div>

        <div className="glass-card p-8 space-y-8 text-sm text-navy-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using MyTruckingLeads ("the Service"), operated by MyTruckingLeads LLC ("we", "us", "our"), you agree to be bound by these Terms of Service. If you do not agree, you may not access or use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
            <p>MyTruckingLeads provides a carrier intelligence platform for commercial insurance agents and producers. The Service includes access to carrier data sourced from public FMCSA records, insurance lead generation tools, CRM pipeline management, and related functionality as described on our pricing page.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Account Registration</h2>
            <p>You must provide accurate, current, and complete information during registration. You are responsible for maintaining the security of your account credentials. You must immediately notify us of any unauthorized use of your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Subscription & Billing</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Subscriptions are billed monthly on the anniversary of your signup date.</li>
              <li>All plans begin with a 3-day free trial period. Payment details are collected securely by Stripe, and no charge is made during the trial.</li>
              <li>You may cancel your subscription at any time. Access continues through the end of the current billing period.</li>
              <li>Plan features and pricing are subject to change with 30 days notice to active subscribers.</li>
              <li>Refunds are issued on a case-by-case basis at our sole discretion.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Acceptable Use</h2>
            <p className="mb-3">You agree NOT to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Use the Service for any unlawful purpose or in violation of applicable laws</li>
              <li>Scrape, harvest, or systematically extract data from the platform beyond normal use</li>
              <li>Share, resell, or redistribute lead data to third parties</li>
              <li>Attempt to gain unauthorized access to other users' accounts or data</li>
              <li>Use automated bots, scripts, or tools to access the Service without authorization</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Accuracy</h2>
            <p>Carrier data is sourced from public FMCSA records and other publicly available sources. While we make reasonable efforts to ensure accuracy, we do not guarantee that all information is current, complete, or error-free. You are responsible for verifying information before making business decisions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Intellectual Property</h2>
            <p>The Service, including its design, code, and proprietary data analysis algorithms, is owned by MyTruckingLeads LLC. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose during your active subscription.</p>
          </section>

          <section id="communication-compliance">
            <h2 className="text-lg font-semibold text-white mb-3">8. Communication Compliance Policy</h2>
            <p className="mb-3">By using our Service to contact carriers, you agree to comply with all applicable federal and state laws, including:</p>
            <div className="space-y-4 bg-navy-900/50 p-4 rounded-xl border border-white/5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Telephone Consumer Protection Act (TCPA)</h3>
                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                  <li>You must obtain prior express consent before making telemarketing calls or sending texts to wireless numbers</li>
                  <li>You must honor all opt-out and do-not-call requests immediately</li>
                  <li>Calls must be made only between 8 AM and 9 PM in the recipient's time zone</li>
                  <li>You must identify yourself and your agency at the beginning of each call</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">CAN-SPAM Act</h3>
                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                  <li>All commercial emails must include your physical business address</li>
                  <li>You must provide a clear and functioning unsubscribe mechanism</li>
                  <li>Opt-out requests must be honored within 10 business days</li>
                  <li>Subject lines must not be deceptive or misleading</li>
                  <li>You must clearly identify the message as an advertisement</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">National Do Not Call Registry</h3>
                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                  <li>You must scrub your call lists against the National DNC Registry at least every 31 days</li>
                  <li>You must maintain your own internal Do Not Call list</li>
                  <li>Do Not Call requests must be honored for a minimum of 5 years</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">SMS/Text Messaging Compliance</h3>
                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                  <li>You must obtain explicit written consent before sending any promotional text messages</li>
                  <li>All text messages must include opt-out instructions (e.g., "Reply STOP to unsubscribe")</li>
                  <li>STOP requests must be processed immediately and automatically</li>
                  <li>You must comply with carrier-specific messaging guidelines and throughput limits</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-navy-400">Violation of these communication compliance terms may result in immediate account termination without refund. MyTruckingLeads LLC is not liable for any fines, penalties, or legal actions resulting from your non-compliance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, MyTruckingLeads LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at any time for violation of these Terms, including communication compliance violations. Upon termination, your right to access the Service ceases immediately.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles. Any disputes shall be resolved in the courts located in Harris County, Texas.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">12. Contact</h2>
            <p>For questions about these Terms, contact us at: <a href="mailto:mytruckingleads@gmail.com" className="text-brand-400">mytruckingleads@gmail.com</a></p>
          </section>
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
