import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";
import { fetchRelatedPersons, fetchEntityById } from "../utils/sparql";

function formatDate(date) {
  if (!date) return "?";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 1 && day === 1) {
    return year < 0 ? `${Math.abs(year)} v. Chr.` : String(year);
  }
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  return year < 0
    ? `${d}.${m}.${Math.abs(year)} v. Chr.`
    : `${d}.${m}.${year}`;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

const TOOLTIP_WIDTH = 300;
const MARGIN = 8;

function TooltipBox({ pos, onMouseEnter, onMouseLeave, children }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden", left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;

    let top;
    if (pos.blockTop - h - MARGIN >= 0) {
      top = pos.blockTop - h - MARGIN;
    } else if (pos.blockBottom + h + MARGIN <= vh) {
      top = pos.blockBottom + MARGIN;
    } else {
      top = Math.max(MARGIN, vh - h - MARGIN);
    }

    let left = pos.blockMidX - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    setStyle({ visibility: "visible", top, left });
  }, [pos, children]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-base-100 border border-base-300 rounded-lg shadow-xl p-3 text-left"
      style={{
        ...style,
        minWidth: 220,
        maxWidth: TOOLTIP_WIDTH,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

export default function PersonBlock({ person, startYear, pixelsPerYear, onAdd, existingIds }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const [related, setRelated] = useState(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [addingId, setAddingId] = useState(null); // which chip is currently loading
  const blockRef = useRef(null);
  const fetchedForRef = useRef(null);
  const hideTimerRef = useRef(null);
  const color = getColorForId(person.id);

  const bYear = person.birthYear ?? startYear;
  const dYear = person.deathYear ?? new Date().getFullYear();
  const leftPx = (bYear - startYear) * pixelsPerYear;
  const widthPx = Math.max((dYear - bYear) * pixelsPerYear, 4);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(person.name)}`;
  const wikidataUrl = `https://www.wikidata.org/wiki/${person.id}`;

  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");

  const labelContent =
    widthPx > 60 ? person.name :
    widthPx > 20 ? initials :
    null;

  function scheduleHide() {
    hideTimerRef.current = setTimeout(() => setTooltipPos(null), 200);
  }

  function cancelHide() {
    clearTimeout(hideTimerRef.current);
  }

  function showTooltip() {
    cancelHide();
    const rect = blockRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({
      blockTop: rect.top,
      blockBottom: rect.bottom,
      blockMidX: rect.left + rect.width / 2,
    });
  }

  useEffect(() => {
    if (!tooltipPos) return;
    if (fetchedForRef.current === person.id) return;
    fetchedForRef.current = person.id;
    setRelatedLoading(true);
    fetchRelatedPersons(person.id)
      .then((data) => setRelated(data))
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [tooltipPos, person.id]);

  async function handleAddRelated(relPerson) {
    if (addingId || existingIds?.has(relPerson.id)) return;
    setAddingId(relPerson.id);
    try {
      const full = await fetchEntityById(relPerson.id);
      if (full) onAdd(full);
    } catch {
      // silently ignore
    } finally {
      setAddingId(null);
    }
  }

  const groupedRelated = related ? groupBy(related, "relType") : null;

  return (
    <div
      className="absolute top-1 bottom-1 rounded-lg cursor-pointer select-none flex items-center overflow-hidden transition-opacity hover:opacity-90"
      style={{ left: leftPx, width: widthPx, backgroundColor: color.bg, minWidth: 4 }}
      ref={blockRef}
      onMouseEnter={showTooltip}
      onMouseLeave={scheduleHide}
      onClick={() => window.open(wikiUrl, "_blank")}
    >
      {labelContent && (
        <span
          className="px-1.5 text-white text-xs font-medium truncate leading-tight pointer-events-none w-full text-center"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
        >
          {labelContent}
        </span>
      )}

      {tooltipPos && createPortal(
        <TooltipBox pos={tooltipPos} onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>
          <div className="font-semibold text-sm mb-1">{person.name}</div>
          {person.description && (
            <div className="text-xs text-base-content/60 mb-1.5">{person.description}</div>
          )}

          <div className="text-xs text-base-content/70 space-y-0.5 mb-2">
            <div>* {formatDate(person.birthDate)}</div>
            <div>
              {person.deathDate != null
                ? <>† {formatDate(person.deathDate)}</>
                : <span className="text-success">lebt noch</span>}
            </div>
          </div>

          {relatedLoading && (
            <div className="text-xs text-base-content/30 flex items-center gap-1 mb-1">
              <span className="loading loading-spinner loading-xs" />
              Verwandte laden…
            </div>
          )}

          {groupedRelated && Object.keys(groupedRelated).length > 0 && (
            <div className="border-t border-base-200 pt-2 mt-1 space-y-1.5">
              {Object.entries(groupedRelated).map(([type, persons]) => (
                <div key={type}>
                  <span className="text-[10px] uppercase tracking-wide text-base-content/40 font-medium">
                    {type}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {persons.map((r) => {
                      const already = existingIds?.has(r.id);
                      const loading = addingId === r.id;
                      return (
                        <button
                          key={r.id}
                          className={`text-xs rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors
                            ${already
                              ? "bg-base-200 text-base-content/30 cursor-default"
                              : "bg-base-200 text-base-content/70 hover:bg-primary hover:text-white cursor-pointer"
                            }`}
                          onClick={(e) => { e.stopPropagation(); handleAddRelated(r); }}
                          disabled={already || !!addingId}
                          title={already ? "Bereits auf der Zeitleiste" : "Zur Zeitleiste hinzufügen"}
                        >
                          {loading && <span className="loading loading-spinner loading-xs" />}
                          {r.name}
                          {!already && !loading && <span className="opacity-50">+</span>}
                          {already && <span className="opacity-40">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {groupedRelated && Object.keys(groupedRelated).length === 0 && (
            <div className="text-xs text-base-content/30 border-t border-base-200 pt-2 mt-1">
              Keine Verknüpfungen in Wikidata
            </div>
          )}

          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary mt-2 block hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Wikipedia →
          </a>
          <a
            href={wikidataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-base-content/40 mt-0.5 block hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Wikidata ({person.id})
          </a>
        </TooltipBox>,
        document.body
      )}
    </div>
  );
}
