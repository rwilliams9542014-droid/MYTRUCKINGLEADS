import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!identifier || !password) {
      setError("Enter your username or email and password.");
      return;
    }
    setLoading(true);
    try {
      await login({ identifier, password });
      navigate(location.state?.redirect || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex justify-center mb-5">
            <img
              src="/assets/homepage-logo-floating.png"
              alt="MyTruckingLeads"
              className="h-16 w-auto max-w-[320px] object-contain drop-shadow-[0_0_26px_rgba(56,189,248,0.34)]"
            />
          </Link>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-navy-400 mt-2 text-sm">Sign in to your MyTruckingLeads account</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5">
          {error && (
            <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
              {error}
            </div>
          )}

          <Input
            label="Username or Email"
            type="text"
            placeholder="username or you@agency.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
          />

          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>

        </form>

        <p className="text-center text-sm text-navy-400 mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium">
            Start your free trial
          </Link>
        </p>
      </div>
    </div>
  );
}
