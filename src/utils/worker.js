const WORKER = 'https://thosebefore-worker.thosebefore.workers.dev';

export async function publishTimeline(title, persons) {
  const years = persons.map(p => p.birthYear).filter(y => y != null);
  const endYears = persons.map(p => p.deathYear ?? new Date().getFullYear()).filter(y => y != null);
  const resp = await fetch(`${WORKER}/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title || `${persons[0].name} – ${persons[persons.length - 1].name}`,
      persons: persons.map(p => ({ id: p.id, name: p.name })),
      startYear: years.length ? Math.min(...years) : null,
      endYear: endYears.length ? Math.max(...endYears) : null,
    }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json(); // { id, url }
}

export async function fetchRecentTimelines() {
  const resp = await fetch(`${WORKER}/timelines`);
  if (!resp.ok) return [];
  return resp.json();
}

export async function fetchSharedTimeline(id) {
  const resp = await fetch(`${WORKER}/timeline/${id}`);
  if (!resp.ok) return null;
  return resp.json(); // { id, title, persons: [{id, name}], ... }
}
