import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";

const SEARCH_CACHE_KEY = "mtlCarrierSearchResults";
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function pickCarrierValue(carrier, keys) {
  for (const key of keys) {
    const value = carrier?.[key];
    if (value || value === 0) return value;
  }
  return "";
}

function carrierName(carrier) {
  return pickCarrierValue(carrier, ["legal_name", "legalName", "carrierName", "name", "carrier_name"]);
}

function carrierDot(carrier) {
  return pickCarrierValue(carrier, ["dot_number", "dotNumber", "dot", "usdot", "usdotNumber"]);
}

function carrierMc(carrier) {
  return pickCarrierValue(carrier, ["mc_number", "mcNumber", "mc", "docketNumber"]);
}

function carrierPowerUnits(carrier) {
  const value = pickCarrierValue(carrier, ["vehicle_count", "powerUnits", "power_units", "vehicles", "vehicleCount", "fleetSize"]);
  const parsed = Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function carrierDrivers(carrier) {
  return pickCarrierValue(carrier, ["driver_count", "drivers", "driverCount"]);
}

function carrierCargo(carrier) {
  const value = pickCarrierValue(carrier, ["cargoHauled", "cargo", "cargoCarried", "cargoTypes", "cargo_hauled"]);
  if (Array.isArray(value)) return value.join(", ");
  return String(value || "");
}

function carrierInsuranceDate(carrier) {
  return pickCarrierValue(carrier, [
    "insuranceExpiration",
    "insuranceExpirationDate",
    "insurance_expiration",
    "insuranceEffectiveDate",
    "insurance_effective_date",
    "renewalDate",
  ]);
}

function normalizeDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function loadCachedSearch() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SEARCH_CACHE_KEY) || "null");
    if (!cached || !Array.isArray(cached.results)) return null;
    return cached;
  } catch {
    return null;
  }
}

