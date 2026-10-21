import { productionLines } from './producers.js';

/**
 * Text for the "While you were away" popup. Pure.
 */

/** "3 h 20 min" style duration. */
export function formatDuration(ms) {
  if (ms < 60000) return 'less than a minute';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Clock time "03:10" for an epoch ms (local time). */
function clockTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const REPORT_MAX_LINES = 6;
const lower = (id, balance) => (balance.items?.[id]?.name || id).toLowerCase();

/**
 * Plain sentences summarising an offline catch-up report (GDD 5.1): at most 6 lines, no numbers
 * except item counts and clock times, no icons. Attacks come first, they matter most.
 * @param {object} report from catchUp()
 * @param {object} balance
 * @param {boolean} capped time beyond the offline cap was lost
 * @returns {string[]}
 */
export function reportLines(report, balance, capped = false) {
  const lines = [...attackLines(report.attacks, balance)];
  lines.push(...survivorLines(report, balance));
  const after = report.after || {};
  if (after.energy != null) lines.push(after.energy < 50 ? 'You slept badly.' : 'You slept.');
  if (after.food != null && after.food < 40) lines.push('You woke up hungry.');
  if (after.water != null && after.water < 40) lines.push('Your mouth is dry.');
  const used = Object.entries(report.used || {}).map(([id, qty]) => `${qty} ${lower(id, balance)}`);
  if (used.length) lines.push(`You went through your stash: ${used.join(', ')}.`);
  lines.push(...productionLines(report.production, balance));
  if (capped) lines.push('Days slipped by. You lost track.');
  return lines.slice(0, REPORT_MAX_LINES);
}

const nameOf = (id, balance) => (id === 'active' || id === 'hero' ? 'You' : balance.survivors?.roster?.[id]?.name || id);

/** Lines about survivors while you were away: missed meals, deaths and scavenged loot. */
function survivorLines(report, balance) {
  const lines = [];
  for (const e of report.survivorEvents || []) {
    const n = nameOf(e.id, balance);
    if (e.died) lines.push(`${n} died.`);
    else if (e.missed?.length) lines.push(`${n} had no ${e.missed.join(' or ')}.`);
  }
  const found = {};
  for (const e of report.scavenged || []) {
    if (e.stored) found[e.item.id] = (found[e.item.id] || 0) + e.item.qty;
  }
  const parts = Object.entries(found).map(([id, q]) => `${q} ${lower(id, balance)}`);
  if (parts.length) lines.push(`Someone brought back ${parts.join(', ')}.`);
  return lines;
}

/**
 * One or two sentences per attack resolved while you were away. Never strength, defense or HP.
 * "Around 03:10 something beat on the door for a long time. It held." /
 * "They got in. Mara is hurt. Lost: 2 canned food."
 */
export function attackLines(attacks, balance) {
  const lines = [];
  for (const a of attacks || []) {
    const at = a.atMs ? `Around ${clockTime(a.atMs)} something` : 'Something';
    if (a.repelled) {
      lines.push(`${at} beat on the door for a long time. It held.`);
      continue;
    }
    lines.push(`${at} broke through. They got in.`);
    if (a.hurt?.length) lines.push(`${a.hurt.map((h) => nameOf(h.id, balance)).join(' and ')} ${a.hurt.length > 1 || nameOf(a.hurt[0].id, balance) === 'You' ? 'are' : 'is'} hurt.`);
    if (a.lost?.length) {
      const names = a.lost.map((l) => `${l.qty} ${lower(l.id, balance)}`).join(', ');
      lines.push(`Lost: ${names}.`);
    }
  }
  return lines;
}
