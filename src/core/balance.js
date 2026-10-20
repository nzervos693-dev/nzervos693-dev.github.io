/*
 * balance.js - loads public/data/balance.json (owned by game-designer).
 *
 *   await loadBalance();   // once, in BootScene
 *   getBalance().time.offlineCapHours
 *   offlineCapMs()         // offline catch-up cap in ms (default 12 h)
 *
 * The JSON is bundled into the build as the default; fetch only refreshes it.
 */
import bundled from '../../public/data/balance.json';

// The bundled copy is the source of truth at build time, so the game never
// depends on a network fetch. loadBalance() additionally tries to pick up a
// newer copy from the server (e.g. a hotfix) and silently keeps the bundled one on failure.
export const DEFAULT_BALANCE = bundled;
let balance = DEFAULT_BALANCE;

export async function loadBalance(url = `${import.meta.env.BASE_URL}data/balance.json`) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const fresh = await res.json();
    if (fresh && typeof fresh === 'object') balance = fresh;
  } catch (e) {
    console.warn('balance.json fetch failed, using bundled copy', e);
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
