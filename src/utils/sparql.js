const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const SEARCH_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "ThoseBefore/1.0 (github.com/thosebefore)";

/**
 * Fetch with automatic retry on 429 (rate limit).
 */
async function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  const signal = options.signal;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < retries) {
        const retryAfter = resp.headers.get("Retry-After");
        const wait = retryAfter ? parseFloat(retryAfter) * 1000 : (attempt + 1) * 2000;
        await abortableDelay(wait, signal);
        continue;
      }
      return resp;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (attempt === retries) throw e;
      await abortableDelay((attempt + 1) * 2000, signal);
    }
  }
}

/**
 * Step 1: Fast text search via wbsearchentities API.
 * Returns up to `limit` candidate items with id, label, description.
 */
export async function searchEntities(searchTerm, limit = 20, signal) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: searchTerm,
    language: "en",
    type: "item",
    limit: String(limit),
    format: "json",
    origin: "*",
  });
  const resp = await fetchWithRetry(`${SEARCH_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal,
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
export async function fetchPersonDetails(ids, signal) {
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
  const data = await runSparqlQuery(query, signal);
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
export async function searchPersons(searchTerm, filters = {}, signal) {
  // 1. Fast text search
  const candidates = await searchEntities(searchTerm, 30, signal);
  if (!candidates.length) return [];
  if (signal?.aborted) return [];

  // 2. Fetch details + filter to humans only
  const ids = candidates.map((c) => c.id);
  const detailsMap = await fetchPersonDetails(ids, signal);

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
 * Lookup multiple entities by Wikidata ID in batch (used for URL state restore).
 * Returns persons in the same order as the input ids array.
 */
export async function fetchEntitiesByIds(ids, lang = "en") {
  if (!ids.length) return [];

  // 1 SPARQL call for all IDs
  const detailsMap = await fetchPersonDetails(ids);

  // 1 wbgetentities call for all IDs (max 50 per request — batch if needed)
  const BATCH = 50;
  const labelsMap = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels|descriptions",
      format: "json",
      origin: "*",
    });
    // Append languages manually to avoid URLSearchParams encoding | as %7C
    const url = `${SEARCH_API}?${params}&languages=${lang}|en`;
    const resp = await fetchWithRetry(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    const data = await resp.json();
    for (const [id, entity] of Object.entries(data.entities || {})) {
      labelsMap[id] = {
        name: entity.labels?.[lang]?.value || entity.labels?.en?.value || id,
        nameEn: entity.labels?.en?.value || id,
        description: entity.descriptions?.[lang]?.value || entity.descriptions?.en?.value || "",
      };
    }
  }

  return ids
    .filter((id) => detailsMap[id])
    .map((id) => ({ id, ...labelsMap[id], ...detailsMap[id] }));
}

/**
 * Lookup a single entity by Wikidata ID (used for URL state restore and adding from modal).
 */
export async function fetchEntityById(id, lang = "en") {
  const persons = await fetchEntitiesByIds([id], lang);
  return persons[0] ?? null;
}

/**
 * Format a year as an xsd:dateTime string for SPARQL filters.
 * Handles BCE years (negative) correctly.
 */
function toSparqlDate(year, month = 1, day = 1) {
  const sign = year < 0 ? "-" : "";
  const abs = String(Math.abs(year)).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `"${sign}${abs}-${mm}-${dd}T00:00:00Z"^^xsd:dateTime`;
}

/**
 * Fetch top 5 notable contemporaries.
 * mode "deaths": people who died within [centerYear ± range] (P570)
 * mode "births": people who were born within [centerYear ± range] (P569)
 *
 * Two-step: SPARQL for IDs (fast, no sitelinks join) + wbgetentities for ranking.
 */
export async function fetchContemporaries(personId, centerYear, mode, range = 5, limit = 5, lang = "en") {
  const property = mode === "births" ? "P569" : "P570";
  const fromYear = centerYear - range;
  const toYear = centerYear + range;

  // Step 1: SPARQL — date filter + sitelinks threshold in one query.
  // FILTER on sitelinks (no ORDER BY) avoids the 502 that ORDER BY DESC(?sitelinks) causes.
  // Sitelinks are returned directly so Step 2 doesn't need to fetch them.
  // Step 1: date-only SPARQL — no P31=Q5 join (millions of humans = expensive).
  // P569/P570 date index is selective enough; non-human entities with dates are rare
  // and filtered out in Step 2 via missing label check.
  const query = `
SELECT DISTINCT ?person WHERE {
  ?person wdt:${property} ?date .
  FILTER(?date >= ${toSparqlDate(fromYear)} &&
         ?date < ${toSparqlDate(toYear + 1)} &&
         ?person != wd:${personId})
}
LIMIT 50
`.trim();
  const sparqlData = await runSparqlQuery(query);
  const ids = sparqlData.results.bindings.map((b) => b.person.value.split("/").pop());
  if (!ids.length) return [];

  // Step 2: fetch labels + descriptions + sitelinks for ranking
  // languages appended manually to avoid URLSearchParams encoding | as %7C
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "labels|descriptions|sitelinks",
    format: "json",
    origin: "*",
  });
  const resp = await fetchWithRetry(`${SEARCH_API}?${params}&languages=${lang}|en`, { headers: { "User-Agent": USER_AGENT } });
  const data = await resp.json();

  return Object.values(data.entities || {})
    .filter((e) => e.id && !e.missing && (e.labels?.en || e.labels?.de)) // filter non-humans (no label)
    .map((e) => ({
      id: e.id,
      name: e.labels?.[lang]?.value || e.labels?.en?.value || e.id,
      description: e.descriptions?.[lang]?.value || e.descriptions?.en?.value || "",
      sitelinks: e.sitelinks ? Object.keys(e.sitelinks).length : 0,
    }))
    .sort((a, b) => b.sitelinks - a.sitelinks)
    .slice(0, limit);
}

/**
 * Fetch person thumbnail via Wikipedia REST summary API.
 * Returns image URL string or null.
 */
export async function fetchPersonImage(name) {
  try {
    const title = encodeURIComponent(name.replace(/ /g, "_"));
    const resp = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch occupations (P106) for a person with labels in the given language.
 * Returns array of { id, name }
 */
export async function fetchOccupations(personId, lang = "en") {
  const langPriority = lang === "de" ? "de,en" : "en,de";
  const query = `
SELECT DISTINCT ?occ ?occLabel WHERE {
  wd:${personId} wdt:P106 ?occ .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${langPriority}" }
}
`.trim();
  const data = await runSparqlQuery(query);
  return data.results.bindings.map((b) => ({
    id: b.occ.value.split("/").pop(),
    name: b.occLabel?.value || b.occ.value.split("/").pop(),
  }));
}

/**
 * Fetch most notable persons sharing an occupation, filtered by birth year ±50 years.
 * Returns array of { id, name, nameEn, description, sitelinks }
 */
export async function fetchSameField(personId, occupationId, birthYear, lang = "en", limit = 5) {
  const dateFilter = birthYear != null
    ? `?person wdt:P569 ?birth .
  FILTER(?birth >= ${toSparqlDate(birthYear - 50)} &&
         ?birth < ${toSparqlDate(birthYear + 51)})`
    : "";
  const query = `
SELECT DISTINCT ?person WHERE {
  ?person wdt:P106 wd:${occupationId} .
  ${dateFilter}
  FILTER(?person != wd:${personId})
}
LIMIT 50
`.trim();
  const sparqlData = await runSparqlQuery(query);
  const ids = sparqlData.results.bindings.map((b) => b.person.value.split("/").pop());
  if (!ids.length) return [];

  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "labels|descriptions|sitelinks",
    format: "json",
    origin: "*",
  });
  const resp = await fetchWithRetry(`${SEARCH_API}?${params}&languages=${lang}|en`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await resp.json();

  return Object.values(data.entities || {})
    .filter((e) => e.id && !e.missing && (e.labels?.en || e.labels?.[lang]))
    .map((e) => ({
      id: e.id,
      name: e.labels?.[lang]?.value || e.labels?.en?.value || e.id,
      nameEn: e.labels?.en?.value || e.id,
      description: e.descriptions?.[lang]?.value || e.descriptions?.en?.value || "",
      sitelinks: e.sitelinks ? Object.keys(e.sitelinks).length : 0,
    }))
    .sort((a, b) => b.sitelinks - a.sitelinks)
    .slice(0, limit);
}

/**
 * Fetch related persons for a given entity ID.
 * Returns array of { id, name, relType }
 */
export async function fetchRelatedPersons(id, lang = "en") {
  const langPriority = lang === "de" ? "de,en" : "en,de";
  const query = `
SELECT DISTINCT ?rel ?relLabel ?relDescription ?relType WHERE {
  VALUES ?person { wd:${id} }
  {
    ?person wdt:P26 ?rel . BIND("Spouse" AS ?relType)
  } UNION {
    ?person wdt:P40 ?rel . BIND("Child" AS ?relType)
  } UNION {
    ?person wdt:P22 ?rel . BIND("Father" AS ?relType)
  } UNION {
    ?person wdt:P25 ?rel . BIND("Mother" AS ?relType)
  } UNION {
    ?person wdt:P3373 ?rel . BIND("Sibling" AS ?relType)
  } UNION {
    ?person wdt:P1066 ?rel . BIND("Student of" AS ?relType)
  } UNION {
    ?person wdt:P802 ?rel . BIND("Student" AS ?relType)
  } UNION {
    ?person wdt:P737 ?rel . BIND("Influenced by" AS ?relType)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${langPriority}" }
}
LIMIT 12
`.trim();
  const data = await runSparqlQuery(query);
  return data.results.bindings.map((b) => ({
    id: b.rel.value.split("/").pop(),
    name: b.relLabel?.value || b.rel.value.split("/").pop(),
    description: b.relDescription?.value || "",
    relType: b.relType?.value || "",
  }));
}

export async function runSparqlQuery(query, signal) {
  const body = new URLSearchParams({ query, format: "json" });
  const resp = await fetchWithRetry(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
    signal,
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

export async function fetchQidFromWikipedia(articleTitle) {
  const params = new URLSearchParams({
    action: "query",
    titles: articleTitle,
    prop: "pageprops",
    ppprop: "wikibase_item",
    format: "json",
    origin: "*",
  });
  const resp = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const data = await resp.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0]?.pageprops?.wikibase_item ?? null;
}

// Keep for backward compatibility (used in useTimeline.js URL restore)
export { fetchEntityById as buildEntityQuery };
export function parsePersonResults() { return []; } // unused now
