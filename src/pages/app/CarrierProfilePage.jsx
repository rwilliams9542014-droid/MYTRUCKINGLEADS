import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Card, Badge, Button } from "@/components/ui";
import { api } from "@/lib/api";

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function splitCargo(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCarrier(data) {
  const carrier = data?.carrier || data?.profile || data?.result || data || {};
  const addressParts = carrier.addressParts || carrier.address || {};
  const addressText = typeof carrier.address === "string"
    ? carrier.address
    : [addressParts.street, addressParts.city, addressParts.state, addressParts.zip].filter(Boolean).join(", ");
  const city = pick(carrier.city, addressParts.city, carrier.phy_city, carrier.hq_city);
  const state = pick(carrier.state, addressParts.state, carrier.phy_state, carrier.hq_state);
  const zip = pick(carrier.zip, addressParts.zip, carrier.phy_zip, carrier.hq_zip);
  const phone = pick(carrier.phone, carrier.phoneNumber, carrier.cellPhone, carrier.cell_phone);
  const email = pick(carrier.email, carrier.emailAddress);
  const dot = pick(carrier.dotNumber, carrier.dot_number, carrier.dot);
  const mc = pick(carrier.mcNumber, carrier.mc_number, carrier.mc, carrier.docketNumber);

  return {
    raw: carrier,
    dot,
    mc,
    name: pick(carrier.legalName, carrier.legal_name, carrier.carrierName, carrier.carrier_name, carrier.name),
    dbaName: pick(carrier.dbaName, carrier.dba_name),
    address: addressText || carrier.physicalAddress || carrier.mailingAddress,
    city,
    state,
    zip,
    phone,
    email,
    entityType: pick(carrier.entityType, carrier.entity_type, carrier.carrierOperation, carrier.carrier_operation),
    operatingStatus: pick(carrier.operatingStatus, carrier.operating_status, carrier.authorityStatus, carrier.authority_status, "Unknown"),
    safetyRating: pick(carrier.safetyRating, carrier.safety_rating, carrier.safety?.safetyRating, "Not rated"),
    mcNumber: mc ? (String(mc).startsWith("MC") ? mc : `MC-${mc}`) : "",
    mcs150Date: pick(carrier.mcs150Date, carrier.mcs150_date),
    addDate: pick(carrier.addDate, carrier.add_date, carrier.dateCreated),
    trucks: pick(carrier.vehicleCount, carrier.vehicle_count, carrier.fleetSize, carrier.powerUnits),
    drivers: pick(carrier.driverCount, carrier.driver_count, carrier.drivers),
    cargo: splitCargo(pick(carrier.cargoTypes, carrier.cargo, carrier.cargoHauled, carrier.cargo_hauled, carrier.cargoCarried)),
    insuranceCompany: pick(carrier.insuranceCompany, carrier.insurance_company, carrier.licensingInsurance?.insuranceCompany),
    insuranceExpiration: pick(carrier.insuranceExpiration, carrier.insuranceExpirationDate, carrier.insurance_expiration, carrier.licensingInsurance?.insuranceExpirationDate),
    insurancePolicyNumber: pick(carrier.insurancePolicyNumber, carrier.insurance_policy_number, carrier.licensingInsurance?.policyNumber),
    insuranceFilingStatus: pick(carrier.insuranceFilingStatus, carrier.licensingInsurance?.insuranceFilingStatus),
    totalInspections: pick(carrier.totalInspections, carrier.safety?.totalInspections),
    crashTotal: pick(carrier.crashTotal, carrier.safety?.crashTotal),
    companyRep: pick(carrier.companyRep, carrier.companyOfficer1, carrier.company_rep),
  };
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-navy-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-white mt-1">{value || "Not available from public FMCSA data."}</p>
    </div>
  );
}

