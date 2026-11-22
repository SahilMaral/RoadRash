// Product analytics: self-hosted Umami at stats.kayode.me (Coolify, Cloud Node 02), website "Road Rash". Only the live
// site reports; local runs and tests stay silent. Loading is lazy and failures are ignored, so a blocked script never
// affects the game. Moved off PostHog on 2026-11-20: PostHog bills per event and the game earns nothing, so it had to
// sample half the players and still hit its billing cap. Umami costs nothing per event, so every browser reports.
// The tracker is served as /rr.js and posts to /api/rr (TRACKER_SCRIPT_NAME / COLLECT_API_ENDPOINT on the server)
// so common blocklists don't drop it.
// Each browser keeps one id (`rr-uid`, seeded from its old PostHog id so returning players stay the same person) and
// sends it as Umami's distinct id; the relay reports room events under the same id (deploy/relay.js).
// Volume guards kept from the PostHog days, to keep the database small:
// - ONCE: events that repeat within a visit are sent the first time only.
// - DAILY_CAP: one browser sends at most this many events a UTC day (a heavy player's 30 races is ~150).
const UMAMI = "https://stats.kayode.me", WEBSITE = "3156cc8d-857f-4c0e-ae7a-12e1c7eb64e7";
const DAILY_CAP = 200, ONCE = new Set(["race_image_retry", "channel_shown", "promo_shown", "cheat_used", "race_loaded"]);
const PH_KEY = "ph_phc_ubS9W5oMHEYPKRKrWJb8f6MoTzrFQZKwEPb4YbXHvAGa_posthog";
const live = ["roadrash.fun", "roadrash.pages.dev", "roadrash.kayode.me"].includes(location.hostname);
function playerId() {
  try {
    let id = localStorage.getItem("rr-uid");
    if (!id) {
      // a player forwarded from an older address carries the PostHog id they had there (index.html)
      let carried = null; try { carried = sessionStorage.getItem("rr-carried-ph"); sessionStorage.removeItem("rr-carried-ph"); } catch {}
      let old = null; try { old = JSON.parse(localStorage.getItem(PH_KEY) || "null")?.distinct_id; } catch {}
      id = String(carried || old || crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 50);
      localStorage.setItem("rr-uid", id);
    }
    return id;
  } catch { return null; }
}
const uid = live ? playerId() : null;
const sentOnce = new Set();
function underCap() {
  try {
    const day = new Date().toISOString().slice(0, 10), [d, n] = (localStorage.getItem("rr-ph-day") || "").split(":");
    const count = d === day ? +n || 0 : 0; if (count >= DAILY_CAP) return false;
    localStorage.setItem("rr-ph-day", `${day}:${count + 1}`); return true;
  } catch { return true; }
}
const queue = [];
let um = null;
// Resolves with this browser's analytics id on the live site; never resolves elsewhere.
export const analyticsReady = new Promise((resolve) => { if (live && uid) resolve(uid); });

if (live) {
  const s = document.createElement("script");
  s.src = `${UMAMI}/rr.js`; s.async = true; s.defer = true;
  // the page view is sent by hand after identify, so the visit is filed under this player from its first request
  s.dataset.websiteId = WEBSITE; s.dataset.autoTrack = "false";
  s.onload = () => {
    um = window.umami;
    if (!um?.track) { um = null; return; }
    try { if (uid) um.identify(uid, { touch: matchMedia("(pointer: coarse)").matches }); um.track(); } catch {}
    for (const [event, props] of queue.splice(0)) send(event, props);
  };
  document.head.append(s);
}
const send = (event, props) => { try { um.track(event, props); } catch {} };

// The room server attributes room events to this id; null off the live site.
export const analyticsId = () => uid;

export function track(event, props = {}) {
  if (!live || ONCE.has(event) && sentOnce.has(event)) return;
  if (ONCE.has(event)) sentOnce.add(event);
  if (!underCap()) return;
  // Umami stores strings, numbers and booleans; drop undefined so they don't show up as empty values
  const data = {}; for (const k in props) if (props[k] !== undefined && props[k] !== null) data[k] = props[k];
  um ? send(event, data) : queue.length < 50 && queue.push([event, data]);
}

// Time spent: seconds the page is in front of the player, split into racing and menus ("time_spent" when the page
// is hidden or closed; Umami's tracker posts with keepalive, so it survives the tab closing). A menu left untouched
// stops counting after IDLE; a race counts while it runs (holding the throttle isn't a click).
const IDLE = 120000, acc = { racing: 0, menu: 0 };
let activity = "menu", since = document.visibilityState === "visible" ? performance.now() : null, lastInput = performance.now();
for (const e of ["pointerdown", "keydown", "touchstart", "wheel"]) addEventListener(e, () => { lastInput = performance.now(); }, { passive: true, capture: true });
function tick() {
  if (since == null) return;
  const now = performance.now(), end = activity === "menu" ? Math.min(now, Math.max(since, lastInput + IDLE)) : now;
  acc[activity] += Math.max(0, end - since) / 1000; since = now;
}
function flush() {
  tick(); const racing = Math.round(acc.racing), menu = Math.round(acc.menu);
  if (racing + menu < 1) return; acc.racing = acc.menu = 0;
  track("time_spent", { seconds: racing + menu, racing_s: racing, menu_s: menu });
}
// app.js: "racing" while a race runs, "menu" otherwise
export function setActivity(a) { tick(); activity = a === "racing" ? "racing" : "menu"; }
if (live) {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { flush(); since = null; } else { since = performance.now(); lastInput = since; } });
  addEventListener("pagehide", () => flush());
}
