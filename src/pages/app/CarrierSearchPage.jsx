import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";

export default function CarrierSearchPage() {
  const location = useLocation();
  const isDotAnalytics = location.pathname.includes("dot-analytics");
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("name");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");

    try {
      const value = query.trim();
      const data = searchType === "name"
        ? await api.searchCarrierIntelligence({ query: value, name: value, limit: 25 })
        : await api.searchFmcsaCarrier({ [searchType]: value });
      const carriers = data.results || data.carriers || (data.carrier ? [data.carrier] : []);
      setResults(carriers);
    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

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

      {error && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
          {error}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-sm text-navy-300">
              <span className="text-white font-medium">{results.length}</span> carriers found
            </p>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {results.map((carrier) => (
              <div
                key={carrier.dot_number || carrier.dotNumber || carrier.dot || carrier.id || carrier.carrierName}
                className="flex items-center gap-6 px-6 py-4 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="w-12 h-12 bg-navy-800 rounded-xl flex items-center justify-center text-navy-300 flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">
                    {carrier.legal_name || carrier.legalName || carrier.carrierName || carrier.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-navy-400">
                    {(carrier.dot_number || carrier.dotNumber || carrier.dot) && <span className="font-mono">DOT {carrier.dot_number || carrier.dotNumber || carrier.dot}</span>}
                    {(carrier.mc_number || carrier.mcNumber) && <><span>&middot;</span><span className="font-mono">MC-{carrier.mc_number || carrier.mcNumber}</span></>}
                    {([carrier.city, carrier.state].filter(Boolean).length > 0) && <><span>&middot;</span><span>{[carrier.city, carrier.state].filter(Boolean).join(", ")}</span></>}
                    {(carrier.vehicle_count || carrier.powerUnits || carrier.vehicles || carrier.driver_count || carrier.drivers) && (
                      <><span>&middot;</span><span>{[carrier.vehicle_count || carrier.powerUnits || carrier.vehicles ? `${carrier.vehicle_count || carrier.powerUnits || carrier.vehicles} power units` : "", carrier.driver_count || carrier.drivers ? `${carrier.driver_count || carrier.drivers} drivers` : ""].filter(Boolean).join(", ")}</span></>
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
                  {(carrier.dot_number || carrier.dotNumber || carrier.dot) && (
                    <Link
                      to={`/carrier/${carrier.dot_number || carrier.dotNumber || carrier.dot}`}
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

      {results && results.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-navy-400 text-sm">No carriers found matching your search.</p>
          <p className="text-navy-600 text-xs mt-2">Try a different search term or type.</p>
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
