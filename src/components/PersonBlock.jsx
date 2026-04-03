import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";
import { fetchRelatedPersons } from "../utils/sparql";

function formatDate(date) {
  if (!date) return "?";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  // Skip day/month if they're Jan 1 — Wikidata uses that as "year only"
  if (month === 1 && day === 1) {
    return year < 0 ? `${Math.abs(year)} v. Chr.` : String(year);
  }
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  return year < 0
    ? `${d}.${m}.${Math.abs(year)} v. Chr.`
    : `${d}.${m}.${year}`;
}

// Group related persons by relType
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

const TOOLTIP_WIDTH = 300;
const MARGIN = 8;

function TooltipBox({ pos, children }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden", left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;

    // Vertical: above if space, else below, else clamp to bottom
    let top;
    if (pos.blockTop - h - MARGIN >= 0) {
      top = pos.blockTop - h - MARGIN;        // above
    } else if (pos.blockBottom + h + MARGIN <= vh) {
      top = pos.blockBottom + MARGIN;          // below
    } else {
      top = Math.max(MARGIN, vh - h - MARGIN); // clamp to bottom of viewport
    }

    // Horizontal: center on block, clamp to viewport edges
    let left = pos.blockMidX - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    setStyle({ visibility: "visible", top, left });
  }, [pos, children]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-base-100 border border-base-300 rounded-lg shadow-xl p-3 text-left pointer-events-none"
      style={{
        ...style,
        minWidth: 220,
        maxWidth: TOOLTIP_WIDTH,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

export default function PersonBlock({ person, startYear, pixelsPerYear }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const [related, setRelated] = useState(null); // null = not loaded yet
  const [relatedLoading, setRelatedLoading] = useState(false);
  const blockRef = useRef(null);
  const fetchedForRef = useRef(null);
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

  // Lazy-load related persons when tooltip first appears
  useEffect(() => {
    if (!tooltipPos) return;
    if (fetchedForRef.current === person.id) return; // already fetched
    fetchedForRef.current = person.id;
    setRelatedLoading(true);
    fetchRelatedPersons(person.id)
      .then((data) => setRelated(data))
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [tooltipPos, person.id]);

  const groupedRelated = related ? groupBy(related, "relType") : null;

  return (
    <div
      className="absolute top-1 bottom-1 rounded-lg cursor-pointer select-none flex items-center overflow-hidden transition-opacity hover:opacity-90"
      style={{
        left: leftPx,
        width: widthPx,
        backgroundColor: color.bg,
        minWidth: 4,
      }}
      ref={blockRef}
      onMouseEnter={() => {
        const rect = blockRef.current?.getBoundingClientRect();
        if (rect) setTooltipPos({
          blockTop: rect.top,
          blockBottom: rect.bottom,
          blockMidX: rect.left + rect.width / 2,
        });
      }}
      onMouseLeave={() => setTooltipPos(null)}
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
        <TooltipBox pos={tooltipPos}>

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
          {relatedLoading && (
            <div className="text-xs text-base-content/30 flex items-center gap-1 mb-1">
              <span className="loading loading-spinner loading-xs" />
              Verwandte laden…
            </div>
          )}
          {groupedRelated && Object.keys(groupedRelated).length > 0 && (
            <div className="border-t border-base-200 pt-2 mt-1 space-y-1">
              {Object.entries(groupedRelated).map(([type, persons]) => (
                <div key={type}>
                  <span className="text-[10px] uppercase tracking-wide text-base-content/40 font-medium">
                    {type}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {persons.map((r) => (
                      <span
                        key={r.id}
                        className="text-xs bg-base-200 rounded px-1.5 py-0.5 text-base-content/70"
                      >
                        {r.name}
                      </span>
                    ))}
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
          >
            Wikipedia →
          </a>
          <a
            href={wikidataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-base-content/40 mt-0.5 block hover:underline"
          >
            Wikidata ({person.id})
          </a>
        </TooltipBox>,
        document.body
      )}
    </div>
  );
}