export default function CarrierSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDotAnalytics = location.pathname.includes("dot-analytics");
  const cachedSearch = useMemo(() => loadCachedSearch(), []);
  const [query, setQuery] = useState(searchParams.get("q") || cachedSearch?.query || "");
  const [searchType, setSearchType] = useState(searchParams.get("type") || cachedSearch?.searchType || "name");
  const [results, setResults] = useState(cachedSearch?.results || null);
  const [filters, setFilters] = useState({
    state: searchParams.get("state") || "",
    cargo: searchParams.get("cargo") || "",
    minTrucks: searchParams.get("minTrucks") || "",
    maxTrucks: searchParams.get("maxTrucks") || "",
    status: searchParams.get("status") || "",
  });
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "name");
  const [pageSize, setPageSize] = useState(Number(searchParams.get("limit") || cachedSearch?.pageSize || 20));
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const performSearch = useCallback(async (nextQuery = query, nextType = searchType) => {
    if (!nextQuery.trim()) return;

    setLoading(true);
    setError("");

    try {
      const value = nextQuery.trim();
      const data = nextType === "name"
        ? await api.searchCarrierIntelligence({ query: value, name: value, limit: 100 })
        : await api.searchFmcsaCarrier({ [nextType]: value });
      const carriers = data.results || data.carriers || (data.carrier ? [data.carrier] : []);
      setResults(carriers);
      setPage(1);
      sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify({
        query: value,
        searchType: nextType,
        results: carriers,
        pageSize,
        savedAt: Date.now(),
      }));
      const params = new URLSearchParams(location.search);
      params.set("q", value);
      params.set("type", nextType);
      params.set("page", "1");
      params.set("limit", String(pageSize));
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [location.pathname, location.search, navigate, pageSize, query, searchType]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (query.trim()) params.set("q", query.trim());
    params.set("type", searchType);
    params.set("sort", sortBy);
    params.set("limit", String(pageSize));
    params.set("page", String(page));
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [filters, location.pathname, location.search, navigate, page, pageSize, query, searchType, sortBy]);

  function handleSearch(e) {
    e.preventDefault();
    performSearch();
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const filteredResults = useMemo(() => {
    const carriers = Array.isArray(results) ? [...results] : [];
    const minTrucks = filters.minTrucks ? Number(filters.minTrucks) : null;
    const maxTrucks = filters.maxTrucks ? Number(filters.maxTrucks) : null;
    const cargoNeedle = filters.cargo.trim().toLowerCase();
    const stateNeedle = filters.state.trim().toLowerCase();
    const statusNeedle = filters.status.trim().toLowerCase();

    return carriers
      .filter((carrier) => {
        const trucks = carrierPowerUnits(carrier);
        const state = String(pickCarrierValue(carrier, ["state", "phy_state", "hq_state"]) || "").toLowerCase();
        const cargo = carrierCargo(carrier).toLowerCase();
        const status = String(pickCarrierValue(carrier, ["operating_status", "operatingStatus", "authorityStatus", "authority_status"]) || "").toLowerCase();

        if (stateNeedle && state !== stateNeedle) return false;
        if (cargoNeedle && !cargo.includes(cargoNeedle)) return false;
        if (statusNeedle && !status.includes(statusNeedle)) return false;
        if (minTrucks !== null && trucks < minTrucks) return false;
        if (maxTrucks !== null && trucks > maxTrucks) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "insuranceDate") return normalizeDate(carrierInsuranceDate(a)) - normalizeDate(carrierInsuranceDate(b));
        if (sortBy === "powerUnits") return carrierPowerUnits(b) - carrierPowerUnits(a);
        if (sortBy === "cargo") return carrierCargo(a).localeCompare(carrierCargo(b));
        return String(carrierName(a)).localeCompare(String(carrierName(b)));
      });
  }, [filters, results, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleResults = filteredResults.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">{isDotAnalytics ? "DOT Analytics" : "Carrier Search"}</h1>
        <p className="text-navy-400 text-sm mt-1">Look up carriers using the existing FMCSA backend data.</p>
      </div>

      {/* Search Form */}
      <Card>
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-2">
            {[
              { value: "name", label: "Company Name" },
              { value: "dot", label: "DOT Number" },
              { value: "mc", label: "MC Number" },
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setSearchType(type.value)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  searchType === type.value
                    ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                    : "text-navy-400 hover:text-white border border-transparent"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <div className="flex-1 flex gap-3">
            <div className="relative flex-1">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="input-field pl-10"
                placeholder={
                  searchType === "name" ? "Enter company name..." :
                  searchType === "dot" ? "Enter DOT number..." : "Enter MC number..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" loading={loading}>
              Search
            </Button>
          </div>
        </form>
      </Card>

      {results && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">State</label>
              <input className="input-field" placeholder="TX" maxLength={2} value={filters.state} onChange={(e) => updateFilter("state", e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Cargo Type</label>
              <input className="input-field" placeholder="General Freight" value={filters.cargo} onChange={(e) => updateFilter("cargo", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Min Trucks</label>
              <input className="input-field" type="number" min="0" value={filters.minTrucks} onChange={(e) => updateFilter("minTrucks", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Max Trucks</label>
              <input className="input-field" type="number" min="0" value={filters.maxTrucks} onChange={(e) => updateFilter("maxTrucks", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Sort By</label>
              <select className="input-field" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
                <option value="name" className="bg-navy-900">Name</option>
                <option value="insuranceDate" className="bg-navy-900">Insurance Date</option>
                <option value="powerUnits" className="bg-navy-900">Power Units</option>
                <option value="cargo" className="bg-navy-900">Cargo Type</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-2">Leads Per Page</label>
              <select className="input-field" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size} className="bg-navy-900">{size}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-navy-400">{filteredResults.length} matching carriers from {results.length} returned</p>
            <button
              type="button"
              className="text-sm text-brand-400 hover:text-brand-300"
              onClick={() => {
                setFilters({ state: "", cargo: "", minTrucks: "", maxTrucks: "", status: "" });
                setSortBy("name");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          </div>
        </Card>
      )}

      {error && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
          {error}
        </div>
      )}

      {/* Results */}
      {results && filteredResults.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-navy-300">
              Showing <span className="text-white font-medium">{visibleResults.length}</span> of <span className="text-white font-medium">{filteredResults.length}</span> carriers
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span className="text-xs text-navy-400">Page {safePage} of {totalPages}</span>
              <button type="button" className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
            </div>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {visibleResults.map((carrier) => (
              <div
                key={carrierDot(carrier) || carrier.id || carrierName(carrier)}
                className="flex items-center gap-6 px-6 py-4 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="w-12 h-12 bg-navy-800 rounded-xl flex items-center justify-center text-navy-300 flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">
                    {carrierName(carrier)}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-navy-400">
                    {carrierDot(carrier) && <span className="font-mono">DOT {carrierDot(carrier)}</span>}
                    {carrierMc(carrier) && <><span>&middot;</span><span className="font-mono">MC-{carrierMc(carrier)}</span></>}
                    {([carrier.city, carrier.state].filter(Boolean).length > 0) && <><span>&middot;</span><span>{[carrier.city, carrier.state].filter(Boolean).join(", ")}</span></>}
                    {(carrierPowerUnits(carrier) || carrierDrivers(carrier)) && (
                      <><span>&middot;</span><span>{[carrierPowerUnits(carrier) ? `${carrierPowerUnits(carrier)} power units` : "", carrierDrivers(carrier) ? `${carrierDrivers(carrier)} drivers` : ""].filter(Boolean).join(", ")}</span></>
                    )}
                    {carrierCargo(carrier) && (
                      <><span>&middot;</span><span>{carrierCargo(carrier)}</span></>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={(carrier.operating_status || carrier.operatingStatus) === "AUTHORIZED" ? "success" : "danger"}>
                    {carrier.operating_status || carrier.operatingStatus || "Unknown"}
                  </Badge>
                  {carrier.safety_rating && carrier.safety_rating !== "None" && (
                    <Badge variant={
                      carrier.safety_rating === "Satisfactory" ? "success" :
                      carrier.safety_rating === "Conditional" ? "warning" : "outline"
                    }>
                      {carrier.safety_rating}
                    </Badge>
                  )}
                  {carrierDot(carrier) && (
                    <Link
                      to={`/carrier/${carrierDot(carrier)}`}
                      state={{ from: `${location.pathname}${location.search}`, label: "Back to search results" }}
                      className="btn-secondary text-xs px-3 py-2 rounded-lg border border-white/10"
                    >
                      View Profile
                    </Link>
                  )}
                </div>
                <svg className="w-4 h-4 text-navy-600 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        </Card>
      )}

      {results && filteredResults.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-navy-400 text-sm">No carriers found matching your search and filters.</p>
          <p className="text-navy-600 text-xs mt-2">Try a different search term or loosen the filters.</p>
        </div>
      )}

      {/* Empty State */}
      {!results && (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-navy-400 text-sm">Search for any carrier by company name, DOT number, or MC number</p>
          <p className="text-navy-600 text-xs mt-2">Live data from the FMCSA Safety and Fitness Electronic Records System</p>
        </div>
      )}
    </div>
  );
}
