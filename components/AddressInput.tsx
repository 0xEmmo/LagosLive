'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';
import {
  autocompletePlaces,
  geocodePlace,
  hasGeoapifyKey,
  type GeoPlace,
} from '@/lib/geoapify';

export interface LocationResult {
  address: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

interface AddressInputProps {
  value: string;
  onChange: (value: string, location: LocationResult | null) => void;
  inputStyle?: React.CSSProperties;
  placeholder?: string;
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;
const BLUR_CLOSE_MS = 160;
const LOCATE_ERROR =
  "Couldn't locate this address. Please select a suggested location or check the address.";

// Fully controlled address field. The parent owns the value (so the text the
// host sees is always the text that gets validated and submitted) while this
// component carries the Geoapify autocomplete UI, keyboard/touch selection and
// manual-entry geocoding.
export default function AddressInput({ value, onChange, inputStyle, placeholder }: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [noResults, setNoResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const autocompleteReqRef = useRef(0);
  const geocodeReqRef = useRef(0);
  const skipNextFetchRef = useRef<string | null>(null);
  const justSelectedRef = useRef(false);
  // The value for which we currently hold valid coordinates. Seeded from the
  // initial value so an edit form's saved location is never re-geocoded.
  const resolvedValueRef = useRef(value.trim());
  const [resolved, setResolved] = useState(value.trim().length > 0);

  const apiReady = hasGeoapifyKey();
  const listId = 'geoapify-address-list';

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, []);

  // Debounced autocomplete. Bumping the request id and aborting the previous
  // fetch guarantees a slow, stale response can never overwrite newer results.
  useEffect(() => {
    if (!apiReady) return;
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      autocompleteReqRef.current += 1;
      setSuggestions([]);
      setNoResults(false);
      setOpen(false);
      setLoading(false);
      return;
    }
    if (skipNextFetchRef.current === value) {
      skipNextFetchRef.current = null;
      return;
    }

    const reqId = (autocompleteReqRef.current += 1);
    const controller = new AbortController();
    setLoading(true);
    setNoResults(false);

    const timer = window.setTimeout(async () => {
      try {
        const places = await autocompletePlaces(trimmed, controller.signal);
        if (reqId !== autocompleteReqRef.current) return;
        setSuggestions(places);
        setNoResults(places.length === 0);
        setOpen(places.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        if (reqId !== autocompleteReqRef.current) return;
        setSuggestions([]);
        setNoResults(false);
        setOpen(false);
      } finally {
        if (reqId === autocompleteReqRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, apiReady]);

  const selectPlace = (place: GeoPlace) => {
    const address = place.formatted;
    // Cancel anything still in flight and stop the autocomplete from firing
    // again for the value we are about to write back.
    autocompleteReqRef.current += 1;
    geocodeReqRef.current += 1;
    skipNextFetchRef.current = address;
    justSelectedRef.current = true;
    resolvedValueRef.current = address;

    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setNoResults(false);
    setError('');
    setResolved(true);

    onChange(address, {
      address,
      formatted: place.formatted,
      latitude: place.lat,
      longitude: place.lon,
    });
  };

  const resolveManual = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === resolvedValueRef.current) return;

    if (!apiReady) {
      setError('Address lookup is unavailable right now. Enter the coordinates manually.');
      setResolved(false);
      onChange(raw, null);
      return;
    }

    const reqId = (geocodeReqRef.current += 1);
    setResolving(true);
    setError('');
    try {
      const place = await geocodePlace(trimmed);
      if (reqId !== geocodeReqRef.current) return;
      if (!place) {
        setResolved(false);
        setError(LOCATE_ERROR);
        onChange(raw, null);
        return;
      }
      resolvedValueRef.current = trimmed;
      setResolved(true);
      onChange(raw, {
        address: raw,
        formatted: place.formatted,
        latitude: place.lat,
        longitude: place.lon,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      if (reqId !== geocodeReqRef.current) return;
      setResolved(false);
      setError("Couldn't locate this address right now. Check your connection or try a suggestion.");
      onChange(raw, null);
    } finally {
      if (reqId === geocodeReqRef.current) setResolving(false);
    }
  };

  const handleInputChange = (next: string) => {
    // Any manual edit invalidates the previously selected coordinates.
    autocompleteReqRef.current += 1;
    geocodeReqRef.current += 1;
    resolvedValueRef.current = '';
    justSelectedRef.current = false;
    setResolved(false);
    setError('');
    onChange(next, null);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      setOpen(false);
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      void resolveManual(value);
    }, BLUR_CLOSE_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectPlace(suggestions[activeIndex]);
      }
    }
  };

  const showDropdown = open && suggestions.length > 0;
  const showEmpty = open && !loading && noResults && value.trim().length >= MIN_QUERY_LENGTH;
  const busy = loading || resolving;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? '15 Ozumba Mbadiwe Ave, Victoria Island, Lagos'}
          style={inputStyle}
          className="font-heading"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        />
        {busy && (
          <Loader2
            size={16}
            strokeWidth={2}
            color="#FF2D95"
            className="animate-spin"
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
        )}
        {!busy && resolved && value.trim().length > 0 && (
          <CheckCircle2
            size={16}
            strokeWidth={2}
            color="#00F5D4"
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
        )}
      </div>

      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto overscroll-contain rounded-xl"
          style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        >
          {suggestions.map((s, index) => (
            <li key={s.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(s)}
                className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-[#ff2d95]/10"
                style={index === activeIndex ? { background: 'rgba(255,45,149,0.1)' } : undefined}
              >
                <MapPin size={15} strokeWidth={2} color="#FF2D95" className="mt-0.5 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                    {s.line1 || s.formatted}
                  </span>
                  {(s.line2 || s.city || s.state) && (
                    <span className="block truncate text-[11.5px]" style={{ color: '#A7A8B5' }}>
                      {[s.line2, s.city, s.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl px-3.5 py-3 text-[12.5px]"
          style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <span style={{ color: '#A7A8B5' }}>No matching address in Nigeria yet. Keep typing or enter the address in full.</span>
        </div>
      )}

      {error && (
        <div className="mt-1.5 text-[12px]" style={{ color: '#FF8A00' }} role="alert">
          {error}
        </div>
      )}

      {!apiReady && (
        <div className="mt-1.5 text-[11px]" style={{ color: '#6B6C80' }}>
          Address autocomplete is unavailable. Enter the full address and coordinates manually.
        </div>
      )}
    </div>
  );
}
