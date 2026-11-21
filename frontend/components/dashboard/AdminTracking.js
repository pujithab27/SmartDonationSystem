"use client";
import { useState } from "react";
import Link from "next/link";
import { EmptyState, Metric, Status } from "../ui";
import { MatchPhotos, MatchTracking } from "./Matches";
import { quantityLabel } from "../../lib/itemExchange";
import { requestProgress } from "../../lib/itemRequests";
import { matchesSearch } from "../../lib/search";

const when = (value) => value ? new Date(value).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"}) : "Not scheduled";
export default function AdminTracking({ data, mode = "tracking", accountRole, accountEmail }) {
  const [query, setQuery] = useState(""), [status, setStatus] = useState("All"), [accountSelection, setAccount] = useState("");
  const account = accountEmail || accountSelection;
  const [proofId, setProofId] = useState(null);
  const matches = data.matches || [], donations = data.itemDonations || [], requests = data.itemRequests || [];
  const accounts = data.users.filter((user) => ["donor", "ngo"].includes(user.role) && (!accountRole || user.role === accountRole));
  const chosen = accounts.find((user) => user.email === account);
  const scopeMatch = (match) => !account || match.donorEmail === account || match.ngoEmail === account;
  const scopedMatches = matches.filter(scopeMatch);
  const scopedDonations = donations.filter((entry) => !account || entry.donorEmail === account || scopedMatches.some((m) => m.donationId === entry.id));
  const scopedRequests = requests.filter((entry) => !account || entry.ownerEmail === account || scopedMatches.some((m) => m.requestId === entry.id));
  const search = (entry) => matchesSearch([entry.id, entry.name, entry.title, entry.ngoName, entry.donorName, entry.donorEmail, entry.ngoEmail, entry.ownerEmail, entry.requestTitle, entry.city, entry.deliveryCity, ...(entry.items || []).map((item) => item.name)].filter(Boolean).join(" "), query);
  const rows = mode === "donations" ? scopedDonations : mode === "requests" ? scopedRequests : scopedMatches;
  const rowStatus = (entry) => mode === "requests" ? requestProgress(entry).status : entry.status;
  const visible = rows.filter((entry) => search(entry) && (status === "All" || rowStatus(entry) === status));
  return <div className="admin-tracking">
    <div className="exchange-metrics"><Metric label="Donation offers" value={scopedDonations.length} icon="box"/><Metric label="NGO requests" value={scopedRequests.length} icon="building"/><Metric label="Confirmed deliveries" value={scopedMatches.filter((m) => m.status === "Completed").length} icon="check"/><Metric label="Awaiting delivery" value={scopedMatches.filter((m) => ["Pending", "Pickup scheduled"].includes(m.status)).length} icon="clock"/></div>
    <section className="exchange-panel"><h2>{accountRole ? `${accountRole === "donor" ? "Donor" : "NGO"} activity tracking` : mode === "donations" ? "Every donation offer" : mode === "requests" ? "Every NGO request" : "From offer to confirmed receipt"}</h2><p>Track real records across the community. Pickup and receipt actions stay with the donor and receiving NGO.</p>
      <div className="tracking-filters"><label>Search<input type="search" aria-label="Search tracking records" placeholder="Name, item, city, email or ID" value={query} onChange={(e) => setQuery(e.target.value)}/></label>{!accountEmail && <label>Account<select aria-label="Track an account" value={account} onChange={(e) => {setAccount(e.target.value); setStatus("All");}}><option value="">All {accountRole ? accountRole === "donor" ? "donors" : "NGOs" : "accounts"}</option>{accounts.map((user) => <option key={user.id} value={user.email}>{user.name} — {user.email}</option>)}</select></label>}<label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{[...new Set(rows.map(rowStatus))].sort().map((value) => <option key={value}>{value}</option>)}</select></label></div>
      {chosen && !accountEmail && <div className="tracking-account"><h3>{chosen.name}</h3><p>{chosen.email} · {chosen.phone || "No phone provided"}</p><p>{[chosen.address, chosen.city, chosen.state, chosen.pincode].filter(Boolean).join(", ")}</p><Status value={chosen.approvalStatus}/><span> Login {chosen.canLogin ? "allowed" : "blocked"}</span><Link className="text-link" href={`/dashboard/admin/${chosen.role === "donor" ? "donors" : "ngos"}`}>Manage account access</Link></div>}
      <p role="status">{visible.length} {visible.length === 1 ? "record" : "records"} shown</p>
      {!visible.length && <EmptyState title="No records in this view">Try another account, status or search. New activity appears after donors and NGOs take action.</EmptyState>}
      <div className="tracking-records">{visible.map((entry) => <details key={entry.id} className="tracking-record"><summary><span><strong>#{entry.id} · {entry.name || entry.title}</strong><small>{mode === "donations" ? entry.donorName : mode === "requests" ? entry.ngoName : `${entry.donorName} → ${entry.ngoName}`}</small></span><Status value={rowStatus(entry)}/></summary>
        <div className="tracking-detail"><p>Created {when(entry.createdAt)}</p>
          {mode === "donations" ? <><p>{quantityLabel(entry.quantity, entry.unit)} offered · {quantityLabel(entry.completed, entry.unit)} delivered · {quantityLabel(entry.available, entry.unit)} available</p><p>{entry.donorEmail}</p><p>{[entry.address, entry.city, entry.state, entry.pincode].join(", ")}</p><p>{entry.notes}</p><h3>Linked matches</h3>{matches.filter((m) => m.donationId === entry.id).map((m) => <p key={m.id}>#{m.id} · {m.ngoName} · {quantityLabel(m.quantity, m.unit)} · {m.status}</p>)}</> : mode === "requests" ? <><p>{entry.ownerEmail} · {entry.contactPhone}</p><p>{[entry.deliveryAddress, entry.deliveryCity, entry.deliveryState, entry.deliveryPincode].join(", ")}</p><p>Priority: {entry.priority} · Needed by: {entry.neededBy || "Not specified"}</p><ul>{entry.items.map((item) => <li key={item.itemId}>{item.name}: {quantityLabel(item.fulfilled || 0, item.unit)} received of {quantityLabel(item.quantity, item.unit)} requested</li>)}</ul><p>{entry.notes}</p></> : <><dl className="tracking-facts"><div><dt>Donation / request</dt><dd>#{entry.donationId} / #{entry.requestId} · {entry.requestTitle}</dd></div><div><dt>Items allocated</dt><dd>{quantityLabel(entry.quantity, entry.unit)} · {entry.name}</dd></div><div><dt>Donor contact</dt><dd>{entry.donorEmail} · {entry.donorPhone || "No phone"}</dd></div><div><dt>NGO contact</dt><dd>{entry.ngoEmail} · {entry.contactPhone || "No phone"}</dd></div><div><dt>Pickup</dt><dd>{when(entry.pickupAt)}<br/>{[entry.pickupAddress, entry.pickupCity, entry.pickupState, entry.pickupPincode].filter(Boolean).join(", ")}</dd></div><div><dt>Delivery</dt><dd>{[entry.deliveryAddress, entry.deliveryCity, entry.deliveryState, entry.deliveryPincode].filter(Boolean).join(", ")}<br/>{entry.completedAt ? `Received ${when(entry.completedAt)}` : "Receipt not confirmed"}</dd></div></dl>{entry.pickupNotes && <p>Pickup notes: {entry.pickupNotes}</p>}<MatchTracking events={entry.events}/><button className="btn btn-outline btn-small" onClick={() => setProofId(proofId === entry.id ? null : entry.id)}>{proofId === entry.id ? "Hide photos" : "View donation & receipt photos"}</button>{proofId === entry.id && <MatchPhotos match={entry} readOnly/>}</>}
        </div></details>)}</div>
    </section>
  </div>;
}
