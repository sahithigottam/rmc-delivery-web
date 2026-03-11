/**
 * Google-encoded polyline decoder.
 * Pure TypeScript — no external dependency needed.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Haversine distance between two [lat, lng] points in km.
 */
export function haversine(
  a: [number, number],
  b: [number, number]
): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2);
  const sb = Math.sin(dLng / 2);
  const h =
    sa * sa +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      sb * sb;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Linearly interpolate between two [lat, lng] points.
 */
function lerp(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Resample a polyline to ~n evenly-spaced points for smooth animation.
 */
export function subsampleRoute(
  points: [number, number][],
  n = 250
): [number, number][] {
  if (points.length < 2) return points;

  // Cumulative arc-length
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + haversine(points[i - 1], points[i]));
  }
  const total = dists[dists.length - 1];
  if (total === 0) return points;

  const result: [number, number][] = [];
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const target = (total * k) / n;
    while (seg < dists.length - 2 && dists[seg + 1] < target) seg++;
    const segLen = dists[seg + 1] - dists[seg];
    const t = segLen > 0 ? (target - dists[seg]) / segLen : 0;
    result.push(lerp(points[seg], points[seg + 1], Math.min(t, 1)));
  }

  return result;
}
