// Rider rank: XP from races, a daily streak bonus, twelve ranks. Saved with the rest of the game in this browser (S).
// Only about 8% of new players raced again the next day, so the streak is the point: it gives a reason to come back.
// Quitting and cheating earn nothing, so Restart can't be farmed. Purely cosmetic: it changes nothing in a race.
const RANKS = [[0, 'Learner'], [150, 'Hubcap'], [400, 'Road Rat'], [800, 'Gravel Eater'], [1400, 'Kerb Hopper'], [2200, 'Knuckle Dragger'],
  [3300, 'Chain Swinger'], [4700, 'Cop Dodger'], [6500, 'Tarmac Terror'], [9000, 'Highway Menace'], [12500, 'Rash Master'], [17500, 'King of the Road']];
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function rankOf(xp = 0) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const from = RANKS[i][0], next = RANKS[i + 1];
  return { index: i, number: i + 1, name: RANKS[i][1], next: next?.[1] ?? null, toNext: next ? next[0] - xp : 0, share: next ? (xp - from) / (next[0] - from) : 1 };
}
// Players from before ranks existed start with credit for the races they already rode.
export const riderXP = (S) => S.xp ?? (S.raced || 0) * 40;
// Today's streak as the player sees it: it lapses if they missed a day.
export function currentStreak(S, now = Date.now()) {
  return S.streakDay === day(now) || S.streakDay === day(now - 864e5) ? S.streak || 0 : 0;
}

export function awardRace(S, { status, place, field = 16, level = 1, raceS = 0, usedCheats = false }, now = Date.now()) {
  let xp = 0;
  if (!usedCheats) {
    if (status === 'finished') {
      const beaten = field > 1 ? (field - (place || field)) / (field - 1) : 0;
      xp = 40 + Math.round(30 * beaten) + 10 * (Math.max(1, level) - 1) + (place === 1 ? 30 : 0);
    } else if ((status === 'busted' || status === 'wrecked') && raceS >= 30) xp = 10;
  }
  const before = riderXP(S), was = rankOf(before);
  if (!xp) return { xp: 0, total: before, rank: was, rankUp: false, bonus: 0, streak: currentStreak(S, now) };
  let bonus = 0;
  const today = day(now);
  if (S.streakDay !== today) {
    S.streak = S.streakDay === day(now - 864e5) ? (S.streak || 0) + 1 : 1;
    S.streakDay = today;
    bonus = 25 * Math.min(S.streak, 7);
  }
  S.xp = before + xp + bonus;
  const rank = rankOf(S.xp);
  return { xp: xp + bonus, bonus, total: S.xp, rank, rankUp: rank.index > was.index, streak: S.streak };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function progressLine(p) {
  return `+${p.xp} XP${p.bonus ? ` (day ${p.streak} bonus +${p.bonus})` : ''}${p.rankUp ? ` · New rank: ${p.rank.name}!` : ''}`;
}
// The strip on the results screen.
export function progressHTML(p) {
  if (!p) return '';
  const { rank } = p;
  return `<section class="rank-strip${p.rankUp ? ' up' : ''}" aria-label="Your rank">
    <div class="rank-head"><strong>${p.rankUp ? 'New rank: ' : ''}${esc(rank.name)}</strong><span>${p.xp ? `+${p.xp} XP` : 'No XP this race'}</span></div>
    <div class="rank-bar"><i style="width:${Math.round(rank.share * 100)}%"></i></div>
    <p>${rank.next ? `${rank.toNext.toLocaleString()} XP to ${esc(rank.next)}` : 'Top rank'}${p.streak ? ` · ${p.streak}-day streak, race tomorrow to keep it` : ''}</p></section>`;
}
export function rankChip(S) {
  const xp = riderXP(S); if (!xp) return '';
  const streak = currentStreak(S);
  return `<div class="rank-chip"><strong>${esc(rankOf(xp).name)}</strong>${streak > 1 ? `<span>${streak}-day streak</span>` : ''}</div>`;
}
