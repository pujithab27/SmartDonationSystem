"use client";
import { useState } from "react";
import { resolveActivity } from "../../lib/api";
import { Notice } from "../ui";

// Keep the existing administrator inbox and activity tools available.
export default function AdminCommunityActivity({ data, session }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);
  const flags = data.flags.filter((item) => data.settings[session.email]?.showResolved || !item.resolved);
  async function resolve(id) {
    setBusy(id);
    try {
      await resolveActivity(id);
      setError(false);
      setNotice("Activity marked as reviewed.");
    } catch (err) {
      setError(true);
      setNotice(err.message);
    } finally { setBusy(null); }
  }
  return <details className="access-panel access-history access-other-activity">
    <summary>Community inbox & activity <span>{data.contacts.length} messages · {flags.length} notices</span></summary>
    {notice && <Notice error={error}>{notice}</Notice>}
    <div className="access-overview-grid">
      <section><h3>Community inbox</h3>{data.contacts.length ? data.contacts.map((message) => <details className="inbox-message" key={message.id}><summary>{message.subject} · {message.name}</summary><p>{message.email}</p><p style={{ whiteSpace: "pre-wrap" }}>{message.message}</p></details>) : <p>No messages yet.</p>}</section>
      <section><h3>Activity to review</h3>{flags.length ? flags.map((item) => <div className="access-activity-item" key={item.id}><p>{item.message}</p>{!item.resolved && <button className="access-button secondary" disabled={busy !== null} onClick={() => resolve(item.id)}>{busy === item.id ? "Saving…" : "Mark reviewed"}</button>}</div>) : <p>No activity waiting for review.</p>}</section>
    </div>
  </details>;
}
