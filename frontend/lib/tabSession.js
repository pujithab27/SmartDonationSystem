const STORAGE_KEY = "allofus.sessionScope";
const validScope = (value) => /^[a-f0-9]{32}$/.test(value || "");

// Only a random cookie selector is stored here. Session credentials stay in
// HttpOnly cookies and are never exposed to JavaScript or localStorage.
export function createTabSession() {
  let active;
  function fresh() {
    return { scope: crypto.randomUUID().replaceAll("-", ""), csrfToken: "", csrfPending: null };
  }
  function activate(context) {
    active = context;
    try { window.sessionStorage.setItem(STORAGE_KEY, context.scope); }
    catch { /* Storage blocked: keep this page isolated in memory. */ }
    return active;
  }
  function current() {
    if (active) return active;
    let saved;
    try { saved = window.sessionStorage.getItem(STORAGE_KEY); }
    catch { /* SSR and storage-restricted browsers have no persisted scope. */ }
    return activate(validScope(saved) ? { scope: saved, csrfToken: "", csrfPending: null } : fresh());
  }
  return { current, fresh, activate };
}
