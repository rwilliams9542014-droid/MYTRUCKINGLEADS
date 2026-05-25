import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AppLayout } from "@/layouts/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Spinner } from "@/components/ui";

const HomePage = lazy(() => import("@/pages/public/HomePage"));
const PricingPage = lazy(() => import("@/pages/public/PricingPage"));
const LoginPage = lazy(() => import("@/pages/public/LoginPage"));
const SignupPage = lazy(() => import("@/pages/public/SignupPage"));
const QuoteRequestPage = lazy(() => import("@/pages/public/QuoteRequestPage"));
const DashboardPage = lazy(() => import("@/pages/app/DashboardPage"));
const LeadDeskPage = lazy(() => import("@/pages/app/LeadDeskPage"));
const CrmPage = lazy(() => import("@/pages/app/CrmPage"));
const CarrierSearchPage = lazy(() => import("@/pages/app/CarrierSearchPage"));
const CarrierProfilePage = lazy(() => import("@/pages/app/CarrierProfilePage"));
const SettingsPage = lazy(() => import("@/pages/app/SettingsPage"));
const AdminPage = lazy(() => import("@/pages/app/AdminPage"));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function App() {
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
          </Route>

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="lead-desk" element={<LeadDeskPage />} />
            <Route path="crm" element={<CrmPage />} />
            <Route path="carrier-search" element={<CarrierSearchPage />} />
            <Route path="carrier/:id" element={<CarrierProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
