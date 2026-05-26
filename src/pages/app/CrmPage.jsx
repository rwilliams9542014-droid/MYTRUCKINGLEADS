import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Button } from "@/components/ui";

const initialColumns = [
  {
    id: "new",
    title: "New",
    color: "bg-brand-500",
    cards: [
      { id: 1, name: "Martinez Trucking LLC", dot: "4102847", state: "TX", trucks: 4, value: "$8,200", daysInStage: 1, phone: "(713) 555-0142", lastActivity: "Added from Lead Desk" },
      { id: 2, name: "Desert Sun Transport", dot: "4099102", state: "AZ", trucks: 5, value: "$9,800", daysInStage: 2, phone: "(602) 555-0177", lastActivity: "Imported from FMCSA" },
      { id: 3, name: "Bayou Express LLC", dot: "4110923", state: "LA", trucks: 2, value: "$4,500", daysInStage: 1, phone: "(225) 555-0143", lastActivity: "New DOT registration" },
    ],
  },
  {
    id: "contacted",
    title: "Contacted",
    color: "bg-warning-500",
    cards: [
      { id: 4, name: "Heartland Freight Co", dot: "4098331", state: "OH", trucks: 3, value: "$6,200", daysInStage: 3, phone: "(614) 555-0167", lastActivity: "Left voicemail" },
      { id: 5, name: "Cascade Freight Lines", dot: "3845201", state: "WA", trucks: 15, value: "$22,400", daysInStage: 5, phone: "(206) 555-0211", lastActivity: "Email sent - awaiting reply" },
    ],
  },
  {
    id: "quoted",
    title: "Quoted",
    color: "bg-accent-500",
    cards: [
      { id: 6, name: "Great Plains Haul Co", dot: "3920174", state: "KS", trucks: 8, value: "$14,600", daysInStage: 4, phone: "(316) 555-0156", lastActivity: "Quote sent via email" },
      { id: 7, name: "Pacific Ridge Transport", dot: "3891024", state: "CA", trucks: 12, value: "$18,900", daysInStage: 2, phone: "(559) 555-0198", lastActivity: "Reviewing quote package" },
    ],
  },
  {
    id: "won",
    title: "Won",
    color: "bg-accent-600",
    cards: [
      { id: 8, name: "Iron Horse Logistics", dot: "3801456", state: "PA", trucks: 18, value: "$28,500", daysInStage: 0, phone: "(412) 555-0192", lastActivity: "Policy bound!" },
    ],
  },
  {
    id: "lost",
    title: "Lost",
    color: "bg-navy-600",
    cards: [
      { id: 9, name: "Lone Star Haul Inc", dot: "3910223", state: "TX", trucks: 6, value: "$11,200", daysInStage: 7, phone: "(817) 555-0133", lastActivity: "Went with competitor" },
    ],
  },
];

export default function CrmPage() {
  const [columns, setColumns] = useState(initialColumns);
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");

  function handleDragStart(card, columnId) {
    setDraggedCard({ card, fromColumn: columnId });
  }

  function handleDragOver(e, columnId) {
    e.preventDefault();
    setDragOverColumn(columnId);
  }

  function handleDrop(e, toColumnId) {
    e.preventDefault();
    if (!draggedCard || draggedCard.fromColumn === toColumnId) {
      setDraggedCard(null);
      setDragOverColumn(null);
      return;
    }
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === draggedCard.fromColumn) {
          return { ...col, cards: col.cards.filter((c) => c.id !== draggedCard.card.id) };
        }
        if (col.id === toColumnId) {
          return { ...col, cards: [...col.cards, { ...draggedCard.card, daysInStage: 0 }] };
        }
        return col;
      })
    );
    setDraggedCard(null);
    setDragOverColumn(null);
  }

  const allCards = columns.flatMap((col) => col.cards.map((card) => ({ ...card, stage: col.title, stageColor: col.color })));
  const totalValue = allCards.reduce((sum, c) => sum + parseInt(c.value.replace(/[$,]/g, "")), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Pipeline</h1>
          <p className="text-navy-400 text-sm mt-1">
            {allCards.length} deals &middot; ${totalValue.toLocaleString()} pipeline value
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("kanban")}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              viewMode === "kanban" ? "bg-brand-500/20 text-brand-300 border border-brand-500/30" : "text-navy-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
            Kanban
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              viewMode === "table" ? "bg-brand-500/20 text-brand-300 border border-brand-500/30" : "text-navy-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Table
          </button>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex-shrink-0 w-80 flex flex-col rounded-2xl transition-all duration-200 ${
                dragOverColumn === column.id ? "ring-2 ring-brand-500/40" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                <span className="text-xs text-navy-500 bg-navy-800 px-2 py-0.5 rounded-full">
                  {column.cards.length}
                </span>
              </div>
              <div className="space-y-3 px-2 pb-4 min-h-[200px]">
                {column.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => handleDragStart(card, column.id)}
                    className="glass-card p-4 cursor-grab active:cursor-grabbing hover:border-white/10 hover:shadow-card transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Link
                        to={`/carrier/${card.dot}`}
                        className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {card.name}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">{card.state}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-navy-400">
                      <span className="font-mono">DOT {card.dot}</span>
                      <span>&middot;</span>
                      <span>{card.trucks} trucks</span>
                    </div>
                    <p className="text-[11px] text-navy-500 mt-2 italic">{card.lastActivity}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <span className="text-sm font-semibold text-accent-400">{card.value}</span>
                      <span className="text-[10px] text-navy-500">
                        {card.daysInStage === 0 ? "Today" : `${card.daysInStage}d in stage`}
                      </span>
                    </div>
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
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-6 py-4">Company</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">DOT</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Stage</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Fleet</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Value</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Phone</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Last Activity</th>
                  <th className="text-left text-xs font-medium text-navy-400 uppercase tracking-wider px-4 py-4">Days</th>
                </tr>
              </thead>
              <tbody>
                {allCards.map((card) => (
                  <tr key={card.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <Link to={`/carrier/${card.dot}`} className="text-sm font-medium text-white hover:text-brand-300 transition-colors">
                        {card.name}
                      </Link>
                      <p className="text-xs text-navy-500">{card.state}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-300 font-mono">{card.dot}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${card.stageColor}`} />
                        <span className="text-sm text-navy-300">{card.stage}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-300">{card.trucks}</td>
                    <td className="px-4 py-3 text-sm font-medium text-accent-400">{card.value}</td>
                    <td className="px-4 py-3 text-sm text-navy-300">{card.phone}</td>
                    <td className="px-4 py-3 text-xs text-navy-400">{card.lastActivity}</td>
                    <td className="px-4 py-3 text-sm text-navy-400">{card.daysInStage}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
