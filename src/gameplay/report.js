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
  return lines;
}
