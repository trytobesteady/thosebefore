import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getColorForId } from "../utils/colors";
import { fetchRelatedPersons, fetchEntityById, fetchPersonImage, fetchOccupations, fetchSameField, fetchQidFromWikipedia } from "../utils/sparql";
import { getPantheonContemporaries } from "../utils/pantheon";
import { useLang } from "../i18n";

// Session-level caches — survive tooltip close/reopen and component remounts
const _imageCache = new Map();
const _relatedCache = new Map();
const _contempCache = new Map();
const _occupationsCache = new Map();
const _sameFieldCache = new Map();
const _pantheonQidCache = new Map(JSON.parse(sessionStorage.getItem('_pqc') || '[]'));

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
  useEffect(() => {
    if (defaultOpen && !firedRef.current) {
      firedRef.current = true;
      onFirstOpen?.();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const { t } = useLang();
  const resolvedId = person.id?.startsWith('pantheon:') ? _pantheonQidCache.get(person.id) : person.id;
  const already = resolvedId ? existingIds?.has(resolvedId) : false;
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
      title={already ? t.alreadyOnTimeline : person.description ? t.addToTimelineWithDesc(person.description.charAt(0).toUpperCase() + person.description.slice(1)) : t.addToTimeline}
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
  const { t, lang } = useLang();

  // Person image
  const [image, setImage] = useState(() => _imageCache.has(person.id) ? _imageCache.get(person.id) : undefined);
  const imageFetchedRef = useRef(_imageCache.has(person.id) ? person.id : null);

  // Related persons (family/influence)
  const [related, setRelated] = useState(() => _relatedCache.get(person.id) ?? null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Contemporaries
  const [contempResults, setContempResults] = useState(null);
  const [contempLoading, setContempLoading] = useState(false);
  const [contempAnchor, setContempAnchor] = useState(person.deathYear != null ? "death" : "birth");
  const [range, setRange] = useState(10);
  const MAX_RANGE = 20;

  // Same Field
  const [occupations, setOccupations] = useState(null);
  const [occupationsLoading, setOccupationsLoading] = useState(false);
  const [selectedOccupationId, setSelectedOccupationId] = useState(null);
  const [sameFieldResults, setSameFieldResults] = useState(null);
  const [sameFieldLoading, setSameFieldLoading] = useState(false);
  const [sameFieldLimit, setSameFieldLimit] = useState(5);

  const [addingId, setAddingId] = useState(null);
  const blockRef = useRef(null);
  const color = getColorForId(person.id);

  const bYear = person.birthYear ?? startYear;
  const dYear = person.deathYear ?? new Date().getFullYear();
  const leftPx = (bYear - startYear) * pixelsPerYear;
  const widthPx = Math.max((dYear - bYear) * pixelsPerYear, 4);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(person.nameEn || person.name)}`;
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
    fetchPersonImage(person.nameEn || person.name).then((url) => {
      _imageCache.set(person.id, url ?? null);
      setImage(url ?? null);
    }).catch(() => { _imageCache.set(person.id, null); setImage(null); });
  }, [person.id, person.name]);

  // Lazy-loaded on first section open
  function loadRelated() {
    const key = `${person.id}:${lang}`;
    if (_relatedCache.has(key)) { setRelated(_relatedCache.get(key)); return; }
    setRelatedLoading(true);
    fetchRelatedPersons(person.id, lang)
      .then((d) => { _relatedCache.set(key, d); setRelated(d); })
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }

  async function searchContemporaries() {
    const centerYear = contempAnchor === "birth" ? person.birthYear : person.deathYear;
    if (centerYear == null) return;
    const key = `${person.id}:${contempAnchor}:${range}`;
    if (_contempCache.has(key)) { setContempResults(_contempCache.get(key)); return; }
    setContempLoading(true);
    setContempResults(null);
    try {
      const results = await getPantheonContemporaries(centerYear, range, person.name);
      _contempCache.set(key, results);
      setContempResults(results);
    } catch {
      setContempResults([]);
    } finally {
      setContempLoading(false);
    }
  }

  function loadOccupations() {
    const key = `${person.id}:${lang}`;
    if (_occupationsCache.has(key)) { setOccupations(_occupationsCache.get(key)); return; }
    setOccupationsLoading(true);
    fetchOccupations(person.id, lang)
      .then((d) => { _occupationsCache.set(key, d); setOccupations(d); })
      .catch(() => setOccupations([]))
      .finally(() => setOccupationsLoading(false));
  }

  function handleOccupationClick(occId) {
    setSelectedOccupationId(occId);
    const key = `${person.id}:${occId}:${sameFieldLimit}:${lang}`;
    if (_sameFieldCache.has(key)) { setSameFieldResults(_sameFieldCache.get(key)); return; }
    setSameFieldLoading(true);
    setSameFieldResults(null);
    fetchSameField(person.id, occId, person.birthYear, lang, sameFieldLimit)
      .then((d) => { _sameFieldCache.set(key, d); setSameFieldResults(d); })
      .catch(() => setSameFieldResults([]))
      .finally(() => setSameFieldLoading(false));
  }

  async function handleAdd(relPerson) {
    if (addingId || existingIds?.has(relPerson.id)) return;
    setAddingId(relPerson.id);
    try {
      let entityId = relPerson.id;
      if (relPerson.id.startsWith('pantheon:')) {
        entityId = await fetchQidFromWikipedia(relPerson.wikipediaName);
        if (!entityId) return;
        _pantheonQidCache.set(relPerson.id, entityId);
        sessionStorage.setItem('_pqc', JSON.stringify([..._pantheonQidCache]));
        if (existingIds?.has(entityId)) return;
      }
      const full = await fetchEntityById(entityId, lang);
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
                : <span className="text-success">{t.stillAlive}</span>}
            </div>
          </div>

          {/* Contemporaries */}
          <CollapsibleSection title={t.contemporaries} loading={contempLoading} defaultOpen={true} onFirstOpen={searchContemporaries}>
            <div className="space-y-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
              {person.birthYear == null ? (
                <span className="text-xs text-base-content/30">{t.noResults}</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="join">
                      <button
                        className={`join-item btn btn-xs h-5 min-h-0 px-2 ${contempAnchor === "birth" ? "btn-primary" : "btn-ghost border border-base-300"}`}
                        onClick={() => setContempAnchor("birth")}
                        disabled={person.birthYear == null}
                      >
                        {t.birthLabel}{person.birthYear != null ? ` (${person.birthYear})` : ""}
                      </button>
                      <button
                        className={`join-item btn btn-xs h-5 min-h-0 px-2 ${contempAnchor === "death" ? "btn-primary" : "btn-ghost border border-base-300"}`}
                        onClick={() => setContempAnchor("death")}
                        disabled={person.deathYear == null}
                      >
                        {t.deathLabel}{person.deathYear != null ? ` (${person.deathYear})` : ""}
                      </button>
                    </div>
                    <span className="text-xs text-base-content/40">±</span>
                    <input
                      type="number"
                      className="input input-xs input-ghost w-10 text-center px-0.5 h-5 min-h-0"
                      value={range} min={1} max={MAX_RANGE}
                      onChange={(e) => setRange(Math.max(1, Math.min(MAX_RANGE, parseInt(e.target.value) || 5)))}
                    />
                    <span className="text-xs text-base-content/40">{t.years}</span>
                  </div>
                  {(() => {
                    const centerYear = contempAnchor === "birth" ? person.birthYear : person.deathYear;
                    if (centerYear == null) return null;
                    return (
                      <p className="text-xs text-base-content/40 italic">
                        {t.peopleBorn(centerYear - range, centerYear + range)}
                      </p>
                    );
                  })()}
                  <button
                    className="btn btn-sm btn-primary w-full"
                    onClick={searchContemporaries}
                    disabled={contempLoading || (contempAnchor === "birth" ? person.birthYear == null : person.deathYear == null)}
                  >
                    {contempLoading ? <span className="loading loading-spinner loading-xs" /> : t.search}
                  </button>
                  {contempResults != null && !contempLoading && (
                    <div className="flex flex-wrap gap-1">
                      {contempResults.length > 0
                        ? contempResults.map((r) => (
                            <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                          ))
                        : <span className="text-xs text-base-content/30">{t.noResults}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleSection>

          {/* Same Field */}
          <CollapsibleSection key={`field-${lang}`} title={t.sameField} loading={occupationsLoading || sameFieldLoading} defaultOpen={false} onFirstOpen={loadOccupations}>
            <div className="space-y-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
              {occupations && occupations.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {occupations.map((occ) => (
                      <button
                        key={occ.id}
                        className={`text-xs rounded px-1.5 py-0.5 transition-colors ${
                          selectedOccupationId === occ.id
                            ? "bg-primary text-white"
                            : "bg-base-200 text-base-content/70 hover:bg-base-300"
                        }`}
                        onClick={() => handleOccupationClick(occ.id)}
                      >
                        {occ.name}
                      </button>
                    ))}
                  </div>
                  {selectedOccupationId && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-base-content/40">{t.top}</span>
                      <input
                        type="number"
                        className="input input-xs input-ghost w-8 text-center px-0 h-5 min-h-0"
                        value={sameFieldLimit} min={1} max={10}
                        onChange={(e) => setSameFieldLimit(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                      />
                    </div>
                  )}
                  {!selectedOccupationId && (
                    <p className="text-xs text-base-content/30 italic">{t.selectOccupation}</p>
                  )}
                  {sameFieldResults != null && !sameFieldLoading && (
                    <div className="flex flex-wrap gap-1">
                      {sameFieldResults.length > 0
                        ? sameFieldResults.map((r) => (
                            <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                          ))
                        : <span className="text-xs text-base-content/30">{t.noResults}</span>}
                    </div>
                  )}
                </>
              ) : !occupationsLoading ? (
                <span className="text-xs text-base-content/30">{t.noOccupations}</span>
              ) : null}
            </div>
          </CollapsibleSection>

          {/* Related persons */}
          <CollapsibleSection key={`rel-${lang}`} title={t.relationsInfluences} loading={relatedLoading} defaultOpen={false} onFirstOpen={loadRelated}>
            {groupedRelated && Object.keys(groupedRelated).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(groupedRelated).map(([type, persons]) => (
                  <div key={type}>
                    <span className="text-xs text-base-content/40">{t.relType(type)}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {persons.map((r) => (
                        <PersonChip key={r.id} person={r} onAdd={handleAdd} existingIds={existingIds} addingId={addingId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : !relatedLoading ? (
              <span className="text-xs text-base-content/30">{t.noWikidataEntries}</span>
            ) : null}
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
