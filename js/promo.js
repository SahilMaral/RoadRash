// Cross-promotion for friends' free browser games (a swap, no ad network): one small card on results screens and the
// leaderboard from a player's second race, alternating between the games, hidden for a day with ✕. Links carry
// utm_source=roadrash so the games can see the traffic; shown / clicked / hidden are reported as promo_* events.
import { track } from "./analytics.js?v=93e8070907";
import { WA_ICON } from "./install.js?v=93e8070907";
const GAMES = [
  { id: "sflife", name: "SF Life", blurb: "A life sim in a real 3D San Francisco. Rent is due Saturday.", url: "https://sflife.app/", img: "./assets/promo/sflife.webp", wide: true },
  { id: "cloutcity", name: "Clout City NYC", blurb: "Arrive in New York as a nobody. Become somebody", url: "https://cloutcity.app/", img: "./assets/promo/cloutcity.webp" },
];
const HIDDEN = "rr-promo-hidden", DAY = 86400000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The game's own WhatsApp Channel: news, leaderboard winners and new features. It takes every other card slot until the
// player taps it (then never again); ✕ hides it for three days. Also linked from the main menu (CHANNEL_URL).
export const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb8b9D68qIzo61hkAa1A";
const JOINED = "rr-channel-joined", CH_HIDDEN = "rr-channel-hidden";
export const openChannel = (where) => { try { localStorage.setItem(JOINED, "1"); } catch {} track("channel_clicked", { where }); window.open(CHANNEL_URL, "_blank", "noopener"); };
function offerChannel(root, where) {
  try { if (localStorage.getItem(JOINED) || Date.now() - (+localStorage.getItem(CH_HIDDEN) || 0) < 3 * DAY) return false; } catch {}
  const card = document.createElement("aside");
  card.className = "promo-card channel-card"; card.setAttribute("aria-label", "Road Rash on WhatsApp");
  card.innerHTML = `<span class="promo-label">Road Rash on WhatsApp</span>
    <a class="promo-link" href="${CHANNEL_URL}" target="_blank" rel="noopener"><span class="channel-icon">${WA_ICON}</span>
      <span class="promo-text"><strong>Follow the channel</strong><span>New features, top riders and updates first.</span></span><span class="promo-play">Follow ➔</span></a>
    <button class="promo-hide" type="button" aria-label="Hide for now">✕</button>`;
  card.querySelector(".promo-link").addEventListener("click", () => { try { localStorage.setItem(JOINED, "1"); } catch {} track("channel_clicked", { where }); });
  card.querySelector(".promo-hide").addEventListener("click", () => { try { localStorage.setItem(CH_HIDDEN, Date.now()); } catch {} track("channel_hidden", { where }); card.remove(); });
  root.append(card);
  track("channel_shown", { where });
  return true;
}

// Adds the card to `root` when it applies; `where` names the screen (for the stats and the link's utm_campaign).
export function offerPromo(root, races, where) {
  if (!root || races < 2) return false;
  let slot = 0; try { slot = +(sessionStorage.getItem("rr-card-n") || 0); sessionStorage.setItem("rr-card-n", slot + 1); } catch {}
  if (slot % 2 === 0 && offerChannel(root, where)) return true;
  try { if (Date.now() - (+localStorage.getItem(HIDDEN) || 0) < DAY) return false; } catch {}
  let n = 0; try { n = +(sessionStorage.getItem("rr-promo-n") || 0); sessionStorage.setItem("rr-promo-n", n + 1); } catch {}
  const g = GAMES[n % GAMES.length], href = `${g.url}?utm_source=roadrash&utm_medium=crosspromo&utm_campaign=${encodeURIComponent(where)}`;
  const card = document.createElement("aside");
  card.className = "promo-card"; card.setAttribute("aria-label", "More free browser games");
  card.innerHTML = `<span class="promo-label">More free browser games</span>
    <a class="promo-link" href="${href}" target="_blank" rel="noopener"><img class="${g.wide ? "wide" : ""}" src="${g.img}" alt="" loading="lazy" width="${g.wide ? 120 : 63}" height="63">
      <span class="promo-text"><strong>${esc(g.name)}</strong><span>${esc(g.blurb)}</span></span><span class="promo-play">Play ➔</span></a>
    <button class="promo-hide" type="button" aria-label="Hide for today">✕</button>`;
  card.querySelector(".promo-link").addEventListener("click", () => track("promo_clicked", { game: g.id, where }));
  card.querySelector(".promo-hide").addEventListener("click", () => { try { localStorage.setItem(HIDDEN, Date.now()); } catch {} track("promo_hidden", { game: g.id, where }); card.remove(); });
  root.append(card);
  track("promo_shown", { game: g.id, where });
  return true;
}
