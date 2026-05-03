# thosebefore

An interactive biographical timeline powered by [Wikidata](https://www.wikidata.org/).

**Live:** [bennybaum.de/thosebefore](https://bennybaum.de/thosebefore/)

## What it does

Search for historical persons and place them on a shared timeline. For each person you can open a detail modal and explore:

- **Contemporaries** — notable people born around the same time, anchored on either this person's birth or death year (configurable ± year range, up to ±20 years). Results come from a local [Pantheon](https://pantheon.world/) dataset, ranked by Historical Popularity Index. Years are displayed with era suffixes (BC/CE, v./n. Chr.). Clicking a name adds them to the timeline.
- **Same Field** — prominent people sharing an occupation, filtered by birth year ± 50 years
- **Relations & Influences** — family members, teachers, students, and intellectual influences

Timelines are shareable via URL or published to a public feed. The UI language can be switched between English and German (persisted via cookie); Wikidata labels and descriptions switch accordingly. Dark mode is available and also persisted via cookie.

## Tech stack

- **React 19** + **Vite 8** — no server-side rendering, fully client-side
- **Tailwind CSS v3** + **daisyUI v4**
- **Cloudflare Worker + KV** — serverless backend for the publish/share feature (`worker/index.js`, deployed via Wrangler)
- All biographical data fetched at runtime from public Wikidata APIs:
  - [Wikidata SPARQL endpoint](https://query.wikidata.org/) for structured queries
  - [wbsearchentities](https://www.wikidata.org/w/api.php) for fast text search
  - [wbgetentities](https://www.wikidata.org/w/api.php) for labels, descriptions, and sitelink-based ranking
  - [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) for person thumbnails

## Features

- Add/remove persons; sort by birth year, death year, or drag-and-drop manual order
- Ascending/descending sort toggle
- Zoom control for the timeline axis (persisted via localStorage)
- Person modal: thumbnail, Wikipedia link, three expandable sections (Contemporaries, Same Field, Relations & Influences)
- Shareable URLs (`?p=Q762,Q5592,…`) encoding the full current selection
- **Publish** — saves a timeline to a Cloudflare Worker with a short share URL (`?share=abc123`); auto-titles from first and last person if no title is given (requires ≥ 2 persons)
- **Recent Timelines** — public feed of the last 20 published timelines, accessible via the Publish modal
- DE/EN language switch, dark mode toggle

## Development

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build
npm run preview   # preview production build locally
```

## Pantheon dataset

Contemporaries are served from `public/pantheon.csv`, a local copy of the [Pantheon](https://pantheon.world/) dataset (MIT Media Lab, CC BY 4.0). The file ships with the base columns from Kaggle. To enrich it with pre-resolved Wikidata QIDs and German names (recommended — eliminates a per-click API lookup and enables DE-language chip labels), run:

```bash
node enrich.mjs
```

This takes ~3–5 minutes and rewrites `pantheon.csv` in place, adding four columns: `wikidata_id`, `name_de`, `description_en`, `description_de`. The descriptions power the hover tooltips on Contemporaries chips. The app works without running it; enrichment is purely optional.

To update to a newer Pantheon release, replace `public/pantheon.csv` with a file that has the same column structure, then re-run `enrich.mjs`.

## Deployment

GitHub Actions builds and deploys to `bennybaum.de/thosebefore/` via FTP on every push to `master`. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Data

Biographical data: [Wikidata](https://www.wikidata.org/) (CC0 1.0).  
Contemporaries dataset: [Pantheon](https://pantheon.world/) by MIT Media Lab (CC BY 4.0).
