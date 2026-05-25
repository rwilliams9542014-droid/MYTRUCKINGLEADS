import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Badge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const easterEggResults = [
  { dot_number: "0000001", legal_name: "Jerry Maguire Trucking Inc", city: "Los Angeles", state: "CA", vehicle_count: 1, driver_count: 1, operating_status: "AUTHORIZED", safety_rating: "Legendary" },
  { dot_number: "7777777", legal_name: "Show Me The Money Express LLC", city: "Jackpot", state: "NV", vehicle_count: 777, driver_count: 777, operating_status: "AUTHORIZED", safety_rating: "Satisfactory" },
  { dot_number: "1000000", legal_name: "Million Dollar Freight Co", city: "Richville", state: "TX", vehicle_count: 100, driver_count: 200, operating_status: "AUTHORIZED", safety_rating: "Satisfactory" },
];

export default function CarrierSearchPage() {
  const { session, isDemo } = useAuth();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("name");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    if (query.toLowerCase().replace(/\s/g, "") === "showmethemoney") {
      setResults(easterEggResults);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fmcsa-search?type=${searchType}&query=${encodeURIComponent(query.trim())}`;
      const headers = {
        "Authorization": `Bearer ${isDemo ? import.meta.env.VITE_SUPABASE_ANON_KEY : session?.access_token}`,
        "Content-Type": "application/json",
      };

      const res = await fetch(apiUrl, { headers });
      if (!res.ok) throw new Error("Search request failed");

      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Carrier Search</h1>
        <p className="text-navy-400 text-sm mt-1">Look up any carrier using the FMCSA database (live data)</p>
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
              <Link
                key={carrier.dot_number}
                to={`/app/carrier/${carrier.dot_number}`}
                className="flex items-center gap-6 px-6 py-4 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="w-12 h-12 bg-navy-800 rounded-xl flex items-center justify-center text-navy-300 flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">
                    {carrier.legal_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-navy-400">
                    <span className="font-mono">DOT {carrier.dot_number}</span>
                    {carrier.mc_number && <><span>&middot;</span><span className="font-mono">MC-{carrier.mc_number}</span></>}
                    <span>&middot;</span>
                    <span>{carrier.city}, {carrier.state}</span>
                    <span>&middot;</span>
                    <span>{carrier.vehicle_count} trucks, {carrier.driver_count} drivers</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={carrier.operating_status === "AUTHORIZED" ? "success" : "danger"}>
                    {carrier.operating_status}
                  </Badge>
                  {carrier.safety_rating && carrier.safety_rating !== "None" && (
                    <Badge variant={
                      carrier.safety_rating === "Satisfactory" ? "success" :
                      carrier.safety_rating === "Conditional" ? "warning" : "outline"
                    }>
                      {carrier.safety_rating}
                    </Badge>
                  )}
                </div>
                <svg className="w-4 h-4 text-navy-600 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
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
