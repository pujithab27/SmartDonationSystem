"use client";
import { useState } from "react";

export default function DeleteItemButton({ label, onDelete, disabled = false }) {
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try { await onDelete(); setConfirming(false); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <span className="delete-item-action">{confirming ? <span role="group" aria-label={`Confirm deletion of ${label}`}><span>Delete {label} permanently?</span><button type="button" disabled={busy || disabled} onClick={remove}>{busy ? "Deleting…" : "Confirm delete"}</button><button type="button" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>Keep it</button></span> : <button type="button" disabled={disabled} onClick={() => setConfirming(true)}>Delete</button>}{error && <span role="alert">{error}</span>}</span>;
}
