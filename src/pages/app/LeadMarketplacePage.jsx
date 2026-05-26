import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function normalizeLead(lead) {
  return {
    id: pick(lead.id, lead.leadId),
    company: pick(lead.company_name, lead.companyName, lead.carrier_name, lead.carrierName, "Carrier lead"),
    dot: pick(lead.dot_number, lead.dotNumber, lead.dot),
    state: pick(lead.state, lead.primary_state, lead.states_operated),
    contact: pick(lead.contact_name, lead.contactName),
    coverage: pick(lead.coverage_types_needed, lead.coverageTypesNeeded, lead.coverage_type),
    units: pick(lead.power_units, lead.powerUnits, lead.fleet_size),
    renewal: pick(lead.renewal_date, lead.renewalDate),
    status: pick(lead.status, "available"),
    price: pick(lead.price, lead.purchase_price),
  };
}

export default function LeadMarketplacePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getMarketplaceLeads({ limit: 100 })
      .then((data) => {
        const rows = data?.leads || data?.results || [];
        if (active) setLeads(rows.map(normalizeLead));
      })
      .catch((err) => {
        if (active) setError(err.message || "Marketplace leads could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function purchaseLead(lead) {
    if (!lead.id) return;
    setMessage("Processing purchase...");
    try {
      await api.purchaseMarketplaceLead(lead.id);
      setMessage("Lead purchase submitted.");
    } catch (err) {
      setMessage(err.message || "Lead could not be purchased.");
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Marketplace</h1>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Loading marketplace leads..." : `${leads.length} marketplace lead${leads.length === 1 ? "" : "s"} loaded`}
          </p>
        </div>
        <Link to="/quote-request" className="btn-secondary text-sm">Quote Request Page</Link>
      </div>

      {error && <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">{error}</div>}
      {message && <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">{message}</div>}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Company", "DOT", "State", "Coverage", "Fleet", "Renewal", "Status", "Action"].map((heading) => (
                  <th key={heading} className="text-left text-xs font-medium text-navy-400 uppercase px-6 py-4">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id || `${lead.company}-${lead.dot}`} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-6 py-3 text-sm font-medium text-white">{lead.company}</td>
                  <td className="px-6 py-3 text-sm text-navy-300 font-mono">{lead.dot || "-"}</td>
                  <td className="px-6 py-3 text-sm text-navy-300">{lead.state || "-"}</td>
                  <td className="px-6 py-3 text-sm text-navy-300">{lead.coverage || "Data unavailable."}</td>
                  <td className="px-6 py-3 text-sm text-navy-300">{lead.units || "-"}</td>
                  <td className="px-6 py-3 text-sm text-navy-300">{lead.renewal || "-"}</td>
                  <td className="px-6 py-3"><Badge variant="outline">{lead.status}</Badge></td>
                  <td className="px-6 py-3">
                    <Button size="sm" onClick={() => purchaseLead(lead)} disabled={!lead.id}>Purchase</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && leads.length === 0 && (
          <div className="text-center py-12">
            <p className="text-navy-400 text-sm">No records found.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
