const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function nanoid(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // POST /timeline — publish a new timeline
    if (request.method === 'POST' && pathname === '/timeline') {
      let body;
      try { body = await request.json(); } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const { title, persons, startYear, endYear } = body;
      if (!Array.isArray(persons) || persons.length === 0) {
        return json({ error: 'No persons provided' }, 400);
      }

      const id = nanoid();
      const createdAt = new Date().toISOString();
      const stored = {
        id,
        title: title,
        persons: persons.map(p => ({ id: p.id, name: p.name })),
        startYear,
        endYear,
        createdAt,
      };

      await env.TIMELINES.put(`timeline:${id}`, JSON.stringify(stored), {
        expirationTtl: 60 * 60 * 24 * 90, // 90 days
      });

      // Prepend to recent list (max 20)
      const recentRaw = await env.TIMELINES.get('recent');
      const recent = recentRaw ? JSON.parse(recentRaw) : [];
      recent.unshift({ id, title: stored.title, personCount: persons.length, startYear, endYear, createdAt });
      if (recent.length > 20) recent.pop();
      await env.TIMELINES.put('recent', JSON.stringify(recent));

      return json({ id, url: `https://trytobesteady.github.io/thosebefore/?share=${id}` });
    }

    // GET /timelines — fetch recent timelines
    if (request.method === 'GET' && pathname === '/timelines') {
      const raw = await env.TIMELINES.get('recent');
      return json(raw ? JSON.parse(raw) : []);
    }

    // GET /timeline/:id — fetch a specific timeline
    if (request.method === 'GET' && pathname.startsWith('/timeline/')) {
      const id = pathname.slice('/timeline/'.length);
      const raw = await env.TIMELINES.get(`timeline:${id}`);
      if (!raw) return json({ error: 'Not found' }, 404);
      return json(JSON.parse(raw));
    }

    return json({ error: 'Not found' }, 404);
  },
};
