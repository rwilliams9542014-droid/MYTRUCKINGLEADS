import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card } from "@/components/ui";
import { api } from "@/lib/api";

const stages = [
  { id: "New", title: "New", color: "bg-brand-500" },
  { id: "Called", title: "Contacted", color: "bg-warning-500" },
  { id: "Quoted", title: "Quoted", color: "bg-accent-500" },
  { id: "Follow Up", title: "Follow Up", color: "bg-brand-300" },
  { id: "Negotiation", title: "Negotiation", color: "bg-warning-400" },
  { id: "Won", title: "Won", color: "bg-accent-600" },
  { id: "Lost", title: "Lost", color: "bg-navy-600" },
];

function normalizeLead(lead) {
  const status = lead.status === "Contacted" ? "Called" : (lead.status || "New");
  return {
    ...lead,
    status,
    name: lead.carrier_name || lead.carrierName || "Unknown carrier",
    dot: lead.dot_number || lead.dot || "",
    mc: lead.mc_number || lead.mc || "",
    state: lead.state || "",
    phone: lead.phone || "",
    email: lead.email || lead.email_address || "",
    leadType: lead.lead_type || lead.leadType || "",
    nextFollowUp: lead.next_follow_up || lead.nextFollowUp || "",
    lastContacted: lead.last_contacted || lead.lastContacted || "",
    trucks: lead.vehicle_count || lead.fleetSize || "",
    value: lead.estimated_value || "",
    lastActivity: lead.notes || "Saved lead",
  };
}

export default function CrmPage() {
  const [leads, setLeads] = useState([]);
  const [draggedLead, setDraggedLead] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getLeads()
      .then((data) => {
        if (active) setLeads((data?.leads || []).map(normalizeLead));
      })
      .catch((err) => {
        if (active) setError(err.message || "Saved clients could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => stages.map((stage) => ({
    ...stage,
    cards: leads.filter((lead) => lead.status === stage.id || (stage.id === "New" && lead.status === "New Lead")),
  })), [leads]);

  const allCards = columns.flatMap((col) => col.cards.map((card) => ({ ...card, stage: col.title, stageColor: col.color })));

  async function moveLead(lead, toStatus) {
    const previous = leads;
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status: toStatus } : item));
    try {
      await api.updateLead(lead.id, { status: toStatus });
    } catch (err) {
      setLeads(previous);
      setError(err.message || "Lead status could not be updated.");
    }
  }

  function handleDrop(e, toStatus) {
    e.preventDefault();
    if (draggedLead && draggedLead.status !== toStatus) {
      moveLead(draggedLead, toStatus);
    }
    setDraggedLead(null);
    setDragOverStage(null);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Pipeline</h1>
          <p className="text-navy-400 text-sm mt-1">
            {loading ? "Loading saved clients..." : `${allCards.length} saved client${allCards.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {["kanban", "table"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all border ${
                viewMode === mode ? "bg-brand-500/20 text-brand-300 border-brand-500/30" : "text-navy-400 border-transparent hover:text-white hover:bg-white/5"
              }`}
            >
              {mode === "kanban" ? "Kanban View" : "Table View"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-3 text-sm text-danger-300">
          {error}
        </div>
      )}

      {viewMode === "kanban" ? (
        <div className="w-full max-w-full overflow-x-auto pb-3">
          <div className="grid grid-flow-col auto-cols-[minmax(260px,320px)] lg:grid-flow-row lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 min-w-max lg:min-w-0">
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.025] transition-all duration-200 min-h-[360px] max-h-[calc(100vh-220px)] ${
                dragOverStage === column.id ? "ring-2 ring-brand-500/40" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(column.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-3 border-b border-white/[0.06] bg-navy-950/90 backdrop-blur">
                <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                <span className="text-xs text-navy-500 bg-navy-800 px-2 py-0.5 rounded-full">{column.cards.length}</span>
              </div>
              <div className="space-y-2 p-2 overflow-y-auto min-h-[240px]">
                {column.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggedLead(card)}
                    className="rounded-xl border border-white/[0.06] bg-navy-900/45 p-3 cursor-grab active:cursor-grabbing hover:border-white/12 hover:bg-navy-900/70 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors hover:underline line-clamp-2">
                        {card.name}
                      </Link>
                      {card.state && <Badge variant="outline" className="text-[10px]">{card.state}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-400">
                      {card.dot && <span className="font-mono">DOT {card.dot}</span>}
                      {card.mc && <span className="font-mono">{card.mc}</span>}
                      {card.phone && <span>{card.phone}</span>}
                      {card.email && <span className="truncate max-w-[220px]">{card.email}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{card.status}</Badge>
                      {card.leadType && <Badge variant="brand" className="text-[10px]">{card.leadType}</Badge>}
                    </div>
                    {card.nextFollowUp && <p className="text-[11px] text-navy-400 mt-2">Next follow-up: {card.nextFollowUp}</p>}
                    <p className="text-[11px] text-navy-500 mt-2 line-clamp-2">{card.lastActivity}</p>
                  </div>
                ))}
                {!column.cards.length && (
                  <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-center text-xs text-navy-500">
                    No CRM records found.
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden border-white/[0.08]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-navy-900/70">
                  {["Company / Carrier", "DOT #", "MC #", "Phone", "Email", "State", "Lead Type", "Status", "Next Follow-Up", "Last Contacted", "Action"].map((heading) => (
                    <th key={heading} className="sticky top-0 text-left text-xs font-semibold text-navy-200 uppercase tracking-wider px-4 py-3 border-r border-white/[0.06] last:border-r-0 bg-navy-900/95">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCards.map((card) => (
                  <tr key={card.id} className="border-b border-white/[0.06] odd:bg-white/[0.015] hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3 border-r border-white/[0.04]">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">
                        {card.name}
                      </Link>
                      <p className="text-xs text-navy-500 line-clamp-1">{card.lastActivity}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-300 font-mono border-r border-white/[0.04]">{card.dot || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 font-mono border-r border-white/[0.04]">{card.mc || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.phone || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04] max-w-[220px] truncate">{card.email || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.state || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.leadType || "-"}</td>
                    <td className="px-4 py-3 border-r border-white/[0.04]"><Badge variant="outline">{card.stage}</Badge></td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.nextFollowUp || "-"}</td>
                    <td className="px-4 py-3 text-sm text-navy-300 border-r border-white/[0.04]">{card.lastContacted || "-"}</td>
                    <td className="px-4 py-3">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} className="text-xs text-brand-400 hover:text-brand-300 font-medium">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && allCards.length === 0 && (
        <div className="text-center py-12">
          <p className="text-navy-400 text-sm">No CRM records found.</p>
          <Link to="/lead-desk" className="text-brand-400 hover:text-brand-300 text-sm mt-2 inline-block">Find leads</Link>
        </div>
      )}
    </div>
  );
}
