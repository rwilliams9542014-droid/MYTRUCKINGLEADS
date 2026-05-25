import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.106.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FMCSA_WEBKEY = Deno.env.get("FMCSA_WEBKEY") || "";
const CENSUS_BASE = "https://data.transportation.gov/resource/az4n-8mr2.json";
const QCMOBILE_BASE = "https://mobile.fmcsa.dot.gov/qc/services/carriers";

interface SearchParams {
  type: "dot" | "name" | "mc";
  query: string;
  state?: string;
  limit?: number;
}

async function searchByDOT(dot: string) {
  const urls = [
    `${QCMOBILE_BASE}/${dot}?webKey=${FMCSA_WEBKEY}`,
    `${CENSUS_BASE}?$where=dot_number=${dot}`,
  ];

  const results = await Promise.allSettled(
    urls.map((url) => fetch(url, { signal: AbortSignal.timeout(15000) }))
  );

  let carrier = null;

  // Try QCMobile first
  if (results[0].status === "fulfilled" && results[0].value.ok) {
    const data = await results[0].value.json();
    if (data?.content?.carrier) {
      const c = data.content.carrier;
      carrier = {
        dot_number: c.dotNumber?.toString() || dot,
        legal_name: c.legalName || "",
        dba_name: c.dbaName || "",
        carrier_operation: c.carrierOperation?.carrierOperationDesc || "",
        phone: c.phyPhone || "",
        city: c.phyCity || "",
        state: c.phyState || "",
        zip: c.phyZipcode || "",
        address: c.phyStreet || "",
        mc_number: c.mcNumber || "",
        vehicle_count: c.totalPowerUnits || 0,
        driver_count: c.totalDrivers || 0,
        operating_status: c.allowedToOperate === "Y" ? "AUTHORIZED" : "NOT AUTHORIZED",
        safety_rating: c.safetyRating || "None",
        cargo_carried: c.cargoCarried?.map((cc: any) => cc.cargoClassDesc) || [],
        source: "qcmobile",
      };
    }
  }

  // Fallback to Census
  if (!carrier && results[1].status === "fulfilled" && results[1].value.ok) {
    const data = await results[1].value.json();
    if (data?.length > 0) {
      const c = data[0];
      carrier = {
        dot_number: c.dot_number?.toString() || dot,
        legal_name: c.legal_name || "",
        dba_name: c.dba_name || "",
        carrier_operation: c.carrier_operation || "",
        phone: c.telephone || "",
        city: c.phy_city || "",
        state: c.phy_state || "",
        zip: c.phy_zip || "",
        address: c.phy_street || "",
        mc_number: c.mc_mx_ff_number || "",
        vehicle_count: parseInt(c.total_power_units) || 0,
        driver_count: parseInt(c.total_drivers) || 0,
        operating_status: c.entity_status_desc || "UNKNOWN",
        safety_rating: "None",
        cargo_carried: [],
        source: "census",
      };
    }
  }

  return carrier ? [carrier] : [];
}

async function searchByName(name: string, state?: string, limit = 25) {
  let where = `upper(legal_name) LIKE upper('%25${encodeURIComponent(name)}%25')`;
  if (state) where += ` AND phy_state='${state}'`;

  const url = `${CENSUS_BASE}?$where=${where}&$limit=${limit}&$order=mcs150_form_date DESC`;

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return [];

  const data = await res.json();
  return data.map((c: any) => ({
    dot_number: c.dot_number?.toString() || "",
    legal_name: c.legal_name || "",
    dba_name: c.dba_name || "",
    carrier_operation: c.carrier_operation || "",
    phone: c.telephone || "",
    city: c.phy_city || "",
    state: c.phy_state || "",
    zip: c.phy_zip || "",
    address: c.phy_street || "",
    mc_number: c.mc_mx_ff_number || "",
    vehicle_count: parseInt(c.total_power_units) || 0,
    driver_count: parseInt(c.total_drivers) || 0,
    operating_status: c.entity_status_desc || "UNKNOWN",
    safety_rating: "None",
    cargo_carried: [],
    source: "census",
  }));
}

async function searchByMC(mc: string) {
  const cleanMC = mc.replace(/[^0-9]/g, "");
  const url = `${CENSUS_BASE}?$where=mc_mx_ff_number='${cleanMC}'&$limit=10`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];

  const data = await res.json();
  return data.map((c: any) => ({
    dot_number: c.dot_number?.toString() || "",
    legal_name: c.legal_name || "",
    dba_name: c.dba_name || "",
    carrier_operation: c.carrier_operation || "",
    phone: c.telephone || "",
    city: c.phy_city || "",
    state: c.phy_state || "",
    zip: c.phy_zip || "",
    address: c.phy_street || "",
    mc_number: c.mc_mx_ff_number || "",
    vehicle_count: parseInt(c.total_power_units) || 0,
    driver_count: parseInt(c.total_drivers) || 0,
    operating_status: c.entity_status_desc || "UNKNOWN",
    safety_rating: "None",
    cargo_carried: [],
    source: "census",
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "name") as SearchParams["type"];
    const query = url.searchParams.get("query") || "";
    const state = url.searchParams.get("state") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "25");

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let results: any[] = [];

    switch (type) {
      case "dot":
        results = await searchByDOT(query.replace(/[^0-9]/g, ""));
        break;
      case "mc":
        results = await searchByMC(query);
        break;
      case "name":
      default:
        results = await searchByName(query, state, limit);
        break;
    }

    return new Response(
      JSON.stringify({ results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Search failed", message: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
