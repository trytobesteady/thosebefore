/**
 * One-time enrichment script for pantheon.csv
 * Adds columns: wikidata_id, name_de, description_en, description_de
 *
 * Run from project root: node enrich.mjs
 * Safe to interrupt (Ctrl+C) and restart — progress is saved to enrich-checkpoint.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const BATCH = 25;
const DELAY = 1000;
const CHECKPOINT = 'enrich-checkpoint.json';
const BASE_COLS = 17; // original pantheon.csv column count (indices 0–16)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCSVLine(line) {
  const result = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let val = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      result.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}

function escapeCSVField(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function saveCheckpoint(data) {
  writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2));
}

async function fetchWithRetry(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ThoseBefore-Enrichment/1.0 (github.com/trytobesteady/thosebefore)' }
      });
      if (resp.status === 429) {
        const retryAfter = parseFloat(resp.headers.get('Retry-After') || '0');
        const wait = Math.max(retryAfter * 1000, 10000) + 2000;
        console.log(`\n  Rate limited — waiting ${(wait / 1000).toFixed(0)}s before retrying...`);
        await sleep(wait);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep((attempt + 1) * 3000);
    }
  }
}

async function getQidsFromPageIds(pageIds) {
  const data = await fetchWithRetry(
    `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageIds.join('|')}&prop=pageprops&ppprop=wikibase_item&format=json`
  );
  const result = {};
  for (const [pageId, page] of Object.entries(data?.query?.pages || {})) {
    const qid = page?.pageprops?.wikibase_item;
    if (qid) result[pageId] = qid;
  }
  return result;
}

async function getDeLabels(qids) {
  const data = await fetchWithRetry(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join('|')}&props=labels&languages=de&format=json`
  );
  const result = {};
  for (const [qid, entity] of Object.entries(data?.entities || {})) {
    const label = entity?.labels?.de?.value;
    if (label) result[qid] = label;
  }
  return result;
}

async function getDescriptions(qids) {
  const data = await fetchWithRetry(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join('|')}&props=descriptions&languages=en|de&format=json`
  );
  const result = {};
  for (const [qid, entity] of Object.entries(data?.entities || {})) {
    result[qid] = {
      en: entity?.descriptions?.en?.value || '',
      de: entity?.descriptions?.de?.value || '',
    };
  }
  return result;
}

// --- Main ---

const text = readFileSync('public/pantheon.csv', 'utf8');
const lines = text.trim().split('\n');
const dataLines = lines.slice(1).map(l => l.trim()).filter(Boolean);
const pageIds = dataLines.map(l => parseCSVLine(l)[0]).filter(Boolean);

console.log(`Loaded ${dataLines.length} entries\n`);

// Load checkpoint
let checkpoint = { pageIdToQid: {}, qidToNameDe: {}, qidToDescriptions: {} };
if (existsSync(CHECKPOINT)) {
  const saved = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  checkpoint = { qidToDescriptions: {}, ...saved };
  console.log(`Resuming from checkpoint — QIDs: ${Object.keys(checkpoint.pageIdToQid).length}, DE labels: ${Object.keys(checkpoint.qidToNameDe).length}, Descriptions: ${Object.keys(checkpoint.qidToDescriptions).length}\n`);
}
const { pageIdToQid, qidToNameDe, qidToDescriptions } = checkpoint;

// Step 1: Wikipedia page ID → Wikidata QID
const pendingPageIds = pageIds.filter(id => !(id in pageIdToQid));
if (pendingPageIds.length > 0) {
  console.log(`Step 1/3: Fetching QIDs — ${pendingPageIds.length} remaining (${Math.ceil(pendingPageIds.length / BATCH)} batches)...`);
  for (let i = 0; i < pendingPageIds.length; i += BATCH) {
    const batch = pendingPageIds.slice(i, i + BATCH);
    const result = await getQidsFromPageIds(batch);
    Object.assign(pageIdToQid, result);
    for (const id of batch) if (!(id in pageIdToQid)) pageIdToQid[id] = '';
    saveCheckpoint({ pageIdToQid, qidToNameDe, qidToDescriptions });
    process.stdout.write(`\r  ${Math.min(i + BATCH, pendingPageIds.length)} / ${pendingPageIds.length}`);
    if (i + BATCH < pendingPageIds.length) await sleep(DELAY);
  }
  console.log(`\n  Done — ${Object.values(pageIdToQid).filter(Boolean).length} QIDs found\n`);
} else {
  console.log(`Step 1/3: QIDs already complete\n`);
}

// Step 2: Wikidata QID → German label
const allQids = [...new Set(Object.values(pageIdToQid).filter(Boolean))];
const pendingQids = allQids.filter(qid => !(qid in qidToNameDe));
if (pendingQids.length > 0) {
  console.log(`Step 2/3: Fetching German labels — ${pendingQids.length} remaining (${Math.ceil(pendingQids.length / BATCH)} batches)...`);
  for (let i = 0; i < pendingQids.length; i += BATCH) {
    const batch = pendingQids.slice(i, i + BATCH);
    const result = await getDeLabels(batch);
    Object.assign(qidToNameDe, result);
    for (const qid of batch) if (!(qid in qidToNameDe)) qidToNameDe[qid] = '';
    saveCheckpoint({ pageIdToQid, qidToNameDe, qidToDescriptions });
    process.stdout.write(`\r  ${Math.min(i + BATCH, pendingQids.length)} / ${pendingQids.length}`);
    if (i + BATCH < pendingQids.length) await sleep(DELAY);
  }
  console.log(`\n  Done — ${Object.values(qidToNameDe).filter(Boolean).length} German labels found\n`);
} else {
  console.log(`Step 2/3: German labels already complete\n`);
}

// Step 3: Wikidata QID → EN + DE descriptions
const pendingDescQids = allQids.filter(qid => !(qid in qidToDescriptions));
if (pendingDescQids.length > 0) {
  console.log(`Step 3/3: Fetching descriptions — ${pendingDescQids.length} remaining (${Math.ceil(pendingDescQids.length / BATCH)} batches)...`);
  for (let i = 0; i < pendingDescQids.length; i += BATCH) {
    const batch = pendingDescQids.slice(i, i + BATCH);
    const result = await getDescriptions(batch);
    Object.assign(qidToDescriptions, result);
    for (const qid of batch) if (!(qid in qidToDescriptions)) qidToDescriptions[qid] = { en: '', de: '' };
    saveCheckpoint({ pageIdToQid, qidToNameDe, qidToDescriptions });
    process.stdout.write(`\r  ${Math.min(i + BATCH, pendingDescQids.length)} / ${pendingDescQids.length}`);
    if (i + BATCH < pendingDescQids.length) await sleep(DELAY);
  }
  const withDesc = Object.values(qidToDescriptions).filter(d => d.en || d.de).length;
  console.log(`\n  Done — ${withDesc} descriptions found\n`);
} else {
  console.log(`Step 3/3: Descriptions already complete\n`);
}

// Write enriched CSV — always reconstruct from base columns + checkpoint data
console.log('Writing pantheon.csv...');
const newHeader = [
  'article_id,full_name,sex,birth_year,city,state,country,continent,latitude,longitude,occupation,industry,domain,article_languages,page_views,average_views,historical_popularity_index',
  'wikidata_id', 'name_de', 'description_en', 'description_de',
].join(',');

const newLines = dataLines.map(originalLine => {
  const cols = parseCSVLine(originalLine);
  const base = cols.slice(0, BASE_COLS).map(escapeCSVField).join(',');
  const qid = pageIdToQid[cols[0]] || '';
  const nameDe = qid ? (qidToNameDe[qid] || '') : '';
  const descEn = qid ? (qidToDescriptions[qid]?.en || '') : '';
  const descDe = qid ? (qidToDescriptions[qid]?.de || '') : '';
  return [base, escapeCSVField(qid), escapeCSVField(nameDe), escapeCSVField(descEn), escapeCSVField(descDe)].join(',');
});

writeFileSync('public/pantheon.csv', [newHeader, ...newLines].join('\n'), 'utf8');

console.log(`Done!`);
console.log(`  QIDs resolved  : ${Object.values(pageIdToQid).filter(Boolean).length} / ${dataLines.length}`);
console.log(`  German names   : ${Object.values(qidToNameDe).filter(Boolean).length} / ${dataLines.length}`);
console.log(`  EN descriptions: ${Object.values(qidToDescriptions).filter(d => d?.en).length} / ${dataLines.length}`);
console.log(`  DE descriptions: ${Object.values(qidToDescriptions).filter(d => d?.de).length} / ${dataLines.length}`);
console.log(`\nYou can delete enrich-checkpoint.json now.`);
