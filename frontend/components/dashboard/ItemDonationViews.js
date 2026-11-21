"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "../Icon";
import ItemRequestSummary from "../ItemRequestSummary";
import { EmptyState, Metric, Status } from "../ui";
import { openRequestItems, quantityLabel, requestDonationHref } from "../../lib/itemExchange";
import { matchesSearch } from "../../lib/search";
import CommunityOverview from "./CommunityOverview";
import { readDirectoryFilters } from "../../lib/givingExchange";
import { deleteItemDonation } from "../../lib/api";
import DeleteItemButton from "./DeleteItemButton";

export function ExchangeOverview({ data, role }) {
  return <CommunityOverview data={data} role={role}/>;
}
export function ItemDonationHistory({ data }) {
  const donations = data.itemDonations || [];
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All"), [status, setStatus] = useState("All");
  const visible = donations.filter((entry) => (category === "All" || category === entry.category) && (status === "All" || status === entry.status) && matchesSearch(`${entry.name} ${entry.city} ${entry.category}`, query));
  return <div className="exchange-workspace"><div className="exchange-metrics"><Metric label="Total donations" value={donations.length} icon="box"/><Metric label="Matched" value={donations.filter((entry) => ["Matched", "Pickup scheduled", "Partly delivered"].includes(entry.status)).length} icon="link"/><Metric label="Completed" value={donations.filter((entry) => entry.status === "Completed").length} icon="check"/><Metric label="Pending" value={donations.filter((entry) => entry.status === "Pending").length} icon="clock"/></div><section className="exchange-panel"><div className="exchange-panel-head"><div><h2>Your item donations</h2><p>A record of the things you’ve shared.</p></div><Link className="btn btn-primary btn-small" href="/dashboard/donor/give">Add donation <Icon name="plus" size={15}/></Link></div><div className="exchange-filters"><label className="goods-search"><Icon name="search" size={18}/><input aria-label="Search donations" type="search" placeholder="Search donations" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="Donation category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All categories</option>{[...new Set(donations.map((entry) => entry.category))].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Donation status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="All">All statuses</option>{["Pending", "Matched", "Pickup scheduled", "Partly delivered", "Completed"].map((value) => <option key={value}>{value}</option>)}</select></div><p className="exchange-result-count">Showing {visible.length} of {donations.length} {donations.length === 1 ? "donation" : "donations"}</p><div className="exchange-table-wrap"><table className="exchange-table"><thead><tr><th>Donation</th><th>Quantity</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><small>{entry.category} · #{entry.id}</small></td><td>{quantityLabel(entry.quantity, entry.unit)}<small>{quantityLabel(entry.completed, entry.unit)} received</small></td><td>{new Date(entry.createdAt).toLocaleDateString("en-IN", {day: "numeric", month: "short", year: "numeric"})}</td><td><Status value={entry.status}/></td><td><Link className="btn btn-outline btn-small" href={`/dashboard/donor/matches?donation=${entry.id}`}>View <Icon name="arrow" size={14}/></Link>{entry.canEdit && <Link className="btn btn-outline btn-small" href={`/dashboard/donor/give?edit=${entry.id}`}>Edit</Link>}{entry.canDelete ? <DeleteItemButton label={`${entry.name} donation`} onDelete={() => deleteItemDonation(entry.id, entry.version)}/> : <small>Match history is kept.</small>}</td></tr>)}</tbody></table></div>{!visible.length && <EmptyState title={donations.length ? "No donations match" : "Make your first item donation"}>{donations.length ? "Try another search or filter." : "Your saved donations and their delivery progress will appear here."}</EmptyState>}</section></div>;
}
export function BrowseRequirements({ data }) {
  const params = useSearchParams();
  const filters = readDirectoryFilters(params.toString(), [...new Set((data.itemCatalog || []).map((item) => item.category))]);
  const [query, setQuery] = useState(filters.query), [category, setCategory] = useState(filters.category);
  useEffect(() => { setQuery(filters.query); setCategory(filters.category); }, [filters.query, filters.category]);
  const entries = (data.itemRequests || []).filter((entry) => {
    const availableItems = openRequestItems(entry);
    return availableItems.length > 0 && (category === "All" || availableItems.some((item) => item.category === category)) && matchesSearch(`${entry.title} ${entry.ngoName} ${entry.deliveryCity} ${availableItems.map((item) => item.name).join(" ")}`, query);
  });
  return <section className="exchange-panel">
    <div className="exchange-panel-head"><div><h2>What communities need</h2><p>Open item requests from approved NGOs.</p></div></div>
    <div className="exchange-filters">
      <label className="goods-search"><Icon name="search" size={18}/><input type="search" aria-label="Search requirements" placeholder="Search items, NGOs or cities" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <select aria-label="Request category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All categories</option>{[...new Set((data.itemCatalog || []).map((item) => item.category))].map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    <div className="requirements-grid">{entries.map((entry) => <div key={entry.id}>
      <p className="requirement-ngo"><Icon name="building" size={16}/>{entry.ngoName}</p>
      <ItemRequestSummary request={entry}>{openRequestItems(entry).filter((item) => category === "All" || item.category === category).map((item) => <Link key={item.itemId} href={requestDonationHref(entry.id, item.itemId)}>Donate {item.name} →</Link>)}</ItemRequestSummary>
    </div>)}</div>
    {!entries.length && <EmptyState title="No open requests match">Try another item, city or category.</EmptyState>}
  </section>;
}
