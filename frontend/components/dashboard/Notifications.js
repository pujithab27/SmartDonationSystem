"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { markNotificationsRead } from "../../lib/api";
import { EmptyState, Notice } from "../ui";

export function NotificationList({ data }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function read(id) {
    if (busy) return;
    setBusy(true); setError("");
    try { await markNotificationsRead(id); } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  const items = data.notifications || [];
  return <><div className="exchange-panel-head"><div><h3>Notifications</h3><small>{data.unreadNotifications || 0} unread</small></div><button type="button" className="text-link" disabled={busy || !data.unreadNotifications} onClick={() => read()}>Mark all as read</button></div>
    {error && <Notice error>{error}</Notice>}
    <div className="notification-list">{items.map((item) => {
      const kind = item.title.toLowerCase().includes("completed") ? "completed" : item.title.toLowerCase().includes("pickup") ? "pickup" : "donation";
      return <article className={`notification-item ${item.read ? "" : "unread"}`} data-kind={kind} key={item.id}>
        <span className="exchange-icon"><Icon name={kind === "completed" ? "check" : kind === "pickup" ? "clock" : "box"} size={18}/></span>
        <div><strong>{item.title}</strong><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-IN", {dateStyle: "medium", timeStyle: "short"})}</time><div className="notification-actions"><Link href={item.link}>View details →</Link>{!item.read && <button type="button" disabled={busy} onClick={() => read(item.id)}>Mark as read</button>}</div></div>
      </article>;
    })}</div>
    {!items.length && <EmptyState title="You’re all caught up">Donation and pickup updates will appear here.</EmptyState>}</>;
}
export default function Notifications({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (ref.current?.open && (event.key === "Escape" || event.type === "pointerdown" && !ref.current.contains(event.target))) { ref.current.open = false; if (event.key === "Escape") ref.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details ref={ref} className="notification-popover"><summary aria-label={`Notifications, ${data.unreadNotifications || 0} unread`}><Icon name="bell" size={20}/>{!!data.unreadNotifications && <span>{Math.min(data.unreadNotifications, 99)}</span>}</summary><section className="notification-menu" aria-label="Notifications" onClick={(event) => { if (event.target.closest("a")) ref.current.open = false; }}><NotificationList data={data}/></section></details>;
}
