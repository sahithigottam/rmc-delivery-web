"use client";

import { useState, useEffect, useRef } from "react";

export interface Suggestion {
  place_id?: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  addresstype?: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
  boundingbox?: string[];
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: Suggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  label,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const searchAddress = async () => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }

      if (!value || value.length < 3) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
            new URLSearchParams({
              q: `${value}, Auckland, New Zealand`,
              format: "json",
              addressdetails: "1",
              limit: "5",
              countrycodes: "nz",
            })
        );

        if (response.ok) {
          const data = await response.json();
          // Filter to only show results in Auckland region
          const aucklandResults = data.filter((item: any) => {
            const dn = item.display_name.toLowerCase();
            const addr = item.address || {};
            return (
              dn.includes("auckland") ||
              addr.city?.toLowerCase().includes("auckland") ||
              addr.county?.toLowerCase().includes("auckland") ||
              addr.state?.toLowerCase().includes("auckland") ||
              addr.state_district?.toLowerCase().includes("auckland")
            );
          });
          setSuggestions(aucklandResults);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error("Address search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchAddress, 300);
    return () => clearTimeout(timeoutId);
  }, [value]);

  const handleSelect = (suggestion: Suggestion) => {
    justSelectedRef.current = true;
    onChange(suggestion.display_name);
    onSelect?.(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleInputChange = (newValue: string) => {
    justSelectedRef.current = false;
    onChange(newValue);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs font-medium text-on-surface-variant mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          required
          disabled={disabled}
          className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                     bg-surface text-on-surface text-sm
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                     disabled:opacity-50"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-4 w-4 text-on-surface-variant"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1 bg-surface-container rounded-xl border border-outline-variant
                     shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full px-3 py-2.5 text-left text-sm text-on-surface
                           hover:bg-surface-container-high transition-colors
                           first:rounded-t-xl last:rounded-b-xl"
              >
                {suggestion.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showSuggestions && value.length >= 3 && suggestions.length === 0 && !loading && (
        <div
          className="absolute z-50 w-full mt-1 bg-surface-container rounded-xl border border-outline-variant
                     shadow-lg px-3 py-2.5"
        >
          <p className="text-sm text-on-surface-variant">
            No results
          </p>
        </div>
      )}
    </div>
  );
}
