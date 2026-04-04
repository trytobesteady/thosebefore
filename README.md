# thosebefore

An interactive biographical timeline powered by [Wikidata](https://www.wikidata.org/).

**Live:** [bennybaum.de/thosebefore](https://bennybaum.de/thosebefore/)

## What it does

Search for historical persons and place them on a shared timeline. For each person you can open a detail modal and explore:

- **Relations & Influences** — family members, teachers, students, and intellectual influences
- **Contemporaries** — notable people who were born or died around the same time (configurable year range and result count)
- **Same Field** — prominent people sharing an occupation, filtered by birth year ± 50 years

Timelines are shareable via URL. The UI language can be switched between English and German (persisted via cookie); Wikidata labels and descriptions switch accordingly.

## Tech stack

- **React 19** + **Vite 8** — no server-side rendering, fully client-side
- **Tailwind CSS v3** + **daisyUI v4**
- **No backend** — all data fetched at runtime from public Wikidata APIs:
  - [Wikidata SPARQL endpoint](https://query.wikidata.org/) for structured queries
  - [wbsearchentities](https://www.wikidata.org/w/api.php) for fast text search
  - [wbgetentities](https://www.wikidata.org/w/api.php) for labels, descriptions, and sitelink-based ranking
  - [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) for person thumbnails

## Features

- Add/remove persons; sort by birth year, death year, or drag-and-drop manual order
- Ascending/descending sort toggle
- Zoom control for the timeline axis
- Person modal: thumbnail, Wikipedia link, three expandable sections (Relations & Influences, Contemporaries, Same Field)
- Shareable URLs (`?p=Q762,Q5592,…`) encoding the full current selection
- DE/EN language switch

## Development

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build
npm run preview   # preview production build locally
```

## Deployment

GitHub Actions builds and deploys to `bennybaum.de/thosebefore/` via FTP on every push to `master`. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Data

All biographical data is sourced from [Wikidata](https://www.wikidata.org/) under the [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
