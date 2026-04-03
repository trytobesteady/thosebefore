import { useState, useEffect, useRef } from "react";
import { searchPersons } from "../utils/sparql";

export function useWikidataSearch() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    birthYearMin: "",
    birthYearMax: "",
    deathYearMin: "",
    deathYearMax: "",
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Abort any previous in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      setLoading(true);
      setError(null);
      try {
        const persons = await searchPersons(query.trim(), filters, signal);
        if (signal.aborted) return;
        setResults(persons);
      } catch (e) {
        if (signal.aborted) return;
        setError(e.message);
        setResults([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, filters]);

  return { query, setQuery, filters, setFilters, results, loading, error };
}
