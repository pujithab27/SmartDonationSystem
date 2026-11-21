"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { request, refreshAppData } from "../../lib/api";
import { quantityLabel } from "../../lib/itemExchange";
import { EmptyState, Notice } from "../ui";

export default function AvailableDonations({ data, session }) {
  const [offers, setOffers] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All");
  const [selected, setSelected] = useState({}), [busy, setBusy] = useState(null), [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const load = () => request("item-donations/available/").then((result) => { if (active) { setOffers(result); setError(""); } }).catch((issue) => { if (active) setError(issue.message); }).finally(() => { if (active) setLoading(false); });
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [reload]);
  async function expressInterest(offer, quantity) {
    if (lock.current) return;
    lock.current = true; setBusy(offer.id); setError(""); setNotice("");
    try {
      const result = await request(`item-donations/${offer.id}/interest/`, {method: "POST", body: {quantity: Number(quantity)}});
      await refreshAppData(true); setNotice(result.detail); setReload((value) => value + 1);
    } catch (issue) { setError(issue.message); }
    finally { lock.current = false; setBusy(null); }
  }
  const visible = offers.filter((offer) => (category === "All" || offer.category === category) && `${offer.name} ${offer.city} ${offer.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="exchange-panel">
    <div className="exchange-panel-head"><div><h2>Find items for your NGO</h2><p>These items are available before a donor selects an NGO. Choose how much you need. We reuse the item details and your NGO profile address; the donor confirms the match.</p></div><button className="btn btn-outline btn-small" onClick={() => setReload((value) => value + 1)}>Refresh</button></div>
    <div className="exchange-filters"><label className="field"><span>Search items or city</span><input type="search" placeholder="Try backpack" value={query} onChange={(event) => setQuery(event.target.value)}/></label><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{[...new Set(offers.map((offer) => offer.category))].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {loading ? <p role="status">Loading available donations…</p> : <>
      <p className="exchange-result-count">{visible.length} available {visible.length === 1 ? "donation" : "donations"}</p>
      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 20}}>{visible.map((offer) => {
        const quantity = selected[offer.id] ?? "";
        const profile = data?.users?.find((user) => user.email === session?.email);
        const profileReady = profile && [profile.address, profile.city, profile.state, profile.pincode, profile.phone].every((value) => value?.trim());
        return <article className="exchange-panel" key={offer.id}>
          {offer.image && <img src={offer.image} alt={offer.name} style={{width: "100%", height: 180, objectFit: "contain", borderRadius: 12, background: "#f6f7f5"}}/>}
          <small>{offer.category}</small><h3>{offer.name}</h3><p><strong>{quantityLabel(offer.available, offer.unit)}</strong> available · {offer.city}</p>
          {offer.notes && <p>{offer.notes}</p>}
          {offer.interestRequestId ? <Notice>Interest sent. The donor will review your request.<br/><Link className="text-link" href="/dashboard/ngo/requests">View your requests</Link></Notice> : <form onSubmit={(event) => {event.preventDefault(); expressInterest(offer, quantity);}}>
            <label className="field"><span>Quantity needed ({offer.unit})</span><input aria-label={`Quantity needed for ${offer.name}`} type="number" inputMode="numeric" min="1" max={Math.floor(Number(offer.available))} step="1" required value={quantity} onChange={(event) => setSelected({...selected, [offer.id]: event.target.value})}/></label>
            <p className="tiny">Up to {quantityLabel(offer.available, offer.unit)} available. Sending interest does not reserve the items.</p>
            {profileReady ? <details><summary>Delivery & contact from your NGO profile</summary><p>{[profile.address, profile.city, profile.state, profile.pincode].join(", ")}</p><p>{profile.phone}</p><Link href="/dashboard/ngo/profile">Update profile</Link></details> : <Notice>Complete your address and phone in <Link href="/dashboard/ngo/profile">Organization profile</Link> once to use this shortcut.</Notice>}
            <button className="btn btn-primary btn-small" disabled={busy !== null || !profileReady}>{busy === offer.id ? "Sending..." : "Request this quantity"}</button>
          </form>}
        </article>;
      })}</div>
      {!visible.length && <EmptyState title="No available donations">{offers.length ? "Try a different search or category." : "New donor offers will appear here automatically."}</EmptyState>}
    </>}
  </section>;
}
