import { useReducer, useEffect, useState } from "react";
import { decodeState } from "../utils/urlState";
import { fetchEntitiesByIds } from "../utils/sparql";
import { useLang } from "../i18n";

function reducer(state, action) {
  switch (action.type) {
    case "ADD_PERSON": {
      if (state.persons.find((p) => p.id === action.person.id)) return state;
      return { ...state, persons: [...state.persons, action.person], sortMode: "manual" };
    }
    case "REMOVE_PERSON":
      return { ...state, persons: state.persons.filter((p) => p.id !== action.id) };
    case "SET_PERSONS":
      return { ...state, persons: action.persons };
    case "REORDER": {
      const persons = [...state.persons];
      const [moved] = persons.splice(action.from, 1);
      persons.splice(action.to, 0, moved);
      return { ...state, persons, sortMode: "manual" };
    }
    case "SORT_BY_BIRTH": {
      const dir = action.dir ?? "asc";
      const sorted = [...state.persons].sort((a, b) => {
        const ay = a.birthYear ?? Infinity;
        const by = b.birthYear ?? Infinity;
        return dir === "asc" ? ay - by : by - ay;
      });
      return { ...state, persons: sorted, sortMode: "birth", sortDir: dir };
    }
    case "SORT_BY_DEATH": {
      const dir = action.dir ?? "asc";
      const sorted = [...state.persons].sort((a, b) => {
        const ay = a.deathYear ?? Infinity;
        const by = b.deathYear ?? Infinity;
        return dir === "asc" ? ay - by : by - ay;
      });
      return { ...state, persons: sorted, sortMode: "death", sortDir: dir };
    }
    case "SET_SORT_MODE":
      return { ...state, sortMode: action.mode };
    default:
      return state;
  }
}

export function useTimeline() {
  const { lang } = useLang();
  const [state, dispatch] = useReducer(reducer, { persons: [], sortMode: "manual", sortDir: "asc" });
  const [loadingState, setLoadingState] = useState(() => {
    const ids = decodeState(window.location.search);
    return ids.length > 0 ? true : null;
  });

  // Load persons from URL on mount
  useEffect(() => {
    const ids = decodeState(window.location.search);
    if (!ids.length) return;

    let cancelled = false;
    setLoadingState(true);

    (async () => {
      try {
        const persons = await fetchEntitiesByIds(ids, lang);
        if (cancelled) return;
        if (persons.length > 0) dispatch({ type: "SET_PERSONS", persons });
      } catch {
        // skip failed lookups
      }
      if (!cancelled) setLoadingState(null);
    })();

    return () => { cancelled = true; };
  }, []);

  const addPerson = (person) => dispatch({ type: "ADD_PERSON", person });
  const removePerson = (id) => dispatch({ type: "REMOVE_PERSON", id });
  const reorder = (from, to) => dispatch({ type: "REORDER", from, to });
  const sortByBirth = (dir) => dispatch({ type: "SORT_BY_BIRTH", dir: dir ?? "asc" });
  const sortByDeath = (dir) => dispatch({ type: "SORT_BY_DEATH", dir: dir ?? "asc" });
  const toggleSortDir = () => {
    const newDir = state.sortDir === "asc" ? "desc" : "asc";
    if (state.sortMode === "birth") dispatch({ type: "SORT_BY_BIRTH", dir: newDir });
    if (state.sortMode === "death") dispatch({ type: "SORT_BY_DEATH", dir: newDir });
  };

  return {
    persons: state.persons,
    sortMode: state.sortMode,
    sortDir: state.sortDir,
    loadingState,
    addPerson,
    removePerson,
    reorder,
    sortByBirth,
    sortByDeath,
    toggleSortDir,
  };
}
