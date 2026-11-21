"use client";
import { useState } from "react";
import { Status } from "../ui";
import { matchesSearch } from "../../lib/search";

export default function AdminDirectory({ data, role, onOpenAccount }) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [page, setPage] = useState(1);
  const ngo = role === "ngo";
  const profiles = data.users.filter((user) => user.role === role).map((user) => {
    const records = ngo ? data.itemRequests.filter((item) => item.ownerEmail === user.email) : data.itemDonations.filter((item) => item.donorEmail === user.email);
    const matches = data.matches.filter((match) => match[ngo ? "ngoEmail" : "donorEmail"] === user.email);
    const completed = matches.filter((match) => match.status === "Completed").length;
    const ongoing = matches.filter((match) => ["Pending", "Pickup scheduled"].includes(match.status)).length;
    const dates = [...records, ...matches].flatMap((record) => [record.createdAt, record.completedAt, ...(record.events || []).map((event) => event.createdAt)]).map((date) => Date.parse(date)).filter(Number.isFinite);
    return { user, records: records.length, completed, ongoing, latest: dates.length ? Math.max(...dates) : 0 };
  }).sort((a, b) => b.latest - a.latest || a.user.name.localeCompare(b.user.name));
  const filtered = profiles.filter(({user, records, ongoing, completed}) => matchesSearch([user.name, user.email, user.city, user.phone].filter(Boolean).join(" "), query) && (activity === "all" || (activity === "ongoing" && ongoing > 0) || (activity === "completed" && completed > 0) || (activity === "new" && records === 0 && ongoing === 0 && completed === 0)));
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, pages);
  return <div className={`admin-directory ${ngo ? "ngo-directory" : "donor-directory"}`}>
    <section className="directory-intro">
      <div><span className="eyebrow">{ngo ? "ORGANIZATION DIRECTORY" : "DONOR DIRECTORY"}</span><h2>{ngo ? "Know every NGO. Follow every receipt." : "Know your donors. Follow their contributions."}</h2><p>{ngo ? "Open an organization to view its needs, incoming donations, pickups and confirmed receipts." : "Open a donor to view their contact details, item offers, pickups and completed deliveries."}</p></div>
      <div className="directory-total"><strong>{profiles.length}</strong><span>{ngo ? "NGO profiles" : "Donor profiles"}</span></div>
    </section>
    <div className="directory-summary">
      {[[ngo ? "Requests posted" : "Item offers", "records"], ["Ongoing deliveries", "ongoing"], [ngo ? "Confirmed receipts" : "Completed deliveries", "completed"]].map(([label, field]) => <div key={field}><span>{label}</span><strong>{profiles.reduce((sum, entry) => sum + entry[field], 0)}</strong></div>)}
    </div>
    <section className="directory-list" aria-label={ngo ? "NGO profiles" : "Donor profiles"}>
      <div className="directory-tools"><label>Find {ngo ? "an NGO" : "a donor"}<input type="search" placeholder="Search name, email, phone or city" value={query} onChange={(event) => {setQuery(event.target.value); setPage(1);}}/></label><label>Donation activity<select value={activity} onChange={(event) => {setActivity(event.target.value); setPage(1);}}><option value="all">All activity</option><option value="ongoing">Ongoing deliveries</option><option value="completed">Completed deliveries</option><option value="new">No donation activity yet</option></select></label></div>
      <p className="directory-result" role="status">{filtered.length} {ngo ? "NGO" : "donor"} {filtered.length === 1 ? "profile" : "profiles"} · Most recent activity first</p>
      <div className="directory-grid">{filtered.slice((current - 1) * 12, current * 12).map(({user, records, ongoing, completed, latest}) => <article className="directory-card" key={user.id}>
        <div className="directory-card-head"><span className="directory-avatar" aria-hidden="true">{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><div><h3>{user.name}</h3><p>{[user.city, user.state].filter(Boolean).join(", ") || "Location not provided"}</p></div></div>
        <div className="directory-access"><Status value={user.approvalStatus}/><span>{user.canLogin ? "Access enabled" : "Access restricted"}</span></div>
        <div className="directory-contact"><span>{user.email}</span><span>{user.phone || "Phone not provided"}</span></div>
        <dl className="directory-stats"><div><dt>{ngo ? "Requests" : "Offers"}</dt><dd>{records}</dd></div><div><dt>Ongoing</dt><dd>{ongoing}</dd></div><div><dt>{ngo ? "Received" : "Delivered"}</dt><dd>{completed}</dd></div></dl>
        <div className="directory-card-footer"><p>{latest ? `Last activity ${new Date(latest).toLocaleDateString("en-IN", {timeZone: "Asia/Kolkata"})}` : records || ongoing || completed ? "Activity date not recorded" : "No donation activity yet"}</p><button className="access-button primary" aria-label={`Open profile for ${user.name}`} onClick={() => onOpenAccount(user.id)}>Open profile <span aria-hidden="true">→</span></button></div>
      </article>)}</div>
      {!filtered.length && <div className="directory-empty"><h3>No profiles found</h3><p>{profiles.length ? "Try a different search or activity filter." : `Registered ${ngo ? "NGOs" : "donors"} will appear here.`}</p></div>}
      {pages > 1 && <nav className="directory-pagination" aria-label="Profile pages"><button className="access-button secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button className="access-button secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></nav>}
    </section>
  </div>;
}
