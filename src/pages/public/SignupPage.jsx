import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button, Input } from "@/components/ui";

const plans = [
  { value: "pro", label: "Producer Pro", price: 149.99, trialDays: 3, stateLimit: 50, description: "One included state, focused lead windows, and scalable add-ons." },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

export default function SignupPage() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    agencyName: "",
    email: "",
    phone: "",
    billingAddressLine1: "",
    billingAddressLine2: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
    username: "",
    password: "",
    plan: "pro",
    states: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedSubscription, setAgreedSubscription] = useState(false);
  const [agreedCompliance, setAgreedCompliance] = useState(false);
  const [trialStartTime] = useState(() => Date.now());

  const currentPlan = plans.find((p) => p.value === form.plan);
  const stateLimit = currentPlan?.stateLimit || 1;
  const additionalStateCount = Math.max(form.states.length - 1, 0);
  const monthlyTotal = currentPlan ? currentPlan.price + additionalStateCount * 49.99 : 0;
  const firstBillingDate = currentPlan
    ? new Date(trialStartTime + currentPlan.trialDays * 24 * 60 * 60 * 1000).toLocaleDateString()
    : "";

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function selectPlan(plan) {
    setForm((prev) => ({ ...prev, plan, states: [] }));
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

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Enter your first and last name.");
      return;
    }
    if (!form.agencyName.trim()) {
      setError("Enter your agency name.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    if (!form.billingAddressLine1 || !form.billingCity || !form.billingState || !form.billingPostalCode) {
      setError("Enter your address.");
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
    if (!currentPlan) {
      setError("Plan billing details are unavailable. Please try again.");
      return;
    }
    if (form.states.length === 0) {
      setError("Please select at least one state for your lead territory.");
      return;
    }
    if (!agreedSubscription) {
      setError("You must accept the subscription terms before continuing.");
      return;
    }
    if (!agreedCompliance) {
      setError("You must agree to the Communication Compliance terms.");
      return;
    }

    setLoading(true);
    try {
      const result = await signUp({
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.email,
        phone: form.phone,
        password: form.password,
        businessName: form.agencyName,
        plan: form.plan,
        leadState: form.states[0],
        leadStates: form.states,
        billingAddressLine1: form.billingAddressLine1,
        billingAddressLine2: form.billingAddressLine2,
        billingCity: form.billingCity,
        billingState: form.billingState,
        billingPostalCode: form.billingPostalCode,
        billingCountry: "US",
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedSubscriptionAgreement: true,
      });

      if (result?.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setError("Stripe checkout could not be started. Please try again.");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-6 pt-24 pb-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex justify-center mb-5">
            <img
              src="/assets/homepage-logo-floating.png"
              alt="MyTruckingLeads"
              className="h-16 w-auto max-w-[320px] object-contain drop-shadow-[0_0_26px_rgba(56,189,248,0.34)]"
            />
          </Link>
          <h1 className="text-2xl font-bold text-white">Start your free trial</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-navy-400">
            Create your login, choose your lead territory, then complete secure Stripe checkout. Your account is activated only after Stripe confirms the trial.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 sm:p-8">
          {error && (
            <div className="mb-6 rounded-xl border border-danger-500/20 bg-danger-500/10 p-3 text-sm text-danger-300">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Contact</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Your agency details</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="First Name" value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} required />
                  <Input label="Last Name" value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} required />
                  <Input label="Agency Name" value={form.agencyName} onChange={(e) => updateField("agencyName", e.target.value)} required />
                  <Input label="Phone Number" type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required />
                </div>
                <Input label="Email" type="email" placeholder="you@agency.com" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
              </section>

              <section className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Address</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Business address</h2>
                </div>
                <Input label="Street Address" value={form.billingAddressLine1} onChange={(e) => updateField("billingAddressLine1", e.target.value)} required />
                <Input label="Apartment, Suite, or Unit" value={form.billingAddressLine2} onChange={(e) => updateField("billingAddressLine2", e.target.value)} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Input label="City" value={form.billingCity} onChange={(e) => updateField("billingCity", e.target.value)} required />
                  <div>
                    <label className="block text-sm font-medium text-navy-200 mb-2">State</label>
                    <select className="input-field" value={form.billingState} onChange={(e) => updateField("billingState", e.target.value)} required>
                      <option value="" className="bg-navy-900">Select</option>
                      {US_STATES.map((state) => <option key={state} value={state} className="bg-navy-900">{state}</option>)}
                    </select>
                  </div>
                  <Input label="ZIP" value={form.billingPostalCode} onChange={(e) => updateField("billingPostalCode", e.target.value)} required />
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Login</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Choose your credentials</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Username" value={form.username} onChange={(e) => updateField("username", e.target.value)} required />
                  <Input label="Password" type="password" placeholder="8+ chars, uppercase, number" value={form.password} onChange={(e) => updateField("password", e.target.value)} required />
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Lead Territory</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Select your lead state territory
                  </h2>
                </div>
                <div className="grid max-h-44 grid-cols-5 gap-1.5 overflow-y-auto rounded-xl border border-white/5 bg-navy-900/50 p-3 sm:grid-cols-10">
                  {US_STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                        form.states.includes(state)
                          ? "bg-brand-500 text-white shadow-sm"
                          : "bg-navy-800 text-navy-400 hover:bg-navy-700 hover:text-white"
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-brand-400">
                  {form.states.length ? `Selected: ${form.states.join(", ")}. First state included, ${additionalStateCount} additional.` : "No lead state selected yet."}
                </p>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-white/10 bg-navy-950/50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Plan</p>
                <div className="mt-4 space-y-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.value}
                      type="button"
                      onClick={() => selectPlan(plan.value)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        form.plan === plan.value
                          ? "border-brand-400 bg-brand-500/15 shadow-[0_0_22px_rgba(20,124,255,0.16)]"
                          : "border-white/10 bg-white/[0.03] hover:border-brand-400/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{plan.label}</p>
                          <p className="mt-1 text-xs text-navy-400">{plan.description}</p>
                        </div>
                    <p className="text-sm font-bold text-white">${plan.price.toFixed(2)}/mo</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {currentPlan && (
                <section className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-5">
                  <p className="text-sm font-semibold text-white">Trial summary</p>
                  <div className="mt-3 space-y-2 text-xs leading-relaxed text-navy-200">
                    <p><span className="text-white">Selected plan:</span> {currentPlan.label}</p>
                    <p><span className="text-white">Free trial:</span> {currentPlan.trialDays} days</p>
                    <p><span className="text-white">After trial:</span> ${monthlyTotal.toFixed(2)}/month</p>
                    <p><span className="text-white">Included state:</span> 1</p>
                    <p><span className="text-white">Additional states:</span> {additionalStateCount} x $49.99/month</p>
                    <p><span className="text-white">Additional users:</span> $19.99/month each after signup</p>
                    <p><span className="text-white">Trial limits:</span> 10 Lead Desk exports/day, renewals 15 days out, New DOT leads 15 days back</p>
                    <p><span className="text-white">First billing date:</span> {firstBillingDate}</p>
                    <p>Stripe securely collects payment details. You can cancel before the trial ends to avoid future charges.</p>
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-2xl border border-white/10 bg-navy-950/50 p-5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreedSubscription}
                    onChange={(e) => setAgreedSubscription(e.target.checked)}
                    className="mt-0.5 rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30"
                  />
                  <span className="text-xs text-navy-300">
                    I agree to the{" "}
                    <Link to="/terms" className="text-brand-400 underline" target="_blank">Terms</Link>,{" "}
                    <Link to="/privacy" className="text-brand-400 underline" target="_blank">Privacy Policy</Link>, and{" "}
                    <Link to="/subscription-agreement" className="text-brand-400 underline" target="_blank">Subscription Agreement</Link>.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreedCompliance}
                    onChange={(e) => setAgreedCompliance(e.target.checked)}
                    className="mt-0.5 rounded border-navy-600 bg-navy-800 text-brand-500 focus:ring-brand-500/30"
                  />
                  <span className="text-xs text-navy-300">
                    I agree to follow TCPA, CAN-SPAM, Do Not Call, and opt-out requirements when contacting leads.
                  </span>
                </label>
              </section>

              <Button type="submit" loading={loading} className="w-full" disabled={!agreedSubscription || !agreedCompliance || !currentPlan}>
                Continue to Stripe
              </Button>
            </aside>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-navy-400">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