export default function CarrierProfilePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const dot = id || searchParams.get("dot");
  const [carrier, setCarrier] = useState(null);
  const [loading, setLoading] = useState(Boolean(dot));
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (!dot) {
      setError("No DOT number was provided.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    api.getCarrierProfile(dot)
      .then((data) => {
        if (active) setCarrier(normalizeCarrier(data));
      })
      .catch((err) => {
        if (active) setError(err.message || "Carrier profile could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dot]);

  const contact = useMemo(() => ({
    name: carrier?.companyRep || carrier?.name || "Carrier contact",
    title: carrier?.companyRep ? "Company representative" : "Primary contact",
    phone: carrier?.phone,
    email: carrier?.email,
  }), [carrier]);

  async function saveToPipeline() {
    if (!carrier) return;
    setSaveStatus("Saving...");
    try {
      await api.addLead({
        carrier_name: carrier.name,
        dot_number: carrier.dot,
        mc_number: carrier.mc,
        state: carrier.state,
        status: "New",
        insurance_expiration: carrier.insuranceExpiration || null,
        notes: [
          carrier.state ? `State: ${carrier.state}` : "",
          carrier.phone ? `Phone: ${carrier.phone}` : "",
          carrier.email ? `Email: ${carrier.email}` : "",
          carrier.cargo.length ? `Cargo: ${carrier.cargo.join(", ")}` : "",
        ].filter(Boolean).join(" "),
      });
      setSaveStatus("Saved to CRM");
    } catch (err) {
      setSaveStatus(err.message || "Could not save carrier.");
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-navy-400">Loading carrier profile...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/carrier-search" className="text-brand-400 hover:text-brand-300 text-sm">Back to carrier search</Link>
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-4 text-sm text-danger-300">{error}</div>
      </div>
    );
  }

  if (!carrier) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/carrier-search" className="text-navy-400 hover:text-white transition-colors">Carrier Search</Link>
        <svg className="w-3 h-3 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-white">{carrier.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">{carrier.name}</h1>
            <Badge variant={String(carrier.operatingStatus).toUpperCase().includes("AUTHORIZED") ? "success" : "outline"}>
              {carrier.operatingStatus}
            </Badge>
          </div>
          {carrier.dbaName && <p className="text-sm text-navy-400 mb-1">DBA: {carrier.dbaName}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-400">
            {carrier.dot && <span className="font-mono">DOT {carrier.dot}</span>}
            {carrier.mcNumber && <span className="font-mono">{carrier.mcNumber}</span>}
            <span>{[carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", ")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {carrier.phone && <a href={`tel:${carrier.phone}`} className="btn-secondary text-sm px-4 py-2 rounded-xl border border-white/10">Call</a>}
          {carrier.email && <a href={`mailto:${carrier.email}`} className="btn-secondary text-sm px-4 py-2 rounded-xl border border-white/10">Email</a>}
          <Button size="sm" onClick={saveToPipeline}>+ Pipeline</Button>
        </div>
      </div>

      {saveStatus && (
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 text-sm text-brand-200">{saveStatus}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Contacts</h2>
            <div className="flex items-center justify-between p-4 bg-navy-800/30 rounded-xl">
              <div>
                <p className="text-sm font-medium text-white">{contact.name}</p>
                <p className="text-xs text-navy-400">{contact.title}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-navy-500">
                  {contact.phone && <span>{contact.phone}</span>}
                  {contact.email && <span>{contact.email}</span>}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Company Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem label="Legal Name" value={carrier.name} />
              <InfoItem label="DBA Name" value={carrier.dbaName} />
              <InfoItem label="Address" value={carrier.address || [carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", ")} />
              <InfoItem label="Entity / Operation" value={carrier.entityType} />
              <InfoItem label="Fleet Size" value={[carrier.trucks && `${carrier.trucks} trucks`, carrier.drivers && `${carrier.drivers} drivers`].filter(Boolean).join(", ")} />
              <InfoItem label="MCS-150 Updated" value={carrier.mcs150Date} />
              <InfoItem label="DOT Issued" value={carrier.addDate} />
              <InfoItem label="Safety Rating" value={carrier.safetyRating} />
              <InfoItem label="Inspections" value={carrier.totalInspections} />
              <InfoItem label="Crashes" value={carrier.crashTotal} />
            </div>
            {carrier.cargo.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-xs text-navy-500 uppercase tracking-wide mb-2">Cargo Carried</p>
                <div className="flex flex-wrap gap-2">
                  {carrier.cargo.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-brand-500/20">
            <h2 className="text-sm font-semibold text-white mb-3">Quick Contact</h2>
            <div className="space-y-2 text-sm">
              <p className="text-white">{contact.name}</p>
              {contact.phone && <a href={`tel:${contact.phone}`} className="block text-brand-400 hover:text-brand-300">{contact.phone}</a>}
              {contact.email && <a href={`mailto:${contact.email}`} className="block text-brand-400 hover:text-brand-300">{contact.email}</a>}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Insurance Filing</h2>
            <div className="space-y-3">
              <InfoItem label="Company" value={carrier.insuranceCompany} />
              <InfoItem label="Policy" value={carrier.insurancePolicyNumber} />
              <InfoItem label="Filing Status" value={carrier.insuranceFilingStatus} />
              <InfoItem label="Expiration" value={carrier.insuranceExpiration} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
