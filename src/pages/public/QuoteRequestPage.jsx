import { useState } from "react";
import { Button, Input, Badge } from "@/components/ui";
import { api } from "@/lib/api";

const states = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export default function QuoteRequestPage() {
  const [form, setForm] = useState({
    companyName: "",
    dotNumber: "",
    contactName: "",
    email: "",
    phone: "",
    state: "",
    fleetSize: "",
    coverageType: "auto_liability",
    currentInsuranceCompany: "",
    renewalDate: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.submitQuoteRequest({
        companyName: form.companyName,
        dotNumber: form.dotNumber || "",
        contactName: form.contactName,
        emailAddress: form.email,
        phoneNumber: form.phone,
        yearsInBusiness: "1",
        powerUnits: form.fleetSize ? Number.parseInt(form.fleetSize, 10) : 1,
        driverCount: form.fleetSize ? Number.parseInt(form.fleetSize, 10) : 1,
        cargoHauled: "General Freight",
        statesOperated: form.state,
        coverageTypesNeeded: form.coverageType.replace(/_/g, " "),
        currentInsuranceCompany: form.currentInsuranceCompany,
        renewalDate: form.renewalDate,
        coverageNeededWithin: "30 days",
        additionalComments: form.message || "",
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-accent-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Quote Request Submitted</h1>
          <p className="text-navy-300 leading-relaxed">
            A licensed commercial insurance agent will contact you within 24 hours with competitive quotes for your trucking operation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Badge variant="success" className="mb-4">For Trucking Companies</Badge>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Get Insurance Quotes from Top Agents
          </h1>
          <p className="text-lg text-navy-300 max-w-xl mx-auto">
            Fill out your details and get competitive commercial trucking insurance quotes from licensed agents in your area. Free, fast, no obligation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
          {error && (
            <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company Name"
              placeholder="Your Trucking Company"
              value={form.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              required
            />
            <Input
              label="DOT Number (if available)"
              placeholder="e.g. 1234567"
              value={form.dotNumber}
              onChange={(e) => updateField("dotNumber", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Name"
              placeholder="Your name"
              value={form.contactName}
              onChange={(e) => updateField("contactName", e.target.value)}
              required
            />
            <Input
              label="Phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              required
            />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">State</label>
              <select
                className="input-field"
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
                required
              >
                <option value="" className="bg-navy-900">Select state</option>
                {states.map((s) => (
                  <option key={s} value={s} className="bg-navy-900">{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Fleet Size</label>
              <select
                className="input-field"
                value={form.fleetSize}
                onChange={(e) => updateField("fleetSize", e.target.value)}
              >
                <option value="" className="bg-navy-900">Select</option>
                <option value="1" className="bg-navy-900">1 truck</option>
                <option value="3" className="bg-navy-900">2-5 trucks</option>
                <option value="10" className="bg-navy-900">6-15 trucks</option>
                <option value="25" className="bg-navy-900">16-50 trucks</option>
                <option value="75" className="bg-navy-900">50+ trucks</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Coverage Needed</label>
              <select
                className="input-field"
                value={form.coverageType}
                onChange={(e) => updateField("coverageType", e.target.value)}
              >
                <option value="auto_liability" className="bg-navy-900">Auto Liability</option>
                <option value="cargo" className="bg-navy-900">Cargo</option>
                <option value="physical_damage" className="bg-navy-900">Physical Damage</option>
                <option value="general_liability" className="bg-navy-900">General Liability</option>
                <option value="full_package" className="bg-navy-900">Full Package</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Current Insurance Company"
              placeholder="Current carrier or broker"
              value={form.currentInsuranceCompany}
              onChange={(e) => updateField("currentInsuranceCompany", e.target.value)}
              required
            />
            <Input
              label="Renewal Date"
              type="date"
              value={form.renewalDate}
              onChange={(e) => updateField("renewalDate", e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-200 mb-2">Additional Details (optional)</label>
            <textarea
              className="input-field min-h-[100px] resize-y"
              placeholder="Any specific coverage needs, current carrier info, or questions..."
              value={form.message}
              onChange={(e) => updateField("message", e.target.value)}
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Get My Free Quotes
          </Button>

          <p className="text-xs text-navy-500 text-center">
            Your information is shared only with licensed insurance agents. We never sell your data to third parties.
          </p>
        </form>
      </div>
    </div>
  );
}
