export { money } from "./data.js";
import { formErrorMessage } from "./formErrors.js";
import { createTabSession } from "./tabSession.js";

export const emptyData = {
  users: [], ngos: [], requests: [], donations: [], saved: {}, settings: {}, flags: [], contacts: [], accountActivity: [], itemCatalog: [], itemRequests: [], itemDonations: [], matches: [], notifications: [], unreadNotifications: 0,
};
const serverSnapshot = { data: emptyData, session: null, ready: false, error: "" };
let snapshot = serverSnapshot;
const tabSession = createTabSession();
let authBusy = false;
let loginContext = null;
let pendingRefresh = null;
let revision = 0;
const listeners = new Set();

function publish(next) {
  snapshot = next;
  for (const listener of listeners) listener();
}
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => serverSnapshot;
export const getSession = () => snapshot.session;
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function sendRequest(path, { method = "GET", body, signal } = {}, context = tabSession.current()) {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (unsafe && !context.csrfToken) {
    if (!context.csrfPending) {
      context.csrfPending = sendRequest("auth/csrf/", {}, context).finally(() => { context.csrfPending = null; });
    }
    await context.csrfPending;
  }
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method, signal, credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", "X-Session-Scope": context.scope, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(unsafe ? { "X-CSRFToken": context.csrfToken } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("We couldn’t connect to the service. Please try again.");
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("The service is temporarily unavailable. Please try again."); }
  if (!response.ok) {
    if (response.status === 403) context.csrfToken = "";
    const error = new Error(formErrorMessage(payload));
    error.fields = payload;
    error.status = response.status;
    throw error;
  }
  if (payload.csrfToken) context.csrfToken = payload.csrfToken;
  return payload;
}

export function request(path, options = {}) {
  if (authBusy && !["GET", "HEAD", "OPTIONS"].includes(options.method || "GET")) {
    return Promise.reject(new Error("Please wait for sign-in or sign-out to finish."));
  }
  return sendRequest(path, options);
}

export function refreshAppData(force = false) {
  if (authBusy) return Promise.resolve(snapshot);
  return refreshState(force);
}

function refreshState(force = false) {
  if (pendingRefresh && !force) return pendingRefresh;
  const ticket = ++revision;
  const pending = request("state/").then((result) => {
    if (ticket === revision) publish({ ...result, ready: true, error: "" });
    return result;
  }).catch((error) => {
    if (ticket === revision) publish({ data: emptyData, session: null, ready: true, error: error.message });
  }).finally(() => {
    if (pendingRefresh === pending) pendingRefresh = null;
  });
  pendingRefresh = pending;
  return pending;
}

async function change(path, body, method = "POST") {
  const context = tabSession.current();
  const result = await request(path, { method, body });
  if (context !== tabSession.current() || authBusy) {
    throw new Error("Your sign-in changed while this request was running. Check the original account before trying again.");
  }
  // Discard any pre-mutation request so older account data cannot win a race.
  await refreshAppData(true);
  return result;
}
export function registerAccount(role, fields) {
  return change("auth/signup/", { ...fields, agree: Boolean(fields.agree), role });
}
export async function loginAccount(role, email, password) {
  if (authBusy) throw new Error("Please wait for sign-in or sign-out to finish.");
  authBusy = true;
  ++revision;
  pendingRefresh = null;
  // Always establish a new login context. A duplicated tab may initially
  // inherit sessionStorage; signing in there must not replace its opener.
  const context = loginContext || (loginContext = tabSession.fresh());
  try {
    const result = await sendRequest("auth/login/", { method: "POST", body: { role, email: email.trim().toLowerCase(), password } }, context);
    tabSession.activate(context);
    loginContext = null;
    publish({ data: emptyData, session: result.session, ready: false, error: "" });
    await refreshState(true);
    return result;
  } finally { authBusy = false; }
}
export async function clearSession() {
  if (authBusy) throw new Error("Please wait for sign-in or sign-out to finish.");
  authBusy = true;
  ++revision;
  pendingRefresh = null;
  try {
    await sendRequest("auth/logout/", { method: "POST", body: {} });
    tabSession.activate(tabSession.fresh());
    loginContext = null;
    publish({ data: emptyData, session: null, ready: true, error: "" });
    await refreshState(true);
  } finally { authBusy = false; }
}
export const toggleSaved = (id) => change(`campaigns/${encodeURIComponent(id)}/saved/`, {});
export const createCampaign = (fields, status) => change("campaigns/", { ...fields, status });
export const submitCampaign = (id) => change(`campaigns/${encodeURIComponent(id)}/submit/`, {});
export const createItemRequest = (fields) => change("item-requests/", fields);
export const updateItemRequest = (id, fields) => change(`item-requests/${encodeURIComponent(id)}/`, fields, "PATCH");
export const reviewNgo = (email, status, reason = "") => change(`ngos/${encodeURIComponent(email)}/review/`, { status, reason });
export const reviewCampaign = (id, status, reason = "") => change(`campaigns/${encodeURIComponent(id)}/review/`, { status, reason });
export const reviewAccount = (account, action, reason = "") => change(`accounts/${account.id}/review/`, { action, reason, version: account.accessVersion });
export const approveAccounts = (accounts) => change("accounts/approve/", { accounts: accounts.map((account) => ({ id: account.id, version: account.accessVersion })) });
export const updateProfile = (fields) => change("profile/", fields, "PATCH");
export const updateSettings = (fields) => change("preferences/", fields, "PATCH");
export const sendContact = (fields) => change("contacts/", fields);
export const resolveActivity = (id) => change(`activities/${id}/resolve/`, {});
export async function recordDonation(fields) {
  const result = await change("donations/", fields);
  return result.id;
}
export function isPublicCampaign(campaign, data) {
  return ["Active", "Completed"].includes(campaign.status) && data.ngos.some((org) => org.email === campaign.ownerEmail && org.status === "Verified");
}
export function canDonate(campaign, data) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return isPublicCampaign(campaign, data) && campaign.status === "Active" && (!campaign.startDate || campaign.startDate <= today) && (!campaign.endDate || campaign.endDate >= today);
}

export const createItemDonation = (fields) => change("item-donations/", fields);
export const updateItemDonation = (id, fields) => change(`item-donations/${id}/`, fields, "PATCH");
export const deleteItemDonation = (id, version) => change(`item-donations/${id}/`, { version }, "DELETE");
export const deleteItemRequest = (id, version) => change(`item-requests/${id}/`, { version }, "DELETE");
export const analyseDonationPhoto = (image) => request("item-donations/analyse-photo/", { method: "POST", body: { image } });
export const analyseReceivedItem = (matchId, deliveryProof) => request(`matches/${encodeURIComponent(matchId)}/check-receipt-photo/`, { method: "POST", body: { deliveryProof } });
export const createMatch = (fields) => change("matches/", fields);
export const updateMatch = (id, fields) => change(`matches/${id}/`, fields, "PATCH");
export const markNotificationsRead = (id) => change("notifications/read/", id ? { id } : {});
