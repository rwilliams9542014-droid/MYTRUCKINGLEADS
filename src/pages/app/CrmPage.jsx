import { useState } from "react";
import { Badge, Card } from "@/components/ui";

const initialColumns = [
  {
    id: "new",
    title: "New",
    color: "bg-brand-500",
    cards: [
      { id: 1, name: "Martinez Trucking LLC", dot: "4102847", state: "TX", trucks: 4, value: "$8,200", daysInStage: 1 },
      { id: 2, name: "Desert Sun Transport", dot: "4099102", state: "AZ", trucks: 5, value: "$9,800", daysInStage: 2 },
      { id: 3, name: "Bayou Express LLC", dot: "4110923", state: "LA", trucks: 2, value: "$4,500", daysInStage: 1 },
    ],
  },
  {
    id: "contacted",
    title: "Contacted",
    color: "bg-warning-500",
    cards: [
      { id: 4, name: "Heartland Freight Co", dot: "4098331", state: "OH", trucks: 3, value: "$6,200", daysInStage: 3 },
      { id: 5, name: "Cascade Freight Lines", dot: "3845201", state: "WA", trucks: 15, value: "$22,400", daysInStage: 5 },
    ],
  },
  {
    id: "quoted",
    title: "Quoted",
    color: "bg-accent-500",
    cards: [
      { id: 6, name: "Great Plains Haul Co", dot: "3920174", state: "KS", trucks: 8, value: "$14,600", daysInStage: 4 },
      { id: 7, name: "Pacific Ridge Transport", dot: "3891024", state: "CA", trucks: 12, value: "$18,900", daysInStage: 2 },
    ],
  },
  {
    id: "won",
    title: "Won",
    color: "bg-accent-600",
    cards: [
      { id: 8, name: "Iron Horse Logistics", dot: "3801456", state: "PA", trucks: 18, value: "$28,500", daysInStage: 0 },
    ],
  },
];

export default function CrmPage() {
  const [columns, setColumns] = useState(initialColumns);
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

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

  const totalValue = columns.reduce(
    (sum, col) => sum + col.cards.reduce((s, c) => s + parseInt(c.value.replace(/[$,]/g, "")), 0),
    0
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Pipeline</h1>
          <p className="text-navy-400 text-sm mt-1">
            {columns.reduce((sum, col) => sum + col.cards.length, 0)} deals &middot; ${totalValue.toLocaleString()} pipeline value
          </p>
        </div>
      </div>

      {/* Kanban Board */}
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
            {/* Column Header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
              <h3 className="text-sm font-semibold text-white">{column.title}</h3>
              <span className="text-xs text-navy-500 bg-navy-800 px-2 py-0.5 rounded-full">
                {column.cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3 px-2 pb-4 min-h-[200px]">
              {column.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => handleDragStart(card, column.id)}
                  className="glass-card p-4 cursor-grab active:cursor-grabbing hover:border-white/10 hover:shadow-card transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">
                      {card.name}
                    </h4>
                    <Badge variant="outline" className="text-[10px]">{card.state}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-navy-400">
                    <span className="font-mono">DOT {card.dot}</span>
                    <span>&middot;</span>
                    <span>{card.trucks} trucks</span>
                  </div>
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
    </div>
  );
}
