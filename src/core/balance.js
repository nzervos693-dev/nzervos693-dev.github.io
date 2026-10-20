/*
 * balance.js - loads public/data/balance.json (owned by game-designer).
 *
 *   await loadBalance();   // once, in BootScene
 *   getBalance().time.offlineCapHours
 *   offlineCapMs()         // offline catch-up cap in ms (default 12 h)
 *
 * Falls back to built-in defaults if the file can't be fetched.
 */
export const DEFAULT_BALANCE = { version: 1, time: { offlineCapHours: 12 } };
let balance = DEFAULT_BALANCE;

export async function loadBalance(url = `${import.meta.env.BASE_URL}data/balance.json`) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    balance = await res.json();
  } catch (e) {
    console.warn('balance.json failed to load, using defaults', e);
    balance = DEFAULT_BALANCE;
  }
  return balance;
}

export const setBalance = (b) => { balance = b; };
export const getBalance = () => balance;

export function offlineCapMs(b = balance) {
  const h = Number(b?.time?.offlineCapHours);
  return (Number.isFinite(h) && h >= 0 ? h : 12) * 3600 * 1000;
}
