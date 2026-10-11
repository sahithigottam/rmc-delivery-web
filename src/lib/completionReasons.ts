export const FAILURE_REASONS = [
  "Truck broke down",
  "Site refused load",
  "Site not ready",
  "Could not reach site",
];

export const EXPIRED_LOAD_REASONS = ["Site engineer approved after slump test"];

/** One-tap reasons for the cases where a note is required, so drivers need not type. */
export function reasonChips(success: boolean | null, loadExpired: boolean): string[] {
  if (success === false) return FAILURE_REASONS;
  if (success === true && loadExpired) return EXPIRED_LOAD_REASONS;
  return [];
}

/**
 * Picking a chip fills an empty note; picking it again clears it. A note the driver
 * typed is kept and the reason is added to it instead of replacing it.
 */
export function applyReasonChip(current: string, chip: string, chips: string[]): string {
  const text = current.trim();
  if (!text || chips.includes(text)) return text === chip ? "" : chip;
  return text.includes(chip) ? text : `${text}; ${chip}`;
}
