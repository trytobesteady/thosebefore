import { useState, useEffect } from 'react';
import { publishTimeline, fetchRecentTimelines } from '../utils/worker';
import { useLang } from '../i18n';

function timeAgo(iso, lang) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return lang === 'de' ? `vor ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'de' ? `vor ${hrs}h` : `${hrs}h ago`;
  return lang === 'de' ? `vor ${Math.floor(hrs / 24)}d` : `${Math.floor(hrs / 24)}d ago`;
}

export default function PublishModal({ persons, onClose }) {
  const { t, lang } = useLang();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('idle'); // idle | publishing | done | error
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    fetchRecentTimelines().then(setRecent).catch(() => setRecent([]));
  }, []);

  async function handlePublish() {
    setStatus('publishing');
    try {
      const result = await publishTimeline(title, persons);
      setShareUrl(result.url);
      setStatus('done');
      fetchRecentTimelines().then(setRecent).catch(() => {});
    } catch {
      setStatus('error');
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('', shareUrl);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base-100 border border-base-300 rounded-xl shadow-2xl p-5 w-full max-w-sm">
        <button
          className="absolute top-3 right-3 text-base-content/30 hover:text-base-content/70 transition-colors"
          onClick={onClose}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="font-semibold text-sm mb-3">{t.publishTitle}</h2>

        {status !== 'done' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="input input-sm input-bordered flex-1 text-sm"
                placeholder={t.publishPlaceholder}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && status === 'idle' && persons.length >= 2 && handlePublish()}
                autoFocus
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={handlePublish}
                disabled={status === 'publishing' || persons.length < 2}
              >
                {status === 'publishing'
                  ? <span className="loading loading-spinner loading-xs" />
                  : t.publish}
              </button>
            </div>
            {persons.length < 2 && (
              <p className="text-xs text-base-content/40">{t.publishMinPersons}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2">
            <span className="text-xs text-base-content/70 flex-1 truncate">{shareUrl}</span>
            <button
              className={`btn btn-xs shrink-0 ${copied ? 'btn-success' : 'btn-outline'}`}
              onClick={copyUrl}
            >
              {copied ? t.copied : t.copyLink}
            </button>
          </div>
        )}

        {status === 'error' && (
          <p className="text-xs text-error mt-2">{t.publishError}</p>
        )}

        {/* Recent Timelines */}
        <div className="border-t border-base-200 mt-4 pt-3">
          <p className="text-xs uppercase tracking-wide text-base-content/40 font-medium mb-2">{t.recentTimelines}</p>
          {recent == null ? (
            <div className="flex justify-center py-3">
              <span className="loading loading-spinner loading-xs" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-xs text-base-content/30 italic">{t.noRecentTimelines}</p>
          ) : (
            <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1">
              {recent.map(item => (
                <a
                  key={item.id}
                  href={`?share=${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-base-200 transition-colors"
                  onClick={onClose}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-base-content truncate leading-tight">{item.title}</div>
                    <div className="text-xs text-base-content/40">
                      {item.personCount} {lang === 'de' ? 'Personen' : 'persons'}
                      {item.startYear != null && ` · ${item.startYear}–${item.endYear}`}
                    </div>
                  </div>
                  <span className="text-xs text-base-content/30 shrink-0">{timeAgo(item.createdAt, lang)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
