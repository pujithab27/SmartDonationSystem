"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useAppData from "../lib/useAppData";
import NgoCard from "./NgoCard";
import ItemRequestSummary from "./ItemRequestSummary";
import Icon from "./Icon";
import { EmptyState, Notice } from "./ui";
import { filterOrganizations } from "../lib/itemRequests";
import { readDirectoryFilters } from "../lib/givingExchange";
import { refreshAppData } from "../lib/api";

export default function NgoDirectory({ standalone = false }) {
  const Heading = standalone ? "h1" : "h2";
  const { data, session, error, ready } = useAppData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    const filters = readDirectoryFilters(window.location.search, [...new Set(data.itemCatalog.map((item) => item.category))]);
    setQuery(filters.query);
    if (session) { setCategory(filters.category); setNeedsOnly(filters.needsOnly); }
  }, [ready, session, data.itemCatalog]);
  const requests = data.itemRequests || [];
  const categories = [...new Set((data.itemCatalog || []).map((item) => item.category))];
  const ngos = filterOrganizations(data.ngos, requests, query, category, needsOnly);
  const reset = () => { setQuery(""); setCategory("All"); setNeedsOnly(false); };
  if (error) return <div className="ngo-finder"><Notice error>{error}</Notice><button className="btn btn-outline" type="button" onClick={() => refreshAppData(true)}>Try again</button></div>;
  return (
    <div className="ngo-finder">
      <section className="ngo-finder-intro"><span className="eyebrow">LET YOUR GENEROSITY FIND ITS PLACE</span><Heading>Find an NGO.<br /><em>Meet a real need.</em></Heading><p>{session ? "Search by organization, city, or requested item." : "Search approved organizations by name or city."}</p></section>
      <div className="ngo-finder-tools">
        <label className="goods-search"><Icon name="search" size={20} /><input type="search" aria-label="Search NGOs by name, city or donation item" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={session ? "Search by NGO, city, or requested item" : "Search by NGO name or city"} />{query && <button type="button" aria-label="Clear NGO search" onClick={() => setQuery("")}><Icon name="close" size={16} /></button>}</label>
        <label className="ngo-finder-category"><span>Item category</span><select value={category} onChange={(event) => setCategory(event.target.value)} disabled={!session}><option value="All">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>
      </div>
      <div className="ngo-finder-results"><p role="status">{ready ? `${ngos.length} ${ngos.length === 1 ? "NGO" : "NGOs"} found` : "Finding NGOs…"}</p><label className="check"><input type="checkbox" checked={needsOnly} onChange={(event) => setNeedsOnly(event.target.checked)} disabled={!session} />With open requests</label></div>
      {!session && ready && <Notice><Link href="/donor/login?next=%2Fngos">Sign in as an approved donor</Link> to view requested items and NGO delivery locations.</Notice>}
      <div className="ngo-grid ngo-finder-grid">{ngos.map((ngo) => {
        const openRequests = requests.filter((entry) => entry.ownerEmail === ngo.email && entry.status === "Open");
        return <NgoCard key={ngo.email} ngo={ngo} requests={session ? openRequests : undefined} expanded={expandedEmail === ngo.email} onToggle={() => setExpandedEmail(expandedEmail === ngo.email ? null : ngo.email)}>
          <div className="ngo-inline-requests"><h4>What {ngo.ngoName} needs</h4><div className="ngo-inline-request-grid">{openRequests.map((entry) => <ItemRequestSummary key={entry.id} request={entry} />)}</div>{!openRequests.length && <p>This NGO has no open item requests at the moment.</p>}</div>
        </NgoCard>;
      })}</div>
      {ready && !error && !ngos.length && <div className="ngo-finder-empty"><EmptyState title="No NGOs match this search">Try another name, city, item, or category.</EmptyState><button type="button" className="btn btn-outline" onClick={reset}>Clear filters</button></div>}
    </div>
  );
}
