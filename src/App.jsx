import { useMemo, useState, useEffect } from "react";
import SearchBar from "./components/SearchBar";
import TimelineCanvas from "./components/TimelineCanvas";
import PublishModal from "./components/PublishModal";
import { useTimeline } from "./hooks/useTimeline";
import { encodeState } from "./utils/urlState";
import { useLang } from "./i18n";

function readThemeCookie() {
  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  const val = match?.[1];
  return val === "dark" ? "dark" : "light";
}

export default function App() {
  const { persons, sortMode, sortDir, loadingState, addPerson, removePerson, reorder, sortByBirth, sortByDeath, toggleSortDir } = useTimeline();
  const [copied, setCopied] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const { t, lang, setLang } = useLang();
  const [theme, setThemeState] = useState(readThemeCookie);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.cookie = `theme=${next};path=/;max-age=31536000`;
    setThemeState(next);
  }

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
      prompt(t.shareFallback, url);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-base-100" data-theme={theme}>
      {/* Header */}
      <header className="border-b border-base-200 bg-base-100 shrink-0">
        {/* Row 1: title left, lang switch + share right */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-base-content">{t.appTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              className="btn btn-xs btn-ghost border border-base-300"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 000 14A7 7 0 0012 5z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {/* Language toggle */}
            <div className="join">
              <button
                className={`join-item btn btn-xs ${lang === "en" ? "btn-primary" : "btn-ghost border border-base-300"}`}
                onClick={() => setLang("en")}
              >
                EN
              </button>
              <button
                className={`join-item btn btn-xs ${lang === "de" ? "btn-primary" : "btn-ghost border border-base-300"}`}
                onClick={() => setLang("de")}
              >
                DE
              </button>
            </div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setShowPublish(true)}
              disabled={persons.length < 2}
              title={t.publishTitle}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2M12 3v12m0-12l-4 4m4-4l4 4" />
              </svg>
              {t.publish}
            </button>
            <button
              className={`btn btn-sm ${copied ? "btn-success" : "btn-outline"}`}
              onClick={handleShare}
              disabled={persons.length === 0}
              title={t.shareTitle}
            >
              {copied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t.copied}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  {t.share}
                </>
              )}
            </button>
          </div>
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
          <div className="font-medium text-base-content">{t.loadingTimeline}</div>
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
          <span>{t.personCount(persons.length)}</span>
          <span>{t.dataCredit}</span>
        </footer>
      )}

      {showPublish && (
        <PublishModal persons={persons} onClose={() => setShowPublish(false)} />
      )}
    </div>
  );
}
