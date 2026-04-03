# Those Before

Eine interaktive Zeitleiste, auf der historische Personen aus der Wikidata-Datenbank gesucht und als farbige Blöcke auf einer gemeinsamen Zeitachse dargestellt werden.

![Those Before Screenshot](https://github.com/trytobesteady/thosebefore/raw/master/public/favicon.svg)

## Features

- **Personensuche** via Wikidata — Autocomplete mit Debounce, sortiert nach Relevanz (Sitelinks)
- **Zeitleiste** — jede Person bekommt eine eigene Reihe, der Block ist proportional zur Lebensdauer
- **Tooltip** — zeigt exaktes Geburts- und Todesdatum sowie einen Link zu Wikipedia
- **Sortierung** — nach Geburtsjahr, Todesjahr oder manuell per Drag & Drop
- **Zoom** — Zeitachse stufenlos skalierbar
- **URL-State** — aktuelle Personenauswahl als URL-Parameter teilbar (`?p=Q762,Q5592`)
- **Datenquelle** — [Wikidata](https://www.wikidata.org) (CC0), kein Backend nötig

## Tech Stack

- [React 18](https://react.dev) + [Vite](https://vite.dev)
- [Tailwind CSS v3](https://tailwindcss.com)
- [daisyUI v4](https://daisyui.com)

## Setup

**Voraussetzungen:** Node.js 18+

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Die App läuft dann unter [http://localhost:5173](http://localhost:5173).

```bash
# Produktions-Build erstellen
npm run build

# Build lokal vorschauen
npm run preview
```

## Verwendung

1. Person im Suchfeld eingeben (mind. 2 Zeichen)
2. Ergebnis aus der Dropdown-Liste auswählen → Person erscheint auf der Zeitleiste
3. Reihen per Drag & Drop umsortieren oder die Sortier-Buttons nutzen
4. Mit dem **Teilen**-Button die aktuelle URL in die Zwischenablage kopieren

## Daten

Alle Daten stammen von [Wikidata](https://www.wikidata.org) und stehen unter der [CC0-Lizenz](https://creativecommons.org/publicdomain/zero/1.0/).
