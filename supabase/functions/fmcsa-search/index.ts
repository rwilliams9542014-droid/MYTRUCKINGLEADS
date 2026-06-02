const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const Deno = (globalThis as any).Deno;
// FIX: Retrieve the key by its name in your Supabase Secrets, 
// or provide the hardcoded value as the fallback.
const FMCSA_WEBKEY = Deno?.env?.get("FMCSA_WEBKEY") || "8faca05cc755c0ba6c57127120d0d0e16117f5323a";
const CENSUS_BASE = "https://data.transportation.gov/resource/az4n-8mr2.json";
const QCMOBILE_BASE = "https://mobile.fmcsa.dot.gov/qc/services/carriers";

/**
 * Helper to map QCMobile (Real-time) data to your app's carrier format
 */
function mapQCMobileToCarrier(c: any, query: string) {
  return {
    dot_number: c.dotNumber?.toString() || query,
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

/**
 * Helper to map Census (Snapshot) data to your app's carrier format
 */
function mapCensusToCarrier(c: any, query?: string) {
  return {
    dot_number: c.dot_number?.toString() || query || "",
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

/**
 * Combined search for DOT or MC that uses Web Key for real-time data
 */
async function searchRealTime(identifier: string, type: "dot" | "mc") {
  const endpoint = type === "dot" ? identifier : `mc/${identifier}`;
  const censusField = type === "dot" ? "dot_number" : "mc_mx_ff_number";
  
  const qcUrl = new URL(`${QCMOBILE_BASE}/${endpoint}`);
  qcUrl.searchParams.set("webKey", FMCSA_WEBKEY);

  const censusUrl = new URL(CENSUS_BASE);
  censusUrl.searchParams.set("$where", `${censusField}='${identifier}'`);

  const urls = [qcUrl.toString(), censusUrl.toString()];
  const results = await Promise.allSettled(
    urls.map((u) => fetch(u, { signal: AbortSignal.timeout(15000) }))
  );

  // 1. Try Real-time QCMobile API
  if (results[0].status === "fulfilled" && results[0].value.ok) {
    const data = await results[0].value.json();
    if (data?.content?.carrier) {
      return [mapQCMobileToCarrier(data.content.carrier, identifier)];
    }
  }

  // 2. Fallback to Census Snapshot
  if (results[1].status === "fulfilled" && results[1].value.ok) {
    const data = await results[1].value.json();
    if (data?.length > 0) {
      return [mapCensusToCarrier(data[0], identifier)];
    }
  }

  return [];
}

async function searchByName(name: string, state?: string, limit = 25) {
  const url = new URL(CENSUS_BASE);
  let where = `upper(legal_name) LIKE upper('%${name.replace(/'/g, "''")}%')`;
  if (state) where += ` AND phy_state='${state.toUpperCase().replace(/'/g, "''")}'`;

  url.searchParams.set("$where", where);
  url.searchParams.set("$limit", limit.toString());
  url.searchParams.set("$order", "add_date DESC");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((c: any) => mapCensusToCarrier(c));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "name") as "dot" | "name" | "mc";
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
        results = await searchRealTime(query.replace(/[^0-9]/g, ""), "dot");
        break;
      case "mc":
        results = await searchRealTime(query.replace(/[^0-9]/g, ""), "mc");
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
