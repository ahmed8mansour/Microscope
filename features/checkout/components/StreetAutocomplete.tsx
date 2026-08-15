"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchPlaceDetails,
  fetchSuggestions,
  loadPlaces,
  newSessionToken,
  placesEnabled,
  type ParsedPlace,
  type PlaceSuggestion,
} from "../lib/places";

interface StreetAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (place: ParsedPlace) => void;
  regionCode?: string;
  className: string;
  autoComplete?: string;
  placeholder?: string;
}

// Street-address input with Google Places autocomplete. On selection it emits a
// fully parsed address so the parent can auto-fill suburb/state/postcode/country.
// If Places can't load (no key / offline), it silently behaves as a plain input.
export default function StreetAutocomplete({
  id,
  value,
  onChange,
  onSelectPlace,
  regionCode,
  className,
  autoComplete,
  placeholder,
}: StreetAutocompleteProps) {
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const sessionRef = useRef<unknown>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (!placesEnabled) return;
    let alive = true;
    loadPlaces().then((ok) => {
      if (alive) setReady(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounced suggestion fetch as the user types. All state updates happen in
  // the async timeout callback (never synchronously in the effect body).
  useEffect(() => {
    if (!ready) return;
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const q = value.trim();
    const handle = setTimeout(async () => {
      if (q.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        if (!sessionRef.current) sessionRef.current = newSessionToken();
        const results = await fetchSuggestions(q, sessionRef.current, regionCode);
        setSuggestions(results);
        setActive(-1);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [value, ready, regionCode]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function choose(s: PlaceSuggestion) {
    justSelectedRef.current = true;
    setOpen(false);
    setSuggestions([]);
    onChange(s.primary);
    try {
      const parsed = await fetchPlaceDetails(s.prediction);
      // A Place Details call terminates the billing session — next keystroke
      // starts a fresh one.
      sessionRef.current = null;
      onSelectPlace({ ...parsed, line1: parsed.line1 || s.primary });
    } catch {
      sessionRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
      />
      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-[4px] border border-ink/20 bg-paper-bone shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-left ${
                i === active ? "bg-ink/10" : ""
              }`}
            >
              <span className="block font-body text-sm text-ink">{s.primary}</span>
              {s.secondary && (
                <span className="block font-body text-xs text-ink/50">{s.secondary}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
