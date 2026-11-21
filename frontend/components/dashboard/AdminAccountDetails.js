"use client";
import { useState } from "react";
import { Notice, Status } from "../ui";
import AdminTracking from "./AdminTracking";
import { ReviewDialog } from "./AdminAccessPortal";

export default function AdminAccountDetails({ account, data, onBack }) {
  const ngo = account.role === "ngo";
  const [tab, setTab] = useState(ngo ? "requests" : "donations");
  const [review, setReview] = useState(null), [notice, setNotice] = useState("");
  const org = data.ngos.find((entry) => entry.email === account.email);
  const tabs = ngo ? [["requests", "Requested items"], ["tracking", "Incoming donations & pickups"], ["received", "Received items"]] : [["donations", "Items offered"], ["tracking", "Matches & pickups"], ["received", "Delivered items"]];
  const scoped = tab === "received" ? {...data, matches: data.matches.filter((match) => match.status === "Completed")} : data;
  return <div className="admin-tracking">
    <button className="access-button secondary" style={{justifySelf: "start"}} onClick={onBack}>Back to accounts</button>
    <section className="exchange-panel">
      <div className="exchange-panel-head"><div><span className="eyebrow">{ngo ? "NGO PROFILE" : "DONOR PROFILE"}</span><h2>{account.name}</h2><Status value={account.approvalStatus}/></div><div className="exchange-actions"><button className="access-button primary" onClick={() => setReview({account})}>Review account</button>{account.approvalStatus === "Approved" && <button className="access-button secondary" onClick={() => setReview({account, action: account.isActive ? "Deactivated" : "Activated"})}>{account.isActive ? "Pause access" : "Restore access"}</button>}</div></div>
      <dl className="tracking-facts"><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Phone</dt><dd>{account.phone || "Not provided"}</dd></div><div><dt>Address</dt><dd>{[account.address, account.city, account.state, account.pincode].filter(Boolean).join(", ") || "Not provided"}</dd></div><div><dt>Joined / login access</dt><dd>{account.joinedAt ? new Date(account.joinedAt).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"}) : "Not recorded"} / {account.canLogin ? "Allowed" : "Blocked"}</dd></div>{org && <><div><dt>Registration number</dt><dd>{org.registrationNumber}</dd></div><div><dt>Website</dt><dd>{org.website || "Not provided"}</dd></div><div><dt>Organization mission</dt><dd>{org.description || "Not provided"}</dd></div></>}{account.reviewNote && <div><dt>Latest review note</dt><dd>{account.reviewNote}</dd></div>}</dl>
    </section>
    {notice && <Notice>{notice}</Notice>}
    <div className="overview-tabs" aria-label="Account activity views">{tabs.map(([key, title]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</div>
    <AdminTracking key={`${account.id}:${tab}`} data={scoped} mode={tab === "received" ? "tracking" : tab} accountRole={account.role} accountEmail={account.email}/>
    {review && <ReviewDialog review={review} ngos={data.ngos} onClose={() => setReview(null)} onSuccess={(message) => {setNotice(message); setReview(null);}}/>}
  </div>;
}
