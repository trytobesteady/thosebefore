import { useRef, useState } from "react";
import TimelineRow from "./TimelineRow";

const LABEL_WIDTH = 160;
const ROW_HEIGHT = 44;
const MIN_PX_PER_YEAR = 2;
const MAX_PX_PER_YEAR = 40;
const AXIS_HEIGHT = 28;

function computeTimeRange(persons) {
  if (!persons.length) return { startYear: 1400, endYear: 2000, totalYears: 600 };
  const years = [];
  persons.forEach((p) => {
    if (p.birthYear != null) years.push(p.birthYear);
    if (p.deathYear != null) years.push(p.deathYear);
  });
  if (!years.length) return { startYear: 1400, endYear: 2000, totalYears: 600 };
  const min = Math.min(...years);
  const max = Math.max(...years);
  const pad = Math.max(10, Math.round((max - min) * 0.05));
  const startYear = min - pad;
  const endYear = max + pad;
  return { startYear, endYear, totalYears: endYear - startYear };
}

function computeTickInterval(totalYears, availableWidth) {
  const px = availableWidth / totalYears;
  const intervals = [1, 2, 5, 10, 25, 50, 100, 200, 250, 500, 1000];
  for (const iv of intervals) {
    if (iv * px >= 60) return iv;
  }
  return 1000;
}

function generateTicks(startYear, endYear, interval) {
  const ticks = [];
  const first = Math.ceil(startYear / interval) * interval;
  for (let y = first; y <= endYear; y += interval) {
    ticks.push(y);
  }
  return ticks;
}

export default function TimelineCanvas({
  persons,
  sortMode,
  onRemove,
  onReorder,
  onSortByBirth,
  onSortByDeath,
}) {
  const scrollRef = useRef(null);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [zoom, setZoom] = useState(1);

  const { startYear, endYear, totalYears } = computeTimeRange(persons);
  const baseWidth = 900;
  const basePxPerYear = Math.max(MIN_PX_PER_YEAR, Math.min(MAX_PX_PER_YEAR, baseWidth / Math.max(totalYears, 1)));
  const pixelsPerYear = basePxPerYear * zoom;
  const canvasWidth = totalYears * pixelsPerYear;

  const tickInterval = computeTickInterval(totalYears, canvasWidth);
  const ticks = generateTicks(startYear, endYear, tickInterval);

  function handleDragStart(index) {
    dragIndexRef.current = index;
  }

  function handleDragOver(index) {
    setDragOverIndex(index);
  }

  function handleDrop() {
    if (dragIndexRef.current !== null && dragOverIndex !== null && dragIndexRef.current !== dragOverIndex) {
      onReorder(dragIndexRef.current, dragOverIndex);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-200 bg-base-100 flex-wrap">
        <span className="text-xs text-base-content/50 font-medium uppercase tracking-wide mr-1">Sortieren:</span>
        <div className="join">
          <button
            className={`join-item btn btn-xs ${sortMode === "birth" ? "btn-primary" : "btn-ghost border border-base-300"}`}
            onClick={onSortByBirth}
          >
            Nach Geburt
          </button>
          <button
            className={`join-item btn btn-xs ${sortMode === "death" ? "btn-primary" : "btn-ghost border border-base-300"}`}
            onClick={onSortByDeath}
          >
            Nach Tod
          </button>
          <button
            className={`join-item btn btn-xs ${sortMode === "manual" ? "btn-primary" : "btn-ghost border border-base-300"}`}
            disabled
          >
            Manuell
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-base-content/50">Zoom:</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}>−</button>
          <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom((z) => Math.min(10, z + 0.2))}>+</button>
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom(1)}>Reset</button>
        </div>
      </div>

      {persons.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-base-content/30 text-sm flex-col gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Suche Personen und füge sie der Zeitleiste hinzu</span>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ minWidth: LABEL_WIDTH + canvasWidth + 20 }}>
            {/* Rows */}
            <div onDragEnd={handleDrop}>
              {persons.map((person, index) => (
                <TimelineRow
                  key={person.id}
                  person={person}
                  index={index}
                  startYear={startYear}
                  totalYears={totalYears}
                  pixelsPerYear={pixelsPerYear}
                  onRemove={onRemove}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  isDragging={dragOverIndex === index && dragIndexRef.current !== index}
                />
              ))}
            </div>

            {/* Time axis */}
            <div
              className="flex items-start border-t-2 border-base-300"
              style={{ height: AXIS_HEIGHT, paddingLeft: LABEL_WIDTH }}
            >
              <div className="relative" style={{ width: canvasWidth, height: AXIS_HEIGHT }}>
                {ticks.map((year) => {
                  const x = (year - startYear) * pixelsPerYear;
                  return (
                    <div
                      key={year}
                      className="absolute flex flex-col items-center"
                      style={{ left: x, transform: "translateX(-50%)" }}
                    >
                      <div className="w-px h-1.5 bg-base-400 bg-base-content/30" />
                      <span className="text-xs text-base-content/40 mt-0.5 whitespace-nowrap">
                        {year < 0 ? `${Math.abs(year)} v. Chr.` : year}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
