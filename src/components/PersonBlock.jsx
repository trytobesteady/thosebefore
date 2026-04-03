import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";
import { fetchRelatedPersons, fetchContemporaries, fetchEntityById } from "../utils/sparql";

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

function CollapsibleSection({ title, loading, defaultOpen = false, children, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-base-200 mt-2">
      <button
        className="flex items-center justify-between w-full pt-2 pb-1 text-left gap-1"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className="text-[10px] uppercase tracking-wide text-base-content/40 font-medium flex items-center gap-1">
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

function TooltipBox({ pos, onMouseEnter, onMouseLeave, onClose, children }) {
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
      <button
        className="absolute top-2 right-2 text-base-content/30 hover:text-base-content/70 transition-colors leading-none"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Schließen"
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
      title={already ? "Bereits auf der Zeitleiste" : "Zur Zeitleiste hinzufügen"}
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

  // Related persons (family/influence)
  const [related, setRelated] = useState(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedFetchedRef = useRef(null);

  // Contemporaries
  const [contemporaries, setContemporaries] = useState(null);
  const [contemporariesLoading, setContemporariesLoading] = useState(false);
  const [range, setRange] = useState(15);
  const contemporariesFetchedRef = useRef(null); // tracks "id:range" key

  const [addingId, setAddingId] = useState(null);
  const blockRef = useRef(null);
  const hideTimerRef = useRef(null);
  const color = getColorForId(person.id);

  const bYear = person.birthYear ?? startYear;
  const dYear = person.deathYear ?? new Date().getFullYear();
  const leftPx = (bYear - startYear) * pixelsPerYear;
  const widthPx = Math.max((dYear - bYear) * pixelsPerYear, 4);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(person.name)}`;
  const wikidataUrl = `https://www.wikidata.org/wiki/${person.id}`;

  const initials = person.name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  const labelContent = widthPx > 60 ? person.name : widthPx > 20 ? initials : null;

  function scheduleHide() { hideTimerRef.current = setTimeout(() => setTooltipPos(null), 200); }
  function cancelHide() { clearTimeout(hideTimerRef.current); }
  function showTooltip() {
    cancelHide();
    const rect = blockRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ blockTop: rect.top, blockBottom: rect.bottom, blockMidX: rect.left + rect.width / 2 });
  }

  // Fetch related persons (once per person)
  useEffect(() => {
    if (!tooltipPos) return;
    if (relatedFetchedRef.current === person.id) return;
    relatedFetchedRef.current = person.id;
    setRelatedLoading(true);
    fetchRelatedPersons(person.id)
      .then(setRelated).catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [tooltipPos, person.id]);

  // Fetch contemporaries (re-fetches when range changes)
  useEffect(() => {
    if (!tooltipPos) return;
    const key = `${person.id}:${range}`;
    if (contemporariesFetchedRef.current === key) return;
    contemporariesFetchedRef.current = key;
    setContemporariesLoading(true);
    fetchContemporaries(person.id, person.birthYear, person.deathYear, range)
      .then(setContemporaries).catch(() => setContemporaries({ diedAtBirth: [], bornAtDeath: [] }))
      .finally(() => setContemporariesLoading(false));
  }, [tooltipPos, person.id, person.birthYear, person.deathYear, range]);

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
        <TooltipBox pos={tooltipPos} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} onClose={() => setTooltipPos(null)}>

          {/* Header */}
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

          {/* Related persons */}
          <CollapsibleSection title="Verwandte &amp; Einflüsse" loading={relatedLoading} defaultOpen={true}>
            {groupedRelated && Object.keys(groupedRelated).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(groupedRelated).map(([type, persons]) => (
                  <div key={type}>
                    <span className="text-[10px] text-base-content/40">{type}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {persons.map((r) => (
                        <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : !relatedLoading ? (
              <span className="text-xs text-base-content/30">Keine Einträge in Wikidata</span>
            ) : null}
          </CollapsibleSection>

          {/* Contemporaries */}
          <CollapsibleSection
            title="Zeitgenossen"
            loading={contemporariesLoading}
            defaultOpen={true}
            right={
              <label className="flex items-center gap-1 text-[10px] text-base-content/40" onClick={(e) => e.stopPropagation()}>
                ±
                <input
                  type="number"
                  className="input input-xs input-ghost w-10 text-center px-0.5 h-5 min-h-0"
                  value={range}
                  min={1} max={25}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRange(Math.max(1, Math.min(25, parseInt(e.target.value) || 15)))}
                />
                J.
              </label>
            }
          >
            {contemporaries && !contemporariesLoading && (
              <div className="space-y-1.5">
                {person.birthYear != null && (
                  <div>
                    <span className="text-[10px] text-base-content/40">† um {person.birthYear} — wer verließ die Bühne</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {contemporaries.diedAtBirth.length > 0
                        ? contemporaries.diedAtBirth.map((r) => (
                            <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                          ))
                        : <span className="text-xs text-base-content/30">–</span>}
                    </div>
                  </div>
                )}
                {person.deathYear != null && (
                  <div>
                    <span className="text-[10px] text-base-content/40">* um {person.deathYear} — wer betrat die Bühne</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {contemporaries.bornAtDeath.length > 0
                        ? contemporaries.bornAtDeath.map((r) => (
                            <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                          ))
                        : <span className="text-xs text-base-content/30">–</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
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

        </TooltipBox>,
        document.body
      )}
    </div>
  );
}
