import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: "Lead Desk",
    path: "/lead-desk",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    label: "CRM Pipeline",
    path: "/crm",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    label: "Carrier Search",
    path: "/carrier-search",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    label: "Marketplace",
    path: "/lead-marketplace",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7h18M5 7l1 12h12l1-12M9 7V5a3 3 0 016 0v2" />
      </svg>
    ),
  },
  {
    label: "Settings",
    path: "/settings",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const showAdmin =
    user?.isOwner ||
    user?.role === "owner" ||
    user?.role === "admin" ||
    user?.email === "owner@mytruckingleads.com";

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="min-h-screen premium-shell app-shell-background flex text-white">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300 border-r border-cyan-300/10 bg-[#03101f]/88 backdrop-blur-2xl shadow-[18px_0_70px_rgba(0,0,0,0.32)] ${
          collapsed ? "w-20" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Professional Header Logo Section */}
        <div className="h-20 px-4 flex items-center border-b border-cyan-300/10">
          <Link
            to="/dashboard"
            className={`flex w-full items-center transition-all duration-200 ${
              collapsed ? "justify-center" : "justify-start"
            }`}
          >
            {collapsed ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-100 shadow-[0_0_22px_rgba(56,189,248,0.22)]">
                MTL
              </span>
            ) : (
              <img
                src="/assets/homepage-logo-floating.png"
                alt="MyTruckingLeads"
                className="h-14 w-full max-w-[210px] object-contain object-left drop-shadow-[0_0_18px_rgba(56,189,248,0.28)]"
              />
            )}
          </Link>
        </div>

        {/* Sidebar Menu Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-brand-500/15 text-cyan-100 border border-cyan-300/25 shadow-[0_0_24px_rgba(20,124,255,0.16)]"
                    : "text-navy-300 hover:text-white hover:bg-cyan-300/[0.06] hover:border-cyan-300/10 border border-transparent"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && item.label}
              </Link>
            );
          })}

          {showAdmin && (
            <>
              <div className="my-3 border-t border-cyan-300/10" />
              <Link
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  location.pathname === "/admin"
                    ? "bg-danger-500/10 text-danger-300 border border-danger-500/20"
                    : "text-navy-300 hover:text-white hover:bg-cyan-300/[0.06] border border-transparent"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? "Admin" : undefined}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {!collapsed && "Owner Panel"}
              </Link>
            </>
          )}
        </nav>

        {/* User Account Info Section */}
        <div className={`p-4 border-t border-cyan-300/10 ${collapsed ? "text-center" : ""}`}>
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-sm font-bold">
                {user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`text-navy-400 hover:text-white text-sm transition-colors ${
              collapsed ? "mx-auto" : "w-full text-left"
            }`}
          >
            {collapsed ? (
              <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            ) : (
              "Sign Out"
            )}
          </button>
        </div>

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-8 w-6 h-6 bg-navy-800 border border-white/10 rounded-full items-center justify-center text-navy-400 hover:text-white transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-[#020817]/82 backdrop-blur-xl border-b border-cyan-300/10 flex items-center px-6">
          <button
            className="lg:hidden mr-4 text-white"
            onClick={() => setMobileOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
