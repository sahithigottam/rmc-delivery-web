/** Within this distance of the delivery site the driver is treated as arriving. */
export const NEAR_SITE_M = 300;

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** False when the driver's position is unknown: arrival cannot be assumed. */
export function isNearSite(
  position: [number, number] | null | undefined,
  site: { end_lat: number; end_lng: number },
): boolean {
  return !!position && distanceMeters(position, [site.end_lat, site.end_lng]) <= NEAR_SITE_M;
}
