// Speed and distance units. Most players are in India, where roads use km/h; the original shows mph.
// The choice is kept per browser; until a player picks, places that drive in miles get mph and everyone else km/h.
const KEY = 'rr-units';
const MILE_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Yakutat|Metlakatla|Adak|Menominee|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu|Europe\/London|Africa\/Monrovia|Asia\/(Yangon|Rangoon))/;
function guess() {
  try { return MILE_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '') ? 'mi' : 'km'; } catch { return 'km'; }
}
export function units() {
  try { const u = localStorage.getItem(KEY); if (u === 'mi' || u === 'km') return u; } catch {}
  return guess();
}
export function setUnits(u) { try { localStorage.setItem(KEY, u === 'mi' ? 'mi' : 'km'); } catch {} }
export const speedLabel = (mph, u = units()) => u === 'mi' ? `${Math.round(mph)} MPH` : `${Math.round(mph * 1.609344)} KM/H`;
export const distanceLabel = (miles, u = units()) => u === 'mi' ? `${miles.toFixed(1)} miles` : `${(miles * 1.609344).toFixed(1)} km`;
