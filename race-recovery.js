// Strong assistance aims for a two-second walk, capped at a visible running pace.
export function recoveryWalkSpeed(distance, assist = 0) {
  const base = 2 + 2 * assist;
  return assist >= 0.7 ? Math.max(base, Math.min(12, distance / 2)) : base;
}

export function assistedDamage(points, assist = 0) {
  return Math.floor(points * (1 - 0.35 * assist));
}

// Pick the nearest clear position on the road without moving the rider forward.
export function recoveryLane(lat, left, right, obstacles) {
  const lo = left + 0.8, hi = right - 0.8;
  if (lo > hi) return lat;
  const clamp = x => Math.max(lo, Math.min(hi, x));
  const candidates = [clamp(lat), lo, hi, ...obstacles.flatMap(o => [o.lat - o.hw - 0.5, o.lat + o.hw + 0.5])];
  const clear = candidates.filter(x => x >= lo && x <= hi && obstacles.every(o => Math.abs(x - o.lat) >= o.hw + 0.4));
  return clear.sort((a, b) => Math.abs(a - lat) - Math.abs(b - lat))[0] ?? lat;
}
