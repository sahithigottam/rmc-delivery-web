"use client";

import type { City, Country, Region, StateProvince } from "@/types/route";

export interface GeographySelection {
  countryCode: string;
  stateId: string;
  cityId: string;
  regionId: string;
}

export interface GeographyCatalogue {
  countries: Country[];
  states: StateProvince[];
  cities: City[];
  regions: Region[];
}

export default function GeographySelectors({
  catalogue, value, onChange, disabled = false, requireRegion = false, depth = 4,
}: {
  catalogue: GeographyCatalogue;
  value: GeographySelection;
  onChange: (value: GeographySelection) => void;
  disabled?: boolean;
  requireRegion?: boolean;
  depth?: 1 | 2 | 3 | 4;
}) {
  const states = catalogue.states.filter((s) => s.country_code === value.countryCode);
  const cities = catalogue.cities.filter((c) => c.state_id === value.stateId);
  const regions = catalogue.regions.filter((r) => r.city_id === value.cityId);
  const options = [
    { label: "Country", selected: value.countryCode, rows: catalogue.countries.map((c) => ({ id: c.code, name: c.name })),
      disabled, change: (id: string) => onChange({ countryCode: id, stateId: "", cityId: "", regionId: "" }) },
    { label: "State / Province", selected: value.stateId, rows: states, disabled: disabled || !value.countryCode,
      change: (id: string) => onChange({ ...value, stateId: id, cityId: "", regionId: "" }) },
    { label: "City", selected: value.cityId, rows: cities, disabled: disabled || !value.stateId,
      change: (id: string) => onChange({ ...value, cityId: id, regionId: "" }) },
    { label: "Operating Region", selected: value.regionId, rows: regions, disabled: disabled || !value.cityId,
      change: (id: string) => onChange({ ...value, regionId: id }) },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.slice(0, depth).map((option) => (
        <label key={option.label} className="block text-sm min-w-0">{option.label}
          <select value={option.selected} disabled={option.disabled}
            required={requireRegion && option.label === "Operating Region"}
            onChange={(event) => option.change(event.target.value)}
            className="block mt-1 min-h-12 w-full px-3 rounded-xl border border-outline-variant bg-surface disabled:opacity-40">
            <option value="">Select {option.label.toLowerCase()}</option>
            {option.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          {!option.disabled && option.rows.length === 0 && (
            <span className="block mt-1 text-xs text-on-surface-variant">
              No {option.label.toLowerCase()} records available. Add the missing location in Business Geography.
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
