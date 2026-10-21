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

/**
 * Lines summarising an offline catch-up report.
 * @param {object} report from catchUp()
 * @param {object} balance
 * @param {boolean} capped time beyond the offline cap was lost
 * @returns {string[]}
 */
export function reportLines(report, balance, capped = false) {
  const lines = [`Away for ${formatDuration(report.elapsedMs)}.`];
  if (capped) lines.push(`Only the first ${balance.time.offlineCapHours} h counted.`);
  const names = { food: 'Food', water: 'Water', energy: 'Energy', health: 'Health', morale: 'Morale' };
  for (const k of ['food', 'water', 'energy', 'health', 'morale']) {
    const a = Math.round(report.before[k]);
    const b = Math.round(report.after[k]);
    if (a !== b) lines.push(`${names[k]}: ${a} -> ${b}`);
  }
  for (const [id, qty] of Object.entries(report.used)) {
    lines.push(`Used ${qty} x ${balance.items?.[id]?.name || id}`);
  }
  lines.push(...productionLines(report.production, balance));
  lines.push(...survivorLines(report, balance));
  lines.push(...attackLines(report.attacks, balance));
  return lines;
}

const nameOf = (id, balance) => (id === 'active' || id === 'hero' ? 'You' : balance.survivors?.roster?.[id]?.name || id);

/** Lines about survivors while you were away: missed upkeep, deaths and scavenged loot. */
export function survivorLines(report, balance) {
  const lines = [];
  for (const e of report.survivorEvents || []) {
    const n = nameOf(e.id, balance);
    if (e.missed?.length) lines.push(Math.round(e.healthLost) > 0 ? `${n} had no ${e.missed.join(' or ')}: -${Math.round(e.healthLost)} health.` : `${n} had no ${e.missed.join(' or ')}.`);
    if (e.died) lines.push(`${n} died.`);
  }
  const found = {};
  for (const e of report.scavenged || []) {
    if (e.stored) found[e.item.id] = (found[e.item.id] || 0) + e.item.qty;
  }
  const parts = Object.entries(found).map(([id, q]) => `${q} ${(balance.items?.[id]?.name || id).toLowerCase()}`);
  if (parts.length) lines.push(`Scavenged: ${parts.join(', ')}`);
  return lines;
}

/** Lines for each attack resolved while you were away (GDD 5.8: time, strength vs defense, damage, losses). */
export function attackLines(attacks, balance) {
  const lines = [];
  for (const a of attacks || []) {
    const when = a.interrupted ? 'Attack you left' : a.missed ? 'Attack while you were out' : `Attack ${formatDuration(a.offsetMs ?? 0)} in`;
    const vs = `strength ${Math.round(a.strength)} vs defense ${Math.round(a.defense)}`;
    // the popup fits about 40 characters per line
    if (`${when}: ${vs}`.length <= 40) lines.push(`${when}: ${vs}`);
    else lines.push(`${when}:`, vs[0].toUpperCase() + vs.slice(1));
    if (a.repelled) {
      lines.push(`Repelled. Barricade -${Math.round(a.barricadeLoss)} HP.`);
      continue;
    }
    lines.push('BREACHED! The barricade fell.');
    if (a.hurt?.length) lines.push(`Hurt: ${a.hurt.map((h) => `${nameOf(h.id, balance)} -${Math.round(h.damage)}`).join(', ')}`);
    if (a.lost?.length) {
      const names = a.lost.map((l) => (balance.items?.[l.id]?.name || l.id).toLowerCase()).join(', ');
      lines.push(`Lost ${a.lost.length} stack${a.lost.length > 1 ? 's' : ''}${names.length <= 24 ? `: ${names}` : ''}.`);
    }
  }
  return lines;
}
