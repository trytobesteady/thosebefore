import { useReducer, useEffect, useState } from "react";
import { decodeState } from "../utils/urlState";
import { fetchEntitiesByIds } from "../utils/sparql";

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
      const sorted = [...state.persons].sort((a, b) => {
        const ay = a.birthYear ?? Infinity;  // unknown → end
        const by = b.birthYear ?? Infinity;
        return ay - by;
      });
      return { ...state, persons: sorted, sortMode: "birth" };
    }
    case "SORT_BY_DEATH": {
      const sorted = [...state.persons].sort((a, b) => {
        const ay = a.deathYear ?? Infinity;  // still living → end
        const by = b.deathYear ?? Infinity;
        return ay - by;
      });
      return { ...state, persons: sorted, sortMode: "death" };
    }
    case "SET_SORT_MODE":
      return { ...state, sortMode: action.mode };
    default:
      return state;
  }
}

export function useTimeline() {
  const [state, dispatch] = useReducer(reducer, { persons: [], sortMode: "manual" });
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
        const persons = await fetchEntitiesByIds(ids);
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
  const sortByBirth = () => dispatch({ type: "SORT_BY_BIRTH" });
  const sortByDeath = () => dispatch({ type: "SORT_BY_DEATH" });

  return {
    persons: state.persons,
    sortMode: state.sortMode,
    loadingState,
    addPerson,
    removePerson,
    reorder,
    sortByBirth,
    sortByDeath,
  };
}
