/**
 * Persistence layer.
 *
 * Tries the Netlify Function API first (/api/state → Netlify Blobs).
 * Falls back to localStorage for local development.
 */

const API_PATH = "/api/state";
const LS_KEY  = "country-roulette-state";

function emptyState() {
  return { skipped: [], accepted: [] };
}

async function apiFetch(method, body) {
  try {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_PATH, opts);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return null;          // fall through to localStorage
  }
}

/* ---- public API ---- */

export async function loadState() {
  const remote = await apiFetch("GET");
  if (remote) return remote;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : emptyState();
  } catch {
    return emptyState();
  }
}

export async function saveAction(action, countryCode) {
  // Optimistic local write
  const state = await loadLocal();
  const list = action === "skip" ? state.skipped : state.accepted;
  if (!list.includes(countryCode)) list.push(countryCode);
  writeLocal(state);

  // Try remote
  await apiFetch("POST", { action, country: countryCode });

  return state;
}

export async function resetState() {
  writeLocal(emptyState());
  await apiFetch("POST", { action: "reset" });
  return emptyState();
}

/* ---- local helpers ---- */

async function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : emptyState();
  } catch {
    return emptyState();
  }
}

function writeLocal(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* quota */ }
}
