import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";

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

export default function PersonBlock({ person, startYear, totalYears, pixelsPerYear }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const blockRef = useRef(null);
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

  // >60px: full name  |  >20px: initials  |  ≤20px: nothing (just color)
  const labelContent =
    widthPx > 60 ? person.name :
    widthPx > 20 ? initials :
    null;

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
        if (rect) setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
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
        <div
          className="fixed z-[9999] bg-base-100 border border-base-300 rounded-lg shadow-xl p-3 text-left pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y - 8,
            transform: "translate(-50%, -100%)",
            minWidth: 200,
            maxWidth: 280,
          }}
        >
          <div className="font-semibold text-sm mb-1">{person.name}</div>
          {person.description && (
            <div className="text-xs text-base-content/60 mb-1.5">{person.description}</div>
          )}
          <div className="text-xs text-base-content/70 space-y-0.5">
            <div>* {formatDate(person.birthDate)}</div>
            <div>
              {person.deathDate != null
                ? <>† {formatDate(person.deathDate)}</>
                : <span className="text-success">lebt noch</span>}
            </div>
          </div>
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary mt-1.5 block hover:underline"
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
        </div>,
        document.body
      )}
    </div>
  );
}
