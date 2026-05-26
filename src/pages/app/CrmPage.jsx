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
        <div className="flex items-center gap-2">
          {["kanban", "table"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === mode ? "bg-brand-500/20 text-brand-300 border border-brand-500/30" : "text-navy-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {mode === "kanban" ? "Kanban" : "Table"}
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
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex-shrink-0 w-80 flex flex-col rounded-2xl transition-all duration-200 ${
                dragOverStage === column.id ? "ring-2 ring-brand-500/40" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(column.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                <span className="text-xs text-navy-500 bg-navy-800 px-2 py-0.5 rounded-full">{column.cards.length}</span>
              </div>
              <div className="space-y-3 px-2 pb-4 min-h-[200px]">
                {column.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggedLead(card)}
                    className="glass-card p-4 cursor-grab active:cursor-grabbing hover:border-white/10 hover:shadow-card transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors hover:underline">
                        {card.name}
                      </Link>
                      {card.state && <Badge variant="outline" className="text-[10px]">{card.state}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-navy-400">
                      {card.dot && <span className="font-mono">DOT {card.dot}</span>}
                      {card.phone && <span>{card.phone}</span>}
                    </div>
                    <p className="text-[11px] text-navy-500 mt-2 line-clamp-2">{card.lastActivity}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Company", "DOT", "Stage", "State", "Phone", "Insurance Expiration"].map((heading) => (
                    <th key={heading} className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-6 py-4">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCards.map((card) => (
                  <tr key={card.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <Link to={card.dot ? `/carrier/${card.dot}` : "/crm"} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">
                        {card.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-navy-300 font-mono">{card.dot || "-"}</td>
                    <td className="px-6 py-3"><span className="text-sm text-navy-300">{card.stage}</span></td>
                    <td className="px-6 py-3 text-sm text-navy-300">{card.state || "-"}</td>
                    <td className="px-6 py-3 text-sm text-navy-300">{card.phone || "-"}</td>
                    <td className="px-6 py-3 text-sm text-navy-300">{card.insurance_expiration || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && allCards.length === 0 && (
        <div className="text-center py-12">
          <p className="text-navy-400 text-sm">No saved clients in your pipeline yet.</p>
          <Link to="/lead-desk" className="text-brand-400 hover:text-brand-300 text-sm mt-2 inline-block">Find leads</Link>
        </div>
      )}
    </div>
  );
}
