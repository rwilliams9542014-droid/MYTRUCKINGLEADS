import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button, Input } from "@/components/ui";

const plans = [
  { value: "basic", label: "Starter - $79/mo", stateLimit: 1 },
  { value: "pro", label: "Pro - $199/mo (Most Popular)", stateLimit: 1 },
  { value: "premium", label: "Agency - $499/mo", stateLimit: 3 },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    username: "",
    phone: "",
    agencyName: "",
    plan: "pro",
    states: [],
    billingAddressLine1: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedCompliance, setAgreedCompliance] = useState(false);

  const currentPlan = plans.find((p) => p.value === form.plan);
  const stateLimit = currentPlan?.stateLimit || 1;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleState(state) {
    setForm((prev) => {
      const current = prev.states;
      if (current.includes(state)) {
        return { ...prev, states: current.filter((s) => s !== state) };
      }
      if (current.length >= stateLimit) {
        if (stateLimit === 1) return { ...prev, states: [state] };
        return prev;
      }
      return { ...prev, states: [...current, state] };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const nameParts = form.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      return;
    }
    if (!form.username.trim()) {
      setError("Choose a username.");
      return;
    }
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError("Password must be at least 8 characters and include one uppercase letter and one number.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    if (form.states.length === 0) {
      setError("Please select at least one state for your lead territory.");
      return;
    }
    if (!form.billingAddressLine1 || !form.billingCity || !form.billingState || !form.billingPostalCode) {
      setError("Enter your billing address so the account can be created.");
      return;
    }
    if (!agreedTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }
    if (!agreedCompliance) {
      setError("You must agree to the Communication Compliance terms.");
      return;
    }
    setLoading(true);
    try {
      const result = await signUp({
        firstName,
        lastName,
        username: form.username,
        email: form.email,
        phone: form.phone,
        password: form.password,
        businessName: form.agencyName,
        plan: form.plan,
        leadState: form.states[0],
        leadStates: form.states,
        billingAddressLine1: form.billingAddressLine1,
        billingCity: form.billingCity,
        billingState: form.billingState,
        billingPostalCode: form.billingPostalCode,
        billingCountry: "US",
      });
      if (result?.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex justify-center mb-5">
            <img
              src="/assets/homepage-logo-floating.png"
              alt="MyTruckingLeads"
              className="h-16 w-auto max-w-[320px] object-contain drop-shadow-[0_0_26px_rgba(56,189,248,0.34)]"
            />
          </Link>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-navy-400 mt-2 text-sm">Start your 3-day free trial. No credit card required.</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5">
          {error && (
            <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Smith"
              value={form.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
              required
            />
            <Input
              label="Agency Name"
              type="text"
              placeholder="Your Insurance Agency"
              value={form.agencyName}
              onChange={(e) => updateField("agencyName", e.target.value)}
            />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Username"
              type="text"
              placeholder="youragency"
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
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
            label="Password"
            type="password"
            placeholder="8+ chars, uppercase, number"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-navy-200 mb-2">Select Plan</label>
            <select
              className="input-field"
              value={form.plan}
              onChange={(e) => { updateField("plan", e.target.value); setForm((prev) => ({ ...prev, states: [] })); }}
            >
              {plans.map((p) => (
                <option key={p.value} value={p.value} className="bg-navy-900">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <Input
              label="Billing Address"
              type="text"
              placeholder="123 Main St"
              value={form.billingAddressLine1}
              onChange={(e) => updateField("billingAddressLine1", e.target.value)}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="City"
                type="text"
                placeholder="Dallas"
                value={form.billingCity}
                onChange={(e) => updateField("billingCity", e.target.value)}
                required
              />
              <div>
                <label className="block text-sm font-medium text-navy-200 mb-2">State</label>
                <select
                  className="input-field"
                  value={form.billingState}
                  onChange={(e) => updateField("billingState", e.target.value)}
                  required
                >
                  <option value="" className="bg-navy-900">State</option>
                  {US_STATES.map((state) => (
                    <option key={state} value={state} className="bg-navy-900">{state}</option>
                  ))}
                </select>
              </div>
              <Input
                label="ZIP"
                type="text"
                placeholder="75001"
                value={form.billingPostalCode}
                onChange={(e) => updateField("billingPostalCode", e.target.value)}
                required
              />
            </div>
          </div>

          {/* State Selection */}
          <div>
            <label className="block text-sm font-medium text-navy-200 mb-2">
              Lead Territory {stateLimit === 1 ? "(Select 1 state)" : `(Select up to ${stateLimit} states)`}
            </label>
            <p className="text-xs text-navy-500 mb-3">
              {stateLimit === 1
                ? "Your plan includes leads from one state. Upgrade to Agency for multi-state coverage."
                : "Agency plan: choose up to 3 states for your included lead territories. Extra states can be added for $49/month per state."
              }
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-40 overflow-y-auto p-3 bg-navy-900/50 rounded-xl border border-white/5">
              {US_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => toggleState(state)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    form.states.includes(state)
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-navy-800 text-navy-400 hover:bg-navy-700 hover:text-white"
                  }`}
                >
                  {state}
                </button>
              ))}
            </div>
            {form.states.length > 0 && (
              <p className="text-xs text-brand-400 mt-2">
                Selected: {form.states.join(", ")} ({form.states.length}/{stateLimit})
              </p>
            )}
          </div>

          {/* Legal Agreements */}
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30 mt-0.5"
              />
              <span className="text-xs text-navy-300">
                I agree to the{" "}
                <Link to="/terms" className="text-brand-400 underline" target="_blank">Terms of Service</Link> and{" "}
                <Link to="/privacy" className="text-brand-400 underline" target="_blank">Privacy Policy</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedCompliance}
                onChange={(e) => setAgreedCompliance(e.target.checked)}
                className="rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30 mt-0.5"
              />
              <span className="text-xs text-navy-300">
                I agree to comply with the <Link to="/terms#communication-compliance" className="text-brand-400 underline" target="_blank">Communication Compliance Policy</Link>,
                including TCPA regulations, CAN-SPAM Act, and the National Do Not Call Registry.
                I will not contact any individual or business that has opted out of communications.
              </span>
            </label>
          </div>

          <Button type="submit" loading={loading} className="w-full" disabled={!agreedTerms || !agreedCompliance}>
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-navy-400 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
