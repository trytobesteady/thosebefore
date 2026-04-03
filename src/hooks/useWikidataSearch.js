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
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const persons = await searchPersons(query.trim(), filters);
        // Ignore stale responses if a newer request was started
        if (reqId !== requestIdRef.current) return;
        setResults(persons);
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        setError(e.message);
        setResults([]);
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, filters]);

  return { query, setQuery, filters, setFilters, results, loading, error };
}
