import { useMemo, useState, useEffect } from "react";
import SearchBar from "./components/SearchBar";
import TimelineCanvas from "./components/TimelineCanvas";
import { useTimeline } from "./hooks/useTimeline";
import { encodeState } from "./utils/urlState";

export default function App() {
  const { persons, sortMode, sortDir, loadingState, addPerson, removePerson, reorder, sortByBirth, sortByDeath, toggleSortDir } = useTimeline();
  const [copied, setCopied] = useState(false);

  const existingIds = useMemo(() => new Set(persons.map((p) => p.id)), [persons]);

  // Keep URL in sync with current persons
  useEffect(() => {
    if (loadingState) return; // don't overwrite URL while initial load is still running
    const stateStr = encodeState(persons);
    window.history.replaceState(null, "", stateStr || window.location.pathname);
  }, [persons, loadingState]);

  async function handleShare() {
    const stateStr = encodeState(persons);
    const url = window.location.origin + window.location.pathname + stateStr;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Kopiere diese URL:", url);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-base-100" data-theme="light">
      {/* Header */}
      <header className="border-b border-base-200 bg-base-100 shrink-0">
        {/* Row 1: title left, share right */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-base-content">Biographical Timeline</span>
          </div>
          <button
            className={`btn btn-sm ${copied ? "btn-success" : "btn-outline"}`}
            onClick={handleShare}
            disabled={persons.length === 0}
            title="Copy URL to clipboard"
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </>
            )}
          </button>
        </div>
        {/* Row 2: search centered */}
        <div className="flex justify-center px-4 pb-2.5">
          <div className="w-full max-w-xl">
            <SearchBar onAdd={addPerson} existingIds={existingIds} />
          </div>
        </div>
      </header>

      {/* Initial URL loading overlay */}
      {loadingState && (
        <div className="fixed inset-0 z-[10000] bg-base-100/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary" />
          <div className="font-medium text-base-content">Loading timeline…</div>
        </div>
      )}

      {/* Timeline */}
      <main className="flex-1 min-h-0 flex flex-col">
        <TimelineCanvas
          persons={persons}
          sortMode={sortMode}
          sortDir={sortDir}
          onRemove={removePerson}
          onReorder={reorder}
          onSortByBirth={sortByBirth}
          onSortByDeath={sortByDeath}
          onToggleSortDir={toggleSortDir}
          onAdd={addPerson}
          existingIds={existingIds}
        />
      </main>

      {persons.length > 0 && (
        <footer className="border-t border-base-200 px-4 py-1.5 text-xs text-base-content/30 flex gap-4 shrink-0">
          <span>{persons.length} person{persons.length !== 1 ? "s" : ""}</span>
          <span>Data: Wikidata (CC0)</span>
        </footer>
      )}
    </div>
  );
}
