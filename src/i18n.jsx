import { createContext, useContext, useState } from "react";

const translations = {
  en: {
    appTitle: "Biographical Timeline",
    share: "Share",
    copied: "Copied!",
    shareTitle: "Copy URL to clipboard",
    shareFallback: "Copy this URL:",
    loadingTimeline: "Loading timeline…",
    personCount: (n) => `${n} person${n !== 1 ? "s" : ""}`,
    dataCredit: "Data: Wikidata (CC0)",

    searchPlaceholder: "Search for a person (e.g. Leonardo da Vinci)…",
    filter: "Filter",
    birth: "Birth",
    death: "Death",
    filterFrom: "from",
    filterTo: "to",
    noResults: "No results",
    errorPrefix: "Error:",
    alreadyAdded: "already added",
    stillLiving: "still living",

    sort: "Sort:",
    byBirth: "By birth",
    byDeath: "By death",
    manual: "Manual",
    ascending: "Ascending — click to reverse",
    descending: "Descending — click to reverse",
    zoom: "Zoom:",
    zoomReset: "Reset",
    emptyHint: "Search for people and add them to the timeline",
    bce: (y) => `${y} BC`,
    ce: (y) => `${y} CE`,

    dragToReorder: "Drag to reorder",
    present: "present",
    remove: "Remove",

    addToTimeline: "Add to timeline",
    addToTimelineWithDesc: (desc) => `${desc} — Add to timeline`,
    alreadyOnTimeline: "Already on timeline",
    relationsInfluences: "Relations & Influences",
    noWikidataEntries: "No entries in Wikidata",
    contemporaries: "Contemporaries",
    birthLabel: "Birth",
    deathLabel: "Death",
    years: "Years",
    range: "Range",
    top: "Top",
    search: "Search",
    peopleDied: (from, to) => `People who died between ${from} – ${to}`,
    peopleBorn: (from, to) => `People born between ${from} – ${to}`,
    stillAlive: "still alive",
    relType: (type) => type,
    sameField: "Same Field",
    noOccupations: "No occupations in Wikidata",
    selectOccupation: "Select an occupation above",
  },
  de: {
    appTitle: "Biografische Zeitleiste",
    share: "Teilen",
    copied: "Kopiert!",
    shareTitle: "URL in Zwischenablage kopieren",
    shareFallback: "Diese URL kopieren:",
    loadingTimeline: "Zeitleiste wird geladen…",
    personCount: (n) => `${n} Person${n !== 1 ? "en" : ""}`,
    dataCredit: "Daten: Wikidata (CC0)",

    searchPlaceholder: "Person suchen (z. B. Leonardo da Vinci)…",
    filter: "Filter",
    birth: "Geburt",
    death: "Tod",
    filterFrom: "von",
    filterTo: "bis",
    noResults: "Keine Ergebnisse",
    errorPrefix: "Fehler:",
    alreadyAdded: "bereits hinzugefügt",
    stillLiving: "noch lebend",

    sort: "Sortierung:",
    byBirth: "Nach Geburt",
    byDeath: "Nach Tod",
    manual: "Manuell",
    ascending: "Aufsteigend – zum Umkehren klicken",
    descending: "Absteigend – zum Umkehren klicken",
    zoom: "Zoom:",
    zoomReset: "Zurücksetzen",
    emptyHint: "Personen suchen und zur Zeitleiste hinzufügen",
    bce: (y) => `${y} v. Chr.`,
    ce: (y) => `${y} n. Chr.`,

    dragToReorder: "Ziehen zum Neuanordnen",
    present: "heute",
    remove: "Entfernen",

    addToTimeline: "Zur Zeitleiste hinzufügen",
    addToTimelineWithDesc: (desc) => `${desc} – Zur Zeitleiste hinzufügen`,
    alreadyOnTimeline: "Bereits auf der Zeitleiste",
    relationsInfluences: "Beziehungen & Einflüsse",
    noWikidataEntries: "Keine Einträge in Wikidata",
    contemporaries: "Zeitgenossen",
    birthLabel: "Geburt",
    deathLabel: "Tod",
    years: "Jahre",
    range: "Bereich",
    top: "Top",
    search: "Suchen",
    peopleDied: (from, to) => `Personen, die zwischen ${from} und ${to} gestorben sind`,
    peopleBorn: (from, to) => `Personen, die zwischen ${from} und ${to} geboren wurden`,
    stillAlive: "noch lebend",
    sameField: "Selbes Fachgebiet",
    noOccupations: "Keine Berufe in Wikidata",
    selectOccupation: "Beruf oben auswählen",
    relType: (type) => ({
      "Spouse": "Ehepartner",
      "Child": "Kind",
      "Father": "Vater",
      "Mother": "Mutter",
      "Sibling": "Geschwister",
      "Student of": "Schüler von",
      "Student": "Schüler",
      "Influenced by": "Beeinflusst von",
    }[type] ?? type),
  },
};

function readLangCookie() {
  const match = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  const val = match?.[1];
  return val === "de" || val === "en" ? val : "en";
}

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readLangCookie);

  function setLang(l) {
    document.cookie = `lang=${l};path=/;max-age=31536000`;
    setLangState(l);
  }

  return (
    <LangContext.Provider value={{ t: translations[lang], lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
