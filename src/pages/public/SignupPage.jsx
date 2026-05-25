import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button, Input } from "@/components/ui";

const plans = [
  { value: "starter", label: "Starter - $79/mo" },
  { value: "pro", label: "Pro - $199/mo (Most Popular)" },
  { value: "agency", label: "Agency - $499/mo" },
];

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    agencyName: "",
    plan: "pro",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(form.email, form.password, {
        full_name: form.fullName,
        agency_name: form.agencyName,
        plan: form.plan,
      });
      navigate("/app/dashboard");
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

          <Input
            label="Password"
            type="password"
            placeholder="Minimum 6 characters"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-navy-200 mb-2">Select Plan</label>
            <select
              className="input-field"
              value={form.plan}
              onChange={(e) => updateField("plan", e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.value} value={p.value} className="bg-navy-900">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Create Account
          </Button>

          <p className="text-xs text-navy-500 text-center">
            By signing up, you agree to our{" "}
            <Link to="/terms" className="text-navy-300 underline">Terms of Service</Link> and{" "}
            <Link to="/privacy" className="text-navy-300 underline">Privacy Policy</Link>.
          </p>
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
