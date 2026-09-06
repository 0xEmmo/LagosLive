'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface LocationResult {
  address: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

interface AddressInputProps {
  value?: string;
  onLocationChange: (result: LocationResult | null) => void;
  inputStyle?: React.CSSProperties;
}

interface Suggestion {
  place_id: string;
  formatted: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
}

export default function AddressInput({ value = '', onLocationChange, inputStyle }: AddressInputProps) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
          trimmed
        )}&apiKey=${encodeURIComponent(apiKey)}&filter=countrycode:ng&limit=6`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen((data.features?.length ?? 0) > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [text, apiKey]);

  const handleSelect = (s: Suggestion) => {
    const address = s.address_line1 || s.formatted;
    const latitude = typeof s.lat === 'number' ? s.lat : 0;
    const longitude = typeof s.lon === 'number' ? s.lon : 0;
    setText(address);
    setOpen(false);
    setSuggestions([]);
    onLocationChange({ address, formatted: s.formatted, latitude, longitude });
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onLocationChange(null);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="15 Ozumba Mbadiwe Ave, Victoria Island, Lagos"
          style={inputStyle}
          className="font-heading"
        />
        {isLoading && (
          <Loader2 size={16} strokeWidth={2} color="#FF2D95" className="animate-spin" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }} />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-60 overflow-y-auto rounded-xl" style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}>
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-[#ff2d95]/10"
            >
              <MapPin size={15} strokeWidth={2} color="#FF2D95" className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                  {s.address_line1 || s.formatted}
                </div>
                {(s.city || s.state) && (
                  <div className="truncate text-[11.5px]" style={{ color: '#A7A8B5' }}>
                    {[s.city, s.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && !isLoading && suggestions.length === 0 && text.trim().length >= 3 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-xl px-3.5 py-3 text-[12.5px]" style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: '#A7A8B5' }}>No address found in Lagos yet.</span>
        </div>
      )}
    </div>
  );
}
