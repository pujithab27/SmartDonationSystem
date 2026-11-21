"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { Notice } from "../ui";
import { approveAccounts, refreshAppData, reviewAccount } from "../../lib/api";

const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const roleName = (role) => role === "ngo" ? "NGO" : "Donor";
function Avatar({ account }) {
  return <span className={`access-avatar ${account.role}`}>{initials(account.name)}</span>;
}
function Status({ account }) {
  const status = account.approvalStatus;
  return <span className={`access-status ${status.toLowerCase()}`}><span />{status}</span>;
}
function Blank({ title, children }) {
  return <div className="access-empty"><span><Icon name="shield" size={28} /></span><h3>{title}</h3><p>{children}</p></div>;
}

export function ReviewDialog({ review, ngos, onClose, onSuccess }) {
  const dialog = useRef(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const account = review.account;
  const org = ngos.find((item) => item.email === account?.email);
  const bulk = Boolean(review.accounts);
  const accessChange = ["Activated", "Deactivated"].includes(review.action);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); previousFocus?.focus(); };
  }, []);
  async function save(action) {
    if (["Rejected", "Deactivated"].includes(action) && !reason.trim()) {
      setError("Please add a reason so the decision is clear.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (bulk) await approveAccounts(review.accounts);
      else await reviewAccount(account, action, reason);
      onSuccess(bulk ? `${review.accounts.length} ${review.accounts.length === 1 ? "account" : "accounts"} approved. Login access is now available.` : action === "Approved" ? `${account.name} is approved and can now sign in.` : `${account.name}: ${action.toLowerCase()}.`);
    } catch (err) {
      setError(err.message);
      if (err.status === 409) await refreshAppData(true);
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="access-dialog" aria-labelledby="account-review-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><span className="eyebrow">COMMUNITY ACCESS</span><button className="access-icon-button" aria-label="Close review" disabled={busy} onClick={onClose}><Icon name="close" /></button></header>
    <h2 id="account-review-title">{bulk ? `Approve ${review.accounts.length} ${review.accounts.length === 1 ? "account" : "accounts"}?` : accessChange ? `${review.action === "Activated" ? "Restore" : "Pause"} login access?` : "A person behind every profile."}</h2>
    {bulk ? <><p>Approval enables login for each selected account. Confirm that you have reviewed each profile.</p><ul className="access-bulk-list">{review.accounts.map((item) => <li key={item.id}><Avatar account={item} /><div><strong>{item.name}</strong><small>{item.email}</small></div><span className={`access-role ${item.role}`}>{roleName(item.role)}</span></li>)}</ul></> : <>
      <div className="access-review-person"><Avatar account={account} /><div><h3>{account.name}</h3><p>{account.email}</p></div><Status account={account} /></div>
      {accessChange ? <p>{review.action === "Deactivated" ? "This account will be signed out and cannot log in again until you restore access. Its approval and existing records will be kept." : "This approved account will be able to sign in again with its existing email and password."}</p> : <>
        <dl className="access-details">
          <div><dt>Account type</dt><dd>{roleName(account.role)}</dd></div><div><dt>Registered</dt><dd>{date(account.joinedAt)}</dd></div>
          <div><dt>Phone</dt><dd>{account.phone || "Not provided"}</dd></div><div><dt>Location</dt><dd>{[account.city, account.state].filter(Boolean).join(", ") || "Not provided"}</dd></div>
          <div className="wide"><dt>Address</dt><dd>{[account.address, account.pincode].filter(Boolean).join(" · ") || "Not provided"}</dd></div>
          {org && <><div><dt>Registration number</dt><dd>{org.registrationNumber}</dd></div><div><dt>Website</dt><dd>{org.website || "Not provided"}</dd></div><div className="wide"><dt>Organization mission</dt><dd>{org.description}</dd></div></>}
        </dl>
        {account.reviewNote && <div className="access-previous-note"><strong>Previous review</strong><p>{account.reviewNote}</p></div>}
        <p className="access-review-guidance"><Icon name="shield" size={17} />Check the contact details{org ? " and organization registration" : ""} before granting access.</p>
      </>}
      <label className="field"><span>Review note {review.action === "Deactivated" ? "(required)" : "(required to reject)"}</span><textarea maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add a clear reason or a helpful note…" disabled={busy} /></label>
    </>}
    {error && <Notice error>{error}</Notice>}
    <footer>
      <button className="access-button secondary" onClick={onClose} disabled={busy}>Cancel</button>
      {!bulk && !accessChange && account.approvalStatus !== "Rejected" && <button className="access-button danger" disabled={busy} onClick={() => save("Rejected")}><Icon name="close" size={16} />Reject</button>}
      {(bulk || accessChange || account.approvalStatus !== "Approved") && <button className={`access-button ${review.action === "Deactivated" ? "danger" : "primary"}`} disabled={busy} onClick={() => save(review.action || "Approved")}><Icon name={review.action === "Deactivated" ? "close" : "check"} size={16} />{busy ? "Saving…" : bulk ? "Approve selected" : accessChange ? review.action === "Activated" ? "Restore access" : "Pause access" : "Approve account"}</button>}
    </footer>
  </dialog>;
}

export default function AdminAccessPortal({ data, section = "overview", onOpenAccount }) {
  const overview = section === "overview";
  const [filter, setFilter] = useState(section === "donors" || section === "ngos" ? "All" : "Pending");
  const [role, setRole] = useState(section === "donors" ? "donor" : section === "ngos" ? "ngo" : "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("oldest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [review, setReview] = useState(null);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const accounts = data.users.filter((item) => ["donor", "ngo"].includes(item.role) && (section === "donors" ? item.role === "donor" : section === "ngos" ? item.role === "ngo" : true));
  const pending = accounts.filter((item) => item.approvalStatus === "Pending").sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const counts = { All: accounts.length, Pending: pending.length, Approved: accounts.filter((a) => a.approvalStatus === "Approved").length, Rejected: accounts.filter((a) => a.approvalStatus === "Rejected").length, Inactive: accounts.filter((a) => !a.isActive).length };
  const visible = accounts.filter((item) => {
    const org = data.ngos.find((ngo) => ngo.email === item.email);
    return (filter === "All" || (filter === "Inactive" ? !item.isActive : item.approvalStatus === filter)) &&
      (role === "all" || item.role === role) &&
      `${item.name} ${item.email} ${item.city} ${org?.registrationNumber || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (new Date(a.joinedAt) - new Date(b.joinedAt)) * (sort === "newest" ? -1 : 1));
  const pages = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * 10, currentPage * 10);
  const selectedAccounts = visible.filter((item) => selected.includes(item.id) && item.approvalStatus === "Pending");
  const pendingRows = rows.filter((item) => item.approvalStatus === "Pending");
  function changeFilter(setter, value) { setter(value); setPage(1); setSelected([]); }
  function openReview(account, action) { setReview({ account, action }); }
  async function refresh() { setRefreshing(true); await refreshAppData(true); setRefreshing(false); }
  function completed(message) { setReview(null); setSelected([]); setNotice(message); }
  return <div className="admin-access">
    {notice && <Notice>{notice}</Notice>}
    {overview ? <>
      <section className="access-welcome">
        <div><span className="eyebrow">GOOD BEGINS WITH TRUST</span><h2>Make room for<br /><em>the next act of kindness.</em></h2><p>Every new donor and NGO starts here. A thoughtful review makes our giving community stronger.</p><Link href="/dashboard/admin/approvals" className="access-button cream">Review accounts <Icon name="arrow" size={17} /></Link></div>
        <div className="review-readout"><span className="mono-label">AWAITING YOUR REVIEW</span><strong>{String(pending.length).padStart(2, "0")}</strong><span>{pending.length === 1 ? "account needs a decision" : "accounts need a decision"}</span><Link href="/dashboard/admin/approvals">Open the review queue <Icon name="diagonal" size={20} /></Link></div>
      </section>
      <div className="access-metrics">
        {[{ title: "Awaiting review", value: pending.length, detail: "Your next opportunity to help", icon: "clock", tone: "warm" }, { title: "Donor accounts", value: accounts.filter((a) => a.role === "donor").length, detail: `${pending.filter((a) => a.role === "donor").length} awaiting approval`, icon: "people", tone: "sage" }, { title: "NGO partners", value: accounts.filter((a) => a.role === "ngo").length, detail: `${pending.filter((a) => a.role === "ngo").length} awaiting approval`, icon: "building", tone: "lilac" }, { title: "Access granted", value: accounts.filter((a) => a.canLogin).length, detail: "Approved and active accounts", icon: "shield", tone: "sage" }].map((metric) => <article className={`access-metric ${metric.tone}`} key={metric.title}><div><span>{metric.title}</span><Icon name={metric.icon} size={19} /></div><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
      </div>
      <div className="access-overview-grid">
        <section className="access-panel"><div className="access-panel-heading"><div><span className="eyebrow">THE NEXT WELCOME</span><h2>Approval queue <span className="access-count">{pending.length}</span></h2><p>New accounts stay signed out until you approve them.</p></div><Icon name="shield" size={24} /></div>
          {pending.length ? <div className="access-queue">{pending.slice(0, 5).map((account) => <article key={account.id}><Avatar account={account} /><div className="access-person"><strong>{account.name}</strong><small>{account.email}</small><span>{roleName(account.role)} · {account.city || "Location not provided"}</span></div><button className="access-button secondary" onClick={() => openReview(account)}>Review <Icon name="arrow" size={15} /></button></article>)}</div> : <Blank title="Everyone has been welcomed">New donor and NGO registrations will appear here for your review.</Blank>}
          <Link className="access-panel-link" href="/dashboard/admin/approvals">View all accounts <Icon name="arrow" size={17} /></Link>
        </section>
        <div className="access-side-panels"><section className="access-panel"><div className="access-panel-heading"><div><span className="eyebrow">A GROWING COMMUNITY</span><h2>Recent registrations</h2></div></div><div className="access-recent">{[...accounts].sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt)).slice(0, 4).map((account) => <button key={account.id} onClick={() => openReview(account)}><Avatar account={account} /><span><strong>{account.name}</strong><small>{roleName(account.role)} · {date(account.joinedAt)}</small></span><Status account={account} /></button>)}{!accounts.length && <p>No registrations yet.</p>}</div></section>
          <section className="access-note"><Icon name="shield" size={23} /><div><h3>Your review makes a difference.</h3><p>Verify the person or organization, then approve their place in the community. Access can be paused whenever a closer look is needed.</p></div></section>
        </div>
      </div>
      <section className="access-panel access-history"><div className="access-panel-heading"><div><span className="eyebrow">CLEAR DECISIONS, SHARED TRUST</span><h2>Recent decisions</h2></div></div>{data.accountActivity?.length ? data.accountActivity.slice(0, 5).map((event) => <div className="access-event" key={event.id}><span className={`access-event-icon ${event.action === "Rejected" || event.action === "Deactivated" ? "negative" : ""}`}><Icon name={event.action === "Rejected" || event.action === "Deactivated" ? "close" : "check"} size={17} /></span><div><strong>{event.name} <span>· {event.action.toLowerCase()}</span></strong><p>{event.reason || `Reviewed by ${event.administrator}`}</p></div><time>{date(event.date)}</time></div>) : <p className="access-history-empty">Your approval and access decisions will be recorded here.</p>}</section>
    </> : <>
      <section className="access-guidance"><span><Icon name="shield" size={24} /></span><div><strong>A warm welcome starts with a careful review.</strong><p>Approve donors and NGOs to let them sign in. Pending, rejected, and inactive accounts cannot access their workspace.</p></div><span className="access-pending-total">{pending.length}<small>awaiting review</small></span></section>
      <section className="access-panel access-directory" aria-label="Account directory">
        <div className="access-directory-top"><div className="access-tabs" aria-label="Filter by approval status">{["Pending", "Approved", "Rejected", "All", "Inactive"].map((status) => <button key={status} aria-pressed={filter === status} className={filter === status ? "active" : ""} onClick={() => changeFilter(setFilter, status)}>{status}<span>{counts[status]}</span></button>)}</div><button className="access-button text" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
        <div className="access-tools"><label className="access-search"><Icon name="search" size={18} /><input aria-label="Search accounts" type="search" value={query} placeholder="Search by name, email, or registration number" onChange={(event) => changeFilter(setQuery, event.target.value)} /></label><label className="access-select"><span>Account type</span><select value={role} onChange={(event) => changeFilter(setRole, event.target.value)}><option value="all">Donors & NGOs</option><option value="donor">Donors only</option><option value="ngo">NGOs only</option></select></label><label className="access-select"><span>Sort by</span><select value={sort} onChange={(event) => changeFilter(setSort, event.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="name">Name A–Z</option></select></label></div>
        {selectedAccounts.length > 0 && <div className="access-selection"><span>{selectedAccounts.length} pending {selectedAccounts.length === 1 ? "account" : "accounts"} selected</span><button className="access-button primary" onClick={() => setReview({ accounts: selectedAccounts })}><Icon name="check" size={16} />Approve selected</button><button className="access-button text" onClick={() => setSelected([])}>Clear</button></div>}
        {rows.length ? <div className="access-table-scroll" tabIndex={0} role="region" aria-label="Accounts table, scroll horizontally on small screens"><table className="access-table"><thead><tr><th className="access-check"><input type="checkbox" aria-label="Select pending accounts on this page" disabled={!pendingRows.length} checked={pendingRows.length > 0 && pendingRows.every((a) => selected.includes(a.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...pendingRows.map((a) => a.id)])] : selected.filter((id) => !pendingRows.some((a) => a.id === id)))} /></th><th>Account</th><th>Type</th><th>Details</th><th>Joined</th><th>Status</th><th>Login access</th><th>Review</th></tr></thead><tbody>{rows.map((account) => { const org = data.ngos.find((ngo) => ngo.email === account.email); return <tr key={account.id} className={selected.includes(account.id) ? "selected" : ""}><td className="access-check"><input type="checkbox" aria-label={`Select ${account.name}`} disabled={account.approvalStatus !== "Pending"} checked={selected.includes(account.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, account.id] : selected.filter((id) => id !== account.id))} /></td><td><div className="access-table-person"><Avatar account={account} /><div><strong>{account.name}</strong><small>{account.email}</small></div></div></td><td><span className={`access-role ${account.role}`}>{roleName(account.role)}</span></td><td><span>{account.city || "Not provided"}</span><small>{org?.registrationNumber || account.phone || "—"}</small></td><td className="access-date">{date(account.joinedAt)}</td><td><Status account={account} />{account.approvalStatus === "Rejected" && account.reviewNote && <small className="access-truncated-note" title={account.reviewNote}>{account.reviewNote}</small>}</td><td><button className={`access-switch ${account.canLogin ? "on" : ""}`} role="switch" aria-checked={account.canLogin} aria-label={`Login access for ${account.name}`} disabled={account.approvalStatus !== "Approved"} title={account.approvalStatus !== "Approved" ? "Approval is required first" : account.isActive ? "Pause login access" : "Restore login access"} onClick={() => openReview(account, account.isActive ? "Deactivated" : "Activated")}><span /></button><small>{account.canLogin ? "Allowed" : account.approvalStatus === "Approved" ? "Paused" : "Blocked"}</small></td><td>{onOpenAccount && <button className="access-button secondary" onClick={() => onOpenAccount(account.id)}>View details & activity</button>}<button className="access-button secondary" aria-label={`Review ${account.name}`} onClick={() => openReview(account)}>Review <Icon name="arrow" size={14} /></button></td></tr>; })}</tbody></table></div> : <Blank title={query || role !== "all" ? "No matching accounts" : filter === "Pending" ? "All caught up" : "No accounts here yet"}>{query || role !== "all" ? "Try another name, email, registration number, or account type." : "Accounts matching this status will appear here."}</Blank>}
        <footer className="access-table-footer"><span>{visible.length ? `${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, visible.length)} of ${visible.length}` : "0"} {visible.length === 1 ? "account" : "accounts"}</span><div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
      </section>
      <p className="access-bottom-note"><Icon name="shield" size={15} />Approval grants login access. You can pause access later without deleting an account.</p>
    </>}
    {review && <ReviewDialog review={review} ngos={data.ngos} onClose={() => setReview(null)} onSuccess={completed} />}
  </div>;
}
