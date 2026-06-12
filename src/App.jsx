import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AppLayout } from "@/layouts/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Spinner } from "@/components/ui";
import { logGoogleAdsTagLoaded } from "@/lib/googleAds";

const HomePage = lazy(() => import("@/pages/public/HomePage"));
const PricingPage = lazy(() => import("@/pages/public/PricingPage"));
const LoginPage = lazy(() => import("@/pages/public/LoginPage"));
const SignupPage = lazy(() => import("@/pages/public/SignupPage"));
const QuoteRequestPage = lazy(() => import("@/pages/public/QuoteRequestPage"));
const TermsPage = lazy(() => import("@/pages/public/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/public/PrivacyPage"));
const SubscriptionAgreementPage = lazy(() => import("@/pages/public/SubscriptionAgreementPage"));
const DashboardPage = lazy(() => import("@/pages/app/DashboardPage"));
const LeadDeskPage = lazy(() => import("@/pages/app/LeadDeskPage"));
const CrmPage = lazy(() => import("@/pages/app/CrmPage"));
const CarrierSearchPage = lazy(() => import("@/pages/app/CarrierSearchPage"));
const CarrierProfilePage = lazy(() => import("@/pages/app/CarrierProfilePage"));
const SettingsPage = lazy(() => import("@/pages/app/SettingsPage"));
const AdminPage = lazy(() => import("@/pages/app/AdminPage"));
const LeadMarketplacePage = lazy(() => import("@/pages/app/LeadMarketplacePage"));

function HtmlRedirect({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search || ""}`} replace />;
}

function CarrierProfileRedirect() {
  const location = useLocation();
  const dot = new URLSearchParams(location.search).get("dot");
  return <Navigate to={dot ? `/carrier-profile/${encodeURIComponent(dot)}` : "/carrier-search"} replace />;
}

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    logGoogleAdsTagLoaded();
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/quote-request" element={<QuoteRequestPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/subscription-agreement" element={<SubscriptionAgreementPage />} />
            <Route path="/login.html" element={<HtmlRedirect to="/login" />} />
            <Route path="/signup.html" element={<HtmlRedirect to="/signup" />} />
            <Route path="/pricing.html" element={<HtmlRedirect to="/pricing" />} />
            <Route path="/quote-request.html" element={<HtmlRedirect to="/quote-request" />} />
            <Route path="/terms.html" element={<HtmlRedirect to="/terms" />} />
            <Route path="/privacy.html" element={<HtmlRedirect to="/privacy" />} />
            <Route path="/subscription-agreement.html" element={<HtmlRedirect to="/subscription-agreement" />} />
          </Route>

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/lead-desk" element={<LeadDeskPage />} />
            <Route path="/dot-analytics" element={<CarrierSearchPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/carrier-search" element={<CarrierSearchPage />} />
            <Route path="/carrier-profile" element={<CarrierProfilePage />} />
            <Route path="/carrier-profile/:id" element={<CarrierProfilePage />} />
            <Route path="/carrier/:id" element={<CarrierProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/lead-marketplace" element={<LeadMarketplacePage />} />
            <Route path="/app/dashboard" element={<HtmlRedirect to="/dashboard" />} />
            <Route path="/app/lead-desk" element={<HtmlRedirect to="/lead-desk" />} />
            <Route path="/app/crm" element={<HtmlRedirect to="/crm" />} />
            <Route path="/app/carrier-search" element={<HtmlRedirect to="/carrier-search" />} />
            <Route path="/app/carrier/:id" element={<CarrierProfilePage />} />
            <Route path="/app/settings" element={<HtmlRedirect to="/settings" />} />
            <Route path="/app/admin" element={<HtmlRedirect to="/admin" />} />
            <Route path="/user-dashboard.html" element={<HtmlRedirect to="/dashboard" />} />
            <Route path="/lead-desk.html" element={<HtmlRedirect to="/lead-desk" />} />
            <Route path="/dot-analytics.html" element={<HtmlRedirect to="/dot-analytics" />} />
            <Route path="/crm.html" element={<HtmlRedirect to="/crm" />} />
            <Route path="/admin.html" element={<HtmlRedirect to="/admin" />} />
            <Route path="/settings.html" element={<HtmlRedirect to="/settings" />} />
            <Route path="/lead-marketplace.html" element={<HtmlRedirect to="/lead-marketplace" />} />
            <Route path="/carrier-profile.html" element={<CarrierProfileRedirect />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
