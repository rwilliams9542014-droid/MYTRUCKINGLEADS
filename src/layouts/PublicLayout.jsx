import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}
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
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen premium-shell public-shell-background">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#020817]/82 backdrop-blur-xl border-b border-cyan-300/10 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
            : "bg-transparent py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}>
            <img
              src="/assets/homepage-logo-floating.png"
              alt="MyTruckingLeads"
              className="h-12 w-auto max-w-[280px] object-contain drop-shadow-[0_0_24px_rgba(56,189,248,0.32)]"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8 rounded-full border border-cyan-300/10 bg-white/[0.025] px-5 py-2 backdrop-blur-xl">
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/quote-request">Truckers: Get a Quote</NavLink>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link to="/dashboard" className="btn-primary text-sm">
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
          <div className="md:hidden absolute top-full left-0 right-0 bg-[#03101f]/95 backdrop-blur-xl border-b border-cyan-300/10 p-6 animate-slide-up">
            <nav className="flex flex-col gap-4">
              <Link to="/pricing" className="text-white font-medium" onClick={() => setMobileOpen(false)}>Pricing</Link>
              <Link to="/quote-request" className="text-white font-medium" onClick={() => setMobileOpen(false)}>Truckers: Get a Quote</Link>
              <hr className="border-white/10" />
              {user ? (
                <Link to="/dashboard" className="btn-primary text-center" onClick={() => setMobileOpen(false)}>Dashboard</Link>
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

      <footer className="border-t border-cyan-300/10 py-12 mt-20 bg-black/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img
                  src="/assets/homepage-logo-floating.png"
                  alt="MyTruckingLeads"
                  className="h-10 w-auto max-w-[250px] object-contain drop-shadow-[0_0_18px_rgba(56,189,248,0.24)]"
                />
              </div>
              <p className="text-sm text-navy-400 leading-relaxed">
                The #1 platform for commercial insurance agents to find and close trucking leads.
              </p>
              <a href="https://www.facebook.com/profile.php?id=61589438890622" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 text-sm text-navy-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Follow us on Facebook
              </a>
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
                <Link to="/quote-request" className="text-sm text-navy-400 hover:text-white transition-colors">Get Truck Insurance Quotes</Link>
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
