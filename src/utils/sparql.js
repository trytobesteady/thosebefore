const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const SEARCH_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "ThoseBefore/1.0 (github.com/thosebefore)";

/**
 * Step 1: Fast text search via wbsearchentities API.
 * Returns up to `limit` candidate items with id, label, description.
 */
export async function searchEntities(searchTerm, limit = 20) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: searchTerm,
    language: "en",
    type: "item",
    limit: String(limit),
    format: "json",
    origin: "*",
  });
  const resp = await fetch(`${SEARCH_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`Search API error: ${resp.status}`);
  const data = await resp.json();
  return (data.search || []).map((item) => ({
    id: item.id,
    name: item.label || item.id,
    description: item.description || "",
  }));
}

/**
 * Step 2: SPARQL to get birth/death dates, sitelinks, and confirm P31=Q5 (human).
 * Operates on a known list of entity IDs.
 */
export async function fetchPersonDetails(ids) {
  if (!ids.length) return [];
  const values = ids.map((id) => `wd:${id}`).join(" ");
  const query = `
SELECT ?entity ?birthDate ?deathDate ?sitelinks WHERE {
  VALUES ?entity { ${values} }
  ?entity wdt:P31 wd:Q5 .
  OPTIONAL { ?entity wdt:P569 ?birthDate }
  OPTIONAL { ?entity wdt:P570 ?deathDate }
  OPTIONAL { ?entity wikibase:sitelinks ?sitelinks }
}
ORDER BY DESC(?sitelinks)
`.trim();
  const data = await runSparqlQuery(query);
  const map = {};
  for (const b of data.results.bindings) {
    const id = b.entity.value.split("/").pop();
    const birthDate = b.birthDate ? parseDateValue(b.birthDate.value) : null;
    const deathDate = b.deathDate ? parseDateValue(b.deathDate.value) : null;
    if (!map[id]) {
      map[id] = {
        id,
        birthDate,
        deathDate,
        birthYear: birthDate ? birthDate.getFullYear() : null,
        deathYear: deathDate ? deathDate.getFullYear() : null,
        sitelinks: b.sitelinks ? parseInt(b.sitelinks.value) : 0,
      };
    }
  }
  return map;
}

/**
 * Combined: search for persons matching searchTerm, apply optional year filters.
 */
export async function searchPersons(searchTerm, filters = {}) {
  // 1. Fast text search
  const candidates = await searchEntities(searchTerm, 30);
  if (!candidates.length) return [];

  // 2. Fetch details + filter to humans only
  const ids = candidates.map((c) => c.id);
  const detailsMap = await fetchPersonDetails(ids);

  // 3. Merge + apply year filters + sort by sitelinks
  const results = candidates
    .filter((c) => detailsMap[c.id]) // keep only confirmed humans
    .map((c) => ({ ...c, ...detailsMap[c.id] }))
    .filter((p) => {
      const { birthYearMin, birthYearMax, deathYearMin, deathYearMax } = filters;
      if (birthYearMin !== "" && birthYearMin != null && p.birthYear != null && p.birthYear < +birthYearMin) return false;
      if (birthYearMax !== "" && birthYearMax != null && p.birthYear != null && p.birthYear > +birthYearMax) return false;
      if (deathYearMin !== "" && deathYearMin != null && p.deathYear != null && p.deathYear < +deathYearMin) return false;
      if (deathYearMax !== "" && deathYearMax != null && p.deathYear != null && p.deathYear > +deathYearMax) return false;
      return true;
    })
    .sort((a, b) => b.sitelinks - a.sitelinks)
    .slice(0, 10);

  return results;
}

/**
 * Lookup a single entity by Wikidata ID (used for URL state restore).
 */
export async function fetchEntityById(id) {
  const detailsMap = await fetchPersonDetails([id]);
  if (!detailsMap[id]) return null;

  // Get label/description via search API
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: id,
    props: "labels|descriptions",
    languages: "en",
    format: "json",
    origin: "*",
  });
  const resp = await fetch(`${SEARCH_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await resp.json();
  const entity = data.entities?.[id];
  const name = entity?.labels?.en?.value || id;
  const description = entity?.descriptions?.en?.value || "";

  return { id, name, description, ...detailsMap[id] };
}

/**
 * Fetch contemporaries:
 * - diedAtBirth: top 3 notable people who died within [birthYear ± range]
 * - bornAtDeath: top 3 notable people who were born within [deathYear ± range]
 */
export async function fetchContemporaries(personId, birthYear, deathYear, range = 15) {
  function buildQuery(filterProp, yearCenter) {
    const lo = yearCenter - range;
    const hi = yearCenter + range;
    return `
SELECT DISTINCT ?entity ?entityLabel ?sitelinks WHERE {
  ?entity wdt:P31 wd:Q5 .
  ?entity wdt:${filterProp} ?date .
  FILTER(YEAR(?date) >= ${lo} && YEAR(?date) <= ${hi})
  FILTER(?entity != wd:${personId})
  OPTIONAL { ?entity wikibase:sitelinks ?sitelinks }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de" }
}
ORDER BY DESC(?sitelinks)
LIMIT 3`.trim();
  }

  const parseResult = (data) =>
    data.results.bindings.map((b) => ({
      id: b.entity.value.split("/").pop(),
      name: b.entityLabel?.value || b.entity.value.split("/").pop(),
      sitelinks: b.sitelinks ? parseInt(b.sitelinks.value) : 0,
    }));

  const queries = [];
  if (birthYear != null) queries.push(runSparqlQuery(buildQuery("P570", birthYear)).then(parseResult).catch(() => []));
  else queries.push(Promise.resolve([]));
  if (deathYear != null) queries.push(runSparqlQuery(buildQuery("P569", deathYear)).then(parseResult).catch(() => []));
  else queries.push(Promise.resolve([]));

  const [diedAtBirth, bornAtDeath] = await Promise.all(queries);
  return { diedAtBirth, bornAtDeath };
}

/**
 * Fetch related persons for a given entity ID.
 * Returns array of { id, name, relType }
 */
export async function fetchRelatedPersons(id) {
  const query = `
SELECT DISTINCT ?rel ?relLabel ?relType WHERE {
  VALUES ?person { wd:${id} }
  {
    ?person wdt:P26 ?rel . BIND("Ehepartner" AS ?relType)
  } UNION {
    ?person wdt:P40 ?rel . BIND("Kind" AS ?relType)
  } UNION {
    ?person wdt:P22 ?rel . BIND("Vater" AS ?relType)
  } UNION {
    ?person wdt:P25 ?rel . BIND("Mutter" AS ?relType)
  } UNION {
    ?person wdt:P3373 ?rel . BIND("Geschwister" AS ?relType)
  } UNION {
    ?person wdt:P1066 ?rel . BIND("Schüler von" AS ?relType)
  } UNION {
    ?person wdt:P802 ?rel . BIND("Schüler" AS ?relType)
  } UNION {
    ?person wdt:P737 ?rel . BIND("Beeinflusst von" AS ?relType)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en" }
}
LIMIT 12
`.trim();
  const data = await runSparqlQuery(query);
  return data.results.bindings.map((b) => ({
    id: b.rel.value.split("/").pop(),
    name: b.relLabel?.value || b.rel.value.split("/").pop(),
    relType: b.relType?.value || "",
  }));
}

export async function runSparqlQuery(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!resp.ok) throw new Error(`SPARQL error: ${resp.status}`);
  return resp.json();
}

function parseDateValue(value) {
  try {
    const match = value.match(/^([+-]?\d+)-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    if (year === 0) return null;
    const d = new Date(0);
    d.setFullYear(year, month, day);
    return d;
  } catch {
    return null;
  }
}

// Keep for backward compatibility (used in useTimeline.js URL restore)
export { fetchEntityById as buildEntityQuery };
export function parsePersonResults() { return []; } // unused now
