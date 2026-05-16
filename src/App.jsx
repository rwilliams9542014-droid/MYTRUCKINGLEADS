import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import InsuranceLeads from "./pages/InsuranceLeads";
import Pricing from "./pages/Pricing";
import Search from "./pages/Search";
import CarrierDossier from "./pages/CarrierDossier";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<InsuranceLeads />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/search" element={<Search />} />
        <Route path="/carrier/:id" element={<CarrierDossier />} />
      </Routes>
    </BrowserRouter>
  );
}