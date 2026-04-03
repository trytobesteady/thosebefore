import { useState, useRef, useEffect } from "react";
import { useWikidataSearch } from "../hooks/useWikidataSearch";

export default function SearchBar({ onAdd, existingIds }) {
  const { query, setQuery, filters, setFilters, results, loading } = useWikidataSearch();
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setOpen(results.length > 0 || (query.length >= 2 && !loading));
  }, [results, query, loading]);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(person) {
    onAdd(person);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && results.length > 0) {
      const first = results.find((r) => !existingIds.has(r.id));
      if (first) handleSelect(first);
    }
    if (e.key === "Escape") setOpen(false);
  }

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            className="input input-bordered w-full pr-10"
            placeholder="Person suchen (z.B. Leonardo da Vinci)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="loading loading-spinner loading-xs text-base-content/40" />
            </span>
          )}
        </div>
        <button
          className={`btn btn-sm btn-ghost ${showFilters ? "btn-active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
          title="Filter"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 6a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm4 6a1 1 0 011-1h2a1 1 0 010 2h-2a1 1 0 01-1-1z" />
          </svg>
          Filter
        </button>
      </div>

      {showFilters && (
        <div className="mt-2 p-3 bg-base-200 rounded-lg flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-base-content/60 whitespace-nowrap">Geb. von</span>
            <input
              type="number"
              className="input input-bordered input-xs w-24"
              placeholder="z.B. 1400"
              value={filters.birthYearMin}
              onChange={(e) => updateFilter("birthYearMin", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-base-content/60 whitespace-nowrap">bis</span>
            <input
              type="number"
              className="input input-bordered input-xs w-24"
              placeholder="z.B. 1600"
              value={filters.birthYearMax}
              onChange={(e) => updateFilter("birthYearMax", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-base-content/60 whitespace-nowrap">Tod von</span>
            <input
              type="number"
              className="input input-bordered input-xs w-24"
              placeholder="z.B. 1500"
              value={filters.deathYearMin}
              onChange={(e) => updateFilter("deathYearMin", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-base-content/60 whitespace-nowrap">bis</span>
            <input
              type="number"
              className="input input-bordered input-xs w-24"
              placeholder="z.B. 1700"
              value={filters.deathYearMax}
              onChange={(e) => updateFilter("deathYearMax", e.target.value)}
            />
          </label>
        </div>
      )}

      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-xl overflow-auto max-h-80">
          {results.length === 0 && !loading && query.length >= 2 ? (
            <li className="px-4 py-3 text-base-content/50 text-sm">Keine Ergebnisse</li>
          ) : (
            results.map((person) => {
              const already = existingIds.has(person.id);
              return (
                <li
                  key={person.id}
                  className={`px-4 py-2.5 cursor-pointer hover:bg-base-200 transition-colors border-b border-base-200 last:border-0 ${already ? "opacity-40 cursor-default" : ""}`}
                  onClick={() => !already && handleSelect(person)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{person.name}</span>
                      {person.description && (
                        <span className="text-xs text-base-content/60 ml-2 truncate">{person.description}</span>
                      )}
                      <div className="text-xs text-base-content/50 mt-0.5">
                        {person.birthYear != null ? person.birthYear : "?"}
                        {" – "}
                        {person.deathYear != null ? person.deathYear : "noch lebend"}
                      </div>
                    </div>
                    {already && <span className="badge badge-sm badge-ghost shrink-0">bereits hinzugefügt</span>}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
