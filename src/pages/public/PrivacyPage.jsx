import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-28 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-navy-400 mt-2 text-sm">Last updated: May 25, 2026</p>
        </div>

        <div className="glass-card p-8 space-y-8 text-sm text-navy-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>MyTruckingLeads LLC ("we", "us", "our") respects your privacy and is committed to protecting your personal information. This Privacy Policy describes how we collect, use, disclose, and safeguard information when you use our carrier intelligence platform and related services.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Account Information</h3>
                <p>When you create an account, we collect your name, email address, agency name, phone number, and selected subscription plan.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Usage Data</h3>
                <p>We automatically collect information about how you interact with the Service, including pages viewed, searches performed, leads accessed, and features used.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Payment Information</h3>
                <p>Payment processing is handled by Stripe. We do not store your full credit card number. Stripe's privacy policy governs the handling of your payment data.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Carrier Data</h3>
                <p>The carrier information displayed on our platform is sourced from publicly available FMCSA records, government databases, and other public sources. This data includes business names, DOT numbers, addresses, phone numbers, fleet sizes, and safety records.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To provide, maintain, and improve the Service</li>
              <li>To process your subscription payments</li>
              <li>To send you service-related communications (account alerts, billing notices)</li>
              <li>To enforce our Terms of Service and protect against fraud</li>
              <li>To analyze usage patterns and improve the user experience</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Information Sharing</h2>
            <p className="mb-3">We do NOT sell your personal information. We may share information with:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">Service Providers:</strong> Stripe (payments), database, email, analytics, and hosting providers necessary to operate the Service</li>
              <li><strong className="text-white">Legal Requirements:</strong> When required by law, subpoena, or to protect our rights</li>
              <li><strong className="text-white">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
            <p>We implement industry-standard security measures to protect your data, including encryption in transit (TLS/SSL), encrypted storage, access controls, and regular security audits. However, no system is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Upon account deletion, we will remove your personal information within 30 days, except where retention is required by law or for legitimate business purposes (e.g., billing records, fraud prevention).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data ("right to be forgotten")</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
              <li>Withdraw consent where applicable</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:privacy@mytruckingleads.com" className="text-brand-400">privacy@mytruckingleads.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Carrier Data Opt-Out</h2>
            <p>If you are a carrier or trucking company and wish to have your information removed from our platform, please contact us at <a href="mailto:privacy@mytruckingleads.com" className="text-brand-400">privacy@mytruckingleads.com</a> with your DOT number and company name. We will process removal requests within 10 business days. Note that public FMCSA records remain accessible through government channels.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Cookies & Tracking</h2>
            <p>We use essential cookies for authentication and session management. We use analytics tools to understand Service usage. You can control cookie preferences through your browser settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Children's Privacy</h2>
            <p>The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from children.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or through the Service. Your continued use after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">12. Contact Us</h2>
            <p>
              MyTruckingLeads LLC<br />
              Email: <a href="mailto:privacy@mytruckingleads.com" className="text-brand-400">privacy@mytruckingleads.com</a><br />
              For data requests: <a href="mailto:privacy@mytruckingleads.com" className="text-brand-400">privacy@mytruckingleads.com</a>
            </p>
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
