"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "../Icon";
import { matchesSearch } from "../../lib/search";

const pageHelp = {
  impact: "Your confirmed deliveries, appreciation and kindness milestones",
  overview: "Your activity and next steps",
  give: "Offer an item using details, a photo or your voice",
  create: "Publish or edit the items your NGO needs",
  requirements: "Find NGO needs by item, category or location",
  items: "Track, edit or delete your donations",
  requests: "Manage requests and see quantities received",
  matches: "Connect donations, schedule pickup and confirm delivery",
  notifications: "Read your messages and delivery updates",
  profile: "Update your contact details and address",
};

export default function WorkspaceSearch({ role, pages }) {
  const dialog = useRef(null), input = useRef(null), trigger = useRef(null);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const results = pages.filter(([key, label]) => matchesSearch(`${label} ${pageHelp[key] || ""}`, query));
  const href = (key) => `/dashboard/${role}${key === "overview" ? "" : `/${key}`}`;
  function open() {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  }
  function close() { dialog.current?.close(); }
  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return <>
    <button ref={trigger} type="button" className="workspace-search-trigger" aria-haspopup="dialog" onClick={open}>
      <Icon name="search" size={17}/><span>Find a page or action</span><kbd>Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="workspace-finder" aria-labelledby="workspace-finder-title" onClick={(event) => { if (event.target === dialog.current) close(); }} onClose={() => { setQuery(""); trigger.current?.focus(); }}>
      <div className="workspace-finder-body">
        <header><div><h2 id="workspace-finder-title">Where would you like to go?</h2><p>Search for a page or something you want to do.</p></div><button type="button" className="workspace-icon-button" aria-label="Close page search" onClick={close}><Icon name="close" size={20}/></button></header>
        <form onSubmit={(event) => { event.preventDefault(); if (results[0]) { close(); router.push(href(results[0][0])); } }}>
          <label className="workspace-search-field"><Icon name="search" size={20}/><input ref={input} type="search" aria-label="Search workspace pages" placeholder="Try pickup, edit, address or notifications" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"/></label>
        </form>
        <nav className="workspace-search-results" aria-label="Page search results">
          {results.map(([key, label, icon]) => <Link key={key} href={href(key)} onClick={close}><Icon name={icon} size={20}/><span><strong>{label}</strong><small>{pageHelp[key]}</small></span><Icon name="arrow" size={16}/></Link>)}
          {!results.length && <p role="status">No matching pages. Try an item action, pickup, profile or notifications.</p>}
        </nav>
        <footer>Use Tab to choose a page. Press Escape to close.</footer>
      </div>
    </dialog>
  </>;
}
