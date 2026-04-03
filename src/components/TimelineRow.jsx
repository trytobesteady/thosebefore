import { useRef } from "react";
import PersonBlock from "./PersonBlock";
import { getColorForId } from "../utils/colors";

const ROW_HEIGHT = 44;

export default function TimelineRow({
  person,
  index,
  startYear,
  totalYears,
  pixelsPerYear,
  onRemove,
  onDragStart,
  onDragOver,
  isDragging,
  onAdd,
  existingIds,
}) {
  const color = getColorForId(person.id);

  return (
    <div
      className={`flex items-stretch border-b border-base-200 last:border-0 transition-opacity ${isDragging ? "opacity-30" : "opacity-100"}`}
      style={{ height: ROW_HEIGHT }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
    >
      {/* Label column */}
      <div
        className="flex items-center gap-1.5 shrink-0 px-2 border-r border-base-200 bg-base-50 cursor-grab active:cursor-grabbing select-none"
        style={{ width: 160 }}
        draggable
        onDragStart={() => onDragStart(index)}
        title="Ziehen zum Verschieben"
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color.bg }} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate leading-tight">{person.name}</span>
          <span className="text-[10px] text-base-content/40 leading-tight tabular-nums">
            {person.birthYear ?? "?"} – {person.deathYear ?? "heute"}
          </span>
        </div>
        <button
          className="btn btn-ghost btn-xs text-base-content/30 hover:text-error p-0 min-h-0 h-5 w-5"
          onClick={() => onRemove(person.id)}
          title="Entfernen"
        >
          ×
        </button>
      </div>

      {/* Block canvas */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ minWidth: totalYears * pixelsPerYear }}
      >
        <PersonBlock
          person={person}
          startYear={startYear}
          totalYears={totalYears}
          pixelsPerYear={pixelsPerYear}
          onAdd={onAdd}
          existingIds={existingIds}
        />
      </div>
    </div>
  );
}
