import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";
import { fetchRelatedPersons, fetchContemporaries, fetchEntityById, fetchPersonImage } from "../utils/sparql";

// Session-level caches — survive tooltip close/reopen and component remounts
const _imageCache = new Map();
const _relatedCache = new Map();
const _contempCache = new Map();

function formatDate(date) {
  if (!date) return "?";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 1 && day === 1) {
    return year < 0 ? `${Math.abs(year)} BC` : String(year);
  }
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  return year < 0
    ? `${d}.${m}.${Math.abs(year)} BC`
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

function CollapsibleSection({ title, loading, defaultOpen = false, children, right, onFirstOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const firedRef = useRef(false);
  function toggle(e) {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && !firedRef.current) {
      firedRef.current = true;
      onFirstOpen?.();
    }
  }
  return (
    <div className="border-t border-base-200 mt-2">
      <button
        className="flex items-center justify-between w-full pt-2 pb-1 text-left gap-1"
        onClick={toggle}
      >
        <span className="text-xs uppercase tracking-wide text-base-content/40 font-medium flex items-center gap-1">
          {title}
          {loading && <span className="loading loading-spinner loading-xs ml-1" />}
        </span>
        <div className="flex items-center gap-1.5">
          {right}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 text-base-content/30 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function TooltipBox({ pos, onClose, children }) {
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
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="absolute top-2 right-2 text-base-content/30 hover:text-base-content/70 transition-colors leading-none"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {children}
    </div>
  );
}

// Reusable chip button for adding a person to the timeline
function PersonChip({ person, onAdd, existingIds, addingId }) {
  const already = existingIds?.has(person.id);
  const loading = addingId === person.id;
  return (
    <button
      className={`text-xs rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors
        ${already
          ? "bg-base-200 text-base-content/30 cursor-default"
          : "bg-base-200 text-base-content/70 hover:bg-primary hover:text-white cursor-pointer"
        }`}
      onClick={(e) => { e.stopPropagation(); if (!already && !addingId) onAdd(person); }}
      disabled={already || !!addingId}
      title={already ? "Already on timeline" : "Add to timeline"}
    >
      {loading && <span className="loading loading-spinner loading-xs" />}
      {person.name}
      {!already && !loading && <span className="opacity-50">+</span>}
      {already && <span className="opacity-40">✓</span>}
    </button>
  );
}

export default function PersonBlock({ person, startYear, pixelsPerYear, onAdd, existingIds }) {
  const [tooltipPos, setTooltipPos] = useState(null);

  // Person image
  const [image, setImage] = useState(() => _imageCache.has(person.id) ? _imageCache.get(person.id) : undefined);
  const imageFetchedRef = useRef(_imageCache.has(person.id) ? person.id : null);

  // Related persons (family/influence)
  const [related, setRelated] = useState(() => _relatedCache.get(person.id) ?? null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Contemporaries
  const [contempResults, setContempResults] = useState(null);
  const [contempLoading, setContempLoading] = useState(false);
  const [contempMode, setContempMode] = useState(person.birthYear != null ? "deaths" : "births");
  const [range, setRange] = useState(5);
  const [contempLimit, setContempLimit] = useState(5);

  const [addingId, setAddingId] = useState(null);
  const blockRef = useRef(null);
  const color = getColorForId(person.id);

  const bYear = person.birthYear ?? startYear;
  const dYear = person.deathYear ?? new Date().getFullYear();
  const leftPx = (bYear - startYear) * pixelsPerYear;
  const widthPx = Math.max((dYear - bYear) * pixelsPerYear, 4);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(person.name)}`;
  const wikidataUrl = `https://www.wikidata.org/wiki/${person.id}`;

  const initials = person.name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  const showImage = image && widthPx > 80;
  const showName = widthPx > (showImage ? 100 : 60);
  const showInitials = !showName && widthPx > 20 && !showImage;
  const labelContent = showName ? person.name : showInitials ? initials : null;

  function toggleTooltip(e) {
    e.stopPropagation();
    if (tooltipPos) {
      setTooltipPos(null);
    } else {
      const rect = blockRef.current?.getBoundingClientRect();
      if (rect) setTooltipPos({ blockTop: rect.top, blockBottom: rect.bottom, blockMidX: rect.left + rect.width / 2 });
    }
  }

  // Fetch image on mount (cached across remounts)
  useEffect(() => {
    if (imageFetchedRef.current === person.id) return;
    imageFetchedRef.current = person.id;
    fetchPersonImage(person.name).then((url) => {
      _imageCache.set(person.id, url ?? null);
      setImage(url ?? null);
    }).catch(() => { _imageCache.set(person.id, null); setImage(null); });
  }, [person.id, person.name]);

  // Lazy-loaded on first section open
  function loadRelated() {
    if (_relatedCache.has(person.id)) { setRelated(_relatedCache.get(person.id)); return; }
    setRelatedLoading(true);
    fetchRelatedPersons(person.id)
      .then((d) => { _relatedCache.set(person.id, d); setRelated(d); })
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }

  function searchContemporaries() {
    const centerYear = contempMode === "deaths" ? person.birthYear : person.deathYear;
    if (centerYear == null) return;
    const key = `${person.id}:${contempMode}:${range}:${contempLimit}`;
    if (_contempCache.has(key)) { setContempResults(_contempCache.get(key)); return; }
    setContempLoading(true);
    setContempResults(null);
    fetchContemporaries(person.id, centerYear, contempMode, range, contempLimit)
      .then((d) => { _contempCache.set(key, d); setContempResults(d); })
      .catch(() => setContempResults([]))
      .finally(() => setContempLoading(false));
  }

  async function handleAdd(relPerson) {
    if (addingId || existingIds?.has(relPerson.id)) return;
    setAddingId(relPerson.id);
    try {
      const full = await fetchEntityById(relPerson.id);
      if (full) onAdd(full);
    } catch { /* ignore */ }
    finally { setAddingId(null); }
  }

  const groupedRelated = related ? groupBy(related, "relType") : null;

  return (
    <div
      className="absolute top-1 bottom-1 rounded-lg cursor-pointer select-none flex items-center overflow-hidden transition-opacity hover:opacity-90"
      style={{ left: leftPx, width: widthPx, backgroundColor: color.bg, minWidth: 4 }}
      ref={blockRef}
      onClick={toggleTooltip}
    >
      {(showImage || labelContent) && (
        <div className="flex items-center gap-1 px-1.5 w-full pointer-events-none overflow-hidden">
          {showImage && (
            <img
              src={image}
              alt={person.name}
              className="rounded-full shrink-0 object-cover object-top"
              style={{ width: 24, height: 24, boxShadow: "0 0 0 1.5px rgba(255,255,255,0.5)" }}
            />
          )}
          {labelContent && (
            <span
              className="text-white text-xs font-medium truncate leading-tight"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
            >
              {labelContent}
            </span>
          )}
        </div>
      )}

      {tooltipPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setTooltipPos(null)} />
          <TooltipBox pos={tooltipPos} onClose={() => setTooltipPos(null)}>

          {/* Header */}
          <div className="flex items-center gap-2 mb-1 pr-5">
            {image && (
              <img
                src={image}
                alt={person.name}
                className="rounded-full shrink-0 object-cover object-top"
                style={{ width: 40, height: 40, boxShadow: "0 0 0 2px rgba(0,0,0,0.08)" }}
              />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight">{person.name}</div>
              {person.description && (
                <div className="text-xs text-base-content/60 mt-0.5 leading-tight">{person.description}</div>
              )}
            </div>
          </div>
          <div className="text-xs text-base-content/70 space-y-0.5 mb-2">
            <div>* {formatDate(person.birthDate)}</div>
            <div>
              {person.deathDate != null
                ? <>† {formatDate(person.deathDate)}</>
                : <span className="text-success">still alive</span>}
            </div>
          </div>

          {/* Related persons */}
          <CollapsibleSection title="Relations &amp; Influences" loading={relatedLoading} defaultOpen={false} onFirstOpen={loadRelated}>
            {groupedRelated && Object.keys(groupedRelated).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(groupedRelated).map(([type, persons]) => (
                  <div key={type}>
                    <span className="text-xs text-base-content/40">{type}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {persons.map((r) => (
                        <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : !relatedLoading ? (
              <span className="text-xs text-base-content/30">No entries in Wikidata</span>
            ) : null}
          </CollapsibleSection>

          {/* Contemporaries */}
          <CollapsibleSection title="Contemporaries" loading={contempLoading} defaultOpen={false}>
            <div className="space-y-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
              {/* Controls */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio" name={`cm-${person.id}`}
                      className="radio radio-xs"
                      checked={contempMode === "deaths"}
                      disabled={person.birthYear == null}
                      onChange={() => setContempMode("deaths")}
                    />
                    <span className={`text-xs ${person.birthYear == null ? "text-base-content/30" : "text-base-content/60"}`}>
                      Birth{person.birthYear != null ? ` (${person.birthYear})` : ""}
                    </span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio" name={`cm-${person.id}`}
                      className="radio radio-xs"
                      checked={contempMode === "births"}
                      disabled={person.deathYear == null}
                      onChange={() => setContempMode("births")}
                    />
                    <span className={`text-xs ${person.deathYear == null ? "text-base-content/30" : "text-base-content/60"}`}>
                      Death{person.deathYear != null ? ` (${person.deathYear})` : ""}
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-base-content/40">±</span>
                  <input
                    type="number"
                    className="input input-xs input-ghost w-10 text-center px-0.5 h-5 min-h-0"
                    value={range} min={1} max={50}
                    onChange={(e) => setRange(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                  />
                  <span className="text-xs text-base-content/40">Years</span>
                  <span className="text-xs text-base-content/20 mx-0.5">·</span>
                  <span className="text-xs text-base-content/40">Top</span>
                  <input
                    type="number"
                    className="input input-xs input-ghost w-8 text-center px-0.5 h-5 min-h-0"
                    value={contempLimit} min={1} max={10}
                    onChange={(e) => setContempLimit(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                  />
                  <button
                    className="btn btn-xs btn-ghost h-5 min-h-0 px-2 text-xs"
                    onClick={searchContemporaries}
                    disabled={contempLoading || (contempMode === "deaths" ? person.birthYear == null : person.deathYear == null)}
                  >
                    {contempLoading ? <span className="loading loading-spinner loading-xs" /> : "Search"}
                  </button>
                </div>
              </div>
              {/* Dynamic year range label */}
              {(() => {
                const centerYear = contempMode === "deaths" ? person.birthYear : person.deathYear;
                if (centerYear == null) return null;
                const from = centerYear - range;
                const to = centerYear + range;
                const verb = contempMode === "deaths" ? "People who died" : "People born";
                return (
                  <p className="text-xs text-base-content/40 italic">
                    {verb} between {from} – {to}
                  </p>
                );
              })()}
              {/* Results */}
              {contempResults != null && !contempLoading && (
                <div className="flex flex-wrap gap-1">
                  {contempResults.length > 0
                    ? contempResults.map((r) => (
                        <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                      ))
                    : <span className="text-xs text-base-content/30">No results</span>}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Links */}
          <div className="border-t border-base-200 pt-2 mt-2 space-y-0.5">
            <a href={wikiUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary block hover:underline" onClick={(e) => e.stopPropagation()}>
              Wikipedia →
            </a>
            <a href={wikidataUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-base-content/40 block hover:underline" onClick={(e) => e.stopPropagation()}>
              Wikidata ({person.id})
            </a>
          </div>

        </TooltipBox>
        </>,
        document.body
      )}
    </div>
  );
}
