import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-colors duration-200 ${
        isActive ? "text-white" : "text-navy-300 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export function PublicLayout() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-navy-950/80 backdrop-blur-xl border-b border-white/5 py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/95 to-blue-50/90 p-1.5 shadow-lg shadow-brand-500/10 group-hover:scale-105 transition-transform">
              <img src="/assets/LOGO_BADGE-removebg-preview.png" alt="MTL" className="w-full h-full object-contain" />
            </div>
            <img src="/assets/NEW_IMPROVED_FULL_LOGO-removebg-preview.png" alt="MyTruckingLeads" className="h-9 object-contain hidden sm:block" style={{ filter: "brightness(1.6) saturate(1.2)" }} />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/quote-request">Get a Quote</NavLink>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link to="/app/dashboard" className="btn-primary text-sm">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-sm">
                  Sign In
                </Link>
                <Link to="/signup" className="btn-primary text-sm">
                  Start Free Trial
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-navy-900/95 backdrop-blur-xl border-b border-white/5 p-6 animate-slide-up">
            <nav className="flex flex-col gap-4">
              <Link to="/pricing" className="text-white font-medium" onClick={() => setMobileOpen(false)}>Pricing</Link>
              <Link to="/quote-request" className="text-white font-medium" onClick={() => setMobileOpen(false)}>Get a Quote</Link>
              <hr className="border-white/10" />
              {user ? (
                <Link to="/app/dashboard" className="btn-primary text-center" onClick={() => setMobileOpen(false)}>Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="text-white font-medium" onClick={() => setMobileOpen(false)}>Sign In</Link>
                  <Link to="/signup" className="btn-primary text-center" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-white/95 to-blue-50/90 p-1.5 shadow-md">
                  <img src="/assets/LOGO_BADGE-removebg-preview.png" alt="MTL" className="w-full h-full object-contain" />
                </div>
                <img src="/assets/NEW_IMPROVED_FULL_LOGO-removebg-preview.png" alt="MyTruckingLeads" className="h-7 object-contain" style={{ filter: "brightness(1.6) saturate(1.2)" }} />
              </div>
              <p className="text-sm text-navy-400 leading-relaxed">
                The #1 platform for commercial insurance agents to find and close trucking leads.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <div className="flex flex-col gap-2">
                <Link to="/pricing" className="text-sm text-navy-400 hover:text-white transition-colors">Pricing</Link>
                <Link to="/" className="text-sm text-navy-400 hover:text-white transition-colors">New DOT Leads</Link>
                <Link to="/" className="text-sm text-navy-400 hover:text-white transition-colors">Renewal Leads</Link>
                <Link to="/" className="text-sm text-navy-400 hover:text-white transition-colors">CRM Pipeline</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
              <div className="flex flex-col gap-2">
                <Link to="/privacy" className="text-sm text-navy-400 hover:text-white transition-colors">Privacy</Link>
                <Link to="/terms" className="text-sm text-navy-400 hover:text-white transition-colors">Terms</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">For Truckers</h4>
              <div className="flex flex-col gap-2">
                <Link to="/quote-request" className="text-sm text-navy-400 hover:text-white transition-colors">Get Insurance Quotes</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-sm text-navy-500">&copy; {new Date().getFullYear()} MyTruckingLeads. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
