// api.js
const WORKER_BASE = "https://vetrine.it-immobiliarenordest.workers.dev/"; // <<-- metti qui il tuo worker URL
const TIMEOUT_MS = 8000; // 8 secondi timeout per operazioni di update

async function fetchWithTimeout(url, opts = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function getAllVetrine() {
  const res = await fetchWithTimeout(`${WORKER_BASE}/vetrine`);
  if (!res.ok) throw new Error("Errore caricamento vetrine");
  const body = await res.json();
  if (!body.success) throw new Error(body.error || "Errore API");
  return body.data; // array
}

export async function searchByRif(rif) {
  const res = await fetchWithTimeout(`${WORKER_BASE}/vetrine/rif/${encodeURIComponent(rif)}`);
  if (!res.ok) return null;
  const body = await res.json();
  return body.success ? body.immobile : null;
}

export async function postRibasso(rif, nuovoPrezzo) {
  const res = await fetchWithTimeout(`${WORKER_BASE}/vetrine/ribasso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rif: String(rif), nuovo_prezzo: Number(nuovoPrezzo) })
  }, TIMEOUT_MS);
  const body = await res.json();
  return body;
}

export async function postPlaceholder(rif, placeholder) {
  const res = await fetchWithTimeout(`${WORKER_BASE}/vetrine/placeholder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rif: String(rif), placeholder: !!placeholder })
  }, TIMEOUT_MS);
  const body = await res.json();
  return body;
}
