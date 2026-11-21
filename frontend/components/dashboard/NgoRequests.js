"use client";
import { VoiceInput, VoiceTextarea } from "../VoiceField";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../Icon";
import ItemRequestSummary from "../ItemRequestSummary";
import { Notice, EmptyState } from "../ui";
import { createItemRequest, updateItemRequest, deleteItemRequest, refreshAppData } from "../../lib/api";
import AddressMapButton from "../AddressMapButton";
import DeleteItemButton from "./DeleteItemButton";
import { categoryIcons } from "../../lib/itemRequests";
import { matchesSearch } from "../../lib/search";

import NgoRequestList from "./NgoRequestList";
import NgoDeliveryUpdates from "./NgoDeliveryUpdates";

const initialFields = (ngo) => ({
  title: "", contactPhone: "", deliveryAddress: "", deliveryCity: "",
  deliveryState: "", deliveryPincode: "", notes: "", neededBy: "", priority: "Medium",
});

export default function NgoRequests({ data, session, ngo, mode = "requests" }) {
  const router = useRouter(), params = useSearchParams();
  const editId = mode === "create" ? params.get("edit") : null;
  const initializedEdit = useRef(null);
  const catalog = data.itemCatalog || [];
  const requests = (data.itemRequests || []).filter((entry) => entry.ownerEmail === session.email);
  const selectedRequest = requests.find((entry) => String(entry.id) === params.get("request"));
  const categories = ["All", ...new Set(catalog.map((item) => item.category))];
  const [category, setCategory] = useState("All");
  const [itemQuery, setItemQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [fields, setFields] = useState(() => initialFields(ngo));
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [savedId, setSavedId] = useState(null);
  const [status, setStatus] = useState("All");
  const [requestQuery, setRequestQuery] = useState("");
  const titleRef = useRef(null);
  const formRef = useRef(null);
  const verified = ngo?.status === "Verified";
  const byId = Object.fromEntries(catalog.map((item) => [item.id, item]));
  const visibleItems = catalog.filter((item) => (category === "All" || item.category === category) && matchesSearch(`${item.name} ${item.category}`, itemQuery));
  const visibleRequests = requests.filter((entry) => (status === "All" || entry.status === status) && matchesSearch(`${entry.title} ${entry.items.map((item) => item.name).join(" ")} ${entry.deliveryCity}`, requestQuery));
  const updateField = (event) => setFields((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  useEffect(() => {
    if (!editId) { if (initializedEdit.current) { initializedEdit.current = null; clearForm(); } return; }
    if (initializedEdit.current === editId) return;
    const entry = requests.find((request) => String(request.id) === editId);
    if (entry) { initializedEdit.current = editId; editRequest(entry); }
  }, [editId, data.itemRequests]);

  function toggleItem(itemId) {
    setSelected((previous) => previous.some((item) => item.itemId === itemId) ? previous.filter((item) => item.itemId !== itemId) : [...previous, {itemId, quantity: ""}]);
  }
  function clearForm() {
    setEditing(null); setSelected([]); setFields(initialFields(ngo)); setError("");
  }
  function editRequest(entry) {
    setEditing(entry); setSelected(entry.items.map((item) => ({itemId: item.itemId, quantity: String(Number(item.quantity))})));
    setFields({title: entry.title, contactPhone: entry.contactPhone || ngo?.phone || "", deliveryAddress: entry.deliveryAddress, deliveryCity: entry.deliveryCity,
      deliveryState: entry.deliveryState, deliveryPincode: entry.deliveryPincode, notes: entry.notes, neededBy: entry.neededBy || "", priority: entry.priority || "Medium"});
    setError(""); setMessage("");
    formRef.current?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start"});
    titleRef.current?.focus({preventScroll: true});
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    if (!selected.length) { setError("Choose at least one donation item before publishing."); return; }
    setBusy(true);
    try {
      const payload = {...fields, neededBy: fields.neededBy || null, items: selected};
      const result = editing ? await updateItemRequest(editing.id, {...payload, version: editing.version}) : await createItemRequest(payload);
      setSavedId(result.id); setStatus(result.status); setRequestQuery("");
      setMessage(editing ? "Your request has been updated." : "Request published. Donors can now find the items you need.");
      clearForm();
      router.push(`/dashboard/ngo/requests?request=${result.id}&saved=${result.id}`);
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  async function changeStatus(entry) {
    setWorkingId(entry.id); setListError(""); setMessage("");
    try {
      const next = entry.status === "Open" ? "Closed" : "Open";
      await updateItemRequest(entry.id, {status: next, version: entry.version});
      setStatus(next); setSavedId(entry.id);
      setMessage(next === "Closed" ? "Request closed. It will no longer appear as an open need for donors." : "Request reopened for donors.");
    } catch (issue) { setListError(issue.message); }
    finally { setWorkingId(null); }
  }
  return (
    <div className="goods-workspace">
      {!selectedRequest && <nav className="request-page-nav" aria-label="NGO requests"><Link href="/dashboard/ngo/create" aria-current={mode === "create" ? "page" : undefined}>Request items</Link><Link href="/dashboard/ngo/requests" aria-current={mode === "requests" ? "page" : undefined}>My requests</Link></nav>}
      {mode === "requests" && params.get("saved") && !message && <Notice>Request saved. Donors can find your open requests.</Notice>}
      {message && <Notice>{message}</Notice>}
      {editId && !requests.some((request) => String(request.id) === editId) && <Notice error>This request is unavailable. Open Requested items to choose one of your requests.</Notice>}
      <div className="goods-workbench goods-workbench-single">
        {mode === "create" && (!editId || requests.some((request) => String(request.id) === editId)) && <section className="goods-compose" id="request-form" ref={formRef}>
          <header className="goods-panel-heading"><div><span className="eyebrow">MAKE ROOM FOR GENEROSITY</span><h2>{editing ? "Edit your request" : "Create a request"}</h2></div><span className="goods-heading-icon"><Icon name="plus" size={22} /></span></header>
          {!verified && <Notice error>Your NGO needs administrator approval before it can publish donation requests.</Notice>}
          <form onSubmit={save}>
            <fieldset className="goods-form-fields" disabled={busy || !verified}>
              <p className="voice-privacy-note">Recordings up to 20 seconds are sent to Gemini for transcription. Review before saving.</p>
              <label className="field"><span>Request title <span className="required">*</span></span><VoiceInput ref={titleRef} name="title" value={fields.title} onChange={updateField} required maxLength={120} placeholder="e.g. Essentials for our community kitchen" /></label>
              <div className="goods-step-heading"><span>01</span><div><h3>What do you need?</h3><p>Choose items, then set their quantities below.</p></div></div>
              <div className="request-catalog-tools"><label className="goods-search"><Icon name="search" size={18} /><VoiceInput type="search" aria-label="Search donation items" placeholder="Search items, e.g. rice or soap" value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} />{itemQuery && <button type="button" aria-label="Clear item search" onClick={() => setItemQuery("")}><Icon name="close" size={15} /></button>}</label><label className="field request-category-select"><span className="sr-only">Item category</span><select aria-label="Donation item category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((name) => <option key={name} value={name}>{name === "All" ? "All categories" : name}</option>)}</select></label></div>
              <div className="goods-catalog" aria-label="Available donation items">{visibleItems.map((item) => {
                const chosen = selected.some((line) => line.itemId === item.id);
                return <button type="button" className={chosen ? "selected" : ""} key={item.id} aria-pressed={chosen} aria-label={`${chosen ? "Remove" : "Add"} ${item.name}`} onClick={() => toggleItem(item.id)}><Icon name={categoryIcons[item.category]} size={18} /><span><strong>{item.name}</strong><small>{item.unit}</small></span><Icon name={chosen ? "check" : "plus"} size={15} /></button>;
              })}{!visibleItems.length && <p className="goods-catalog-empty">No items match. Try another name or category.</p>}</div>
              <div className="goods-selection-heading"><strong>Selected items <span>{selected.length}</span></strong>{!!selected.length && <button type="button" onClick={() => setSelected([])}>Clear selection</button>}</div>
              {!selected.length ? <p className="goods-selection-empty">Select items above to enter the quantities you need.</p> : <div className="goods-selected">{selected.map((line) => {
                const item = byId[line.itemId];
                if (!item) return null;
                return <div className="goods-selected-row" key={line.itemId}><div><strong>{item.name}</strong><small>{item.category}</small></div><label><span className="sr-only">Quantity for {item.name}</span><VoiceInput type="number" aria-label={`Quantity for ${item.name}`} min="1" max="1000000" step="1" inputMode="numeric" required value={line.quantity} onChange={(event) => setSelected((previous) => previous.map((entry) => entry.itemId === line.itemId ? {...entry, quantity: event.target.value} : entry))} /><span>{item.unit}</span></label><button type="button" aria-label={`Remove ${item.name}`} onClick={() => toggleItem(item.id)}><Icon name="close" size={16} /></button></div>;
              })}</div>}
              <div className="goods-step-heading"><span>02</span><div><h3>NGO delivery location</h3><p>The place where your NGO will receive these items.</p></div></div>
              <label className="field"><span>Delivery address <span className="required">*</span></span><VoiceInput name="deliveryAddress" value={fields.deliveryAddress} onChange={updateField} maxLength={300} required placeholder="Building, street and locality" autoComplete="street-address" /></label>
              <AddressMapButton onChoose={location => setFields(old => ({...old, deliveryAddress: location.address, deliveryCity: location.city, deliveryState: location.state, deliveryPincode: location.pincode}))}/>
              <div className="goods-address-row">{[["deliveryCity", "City"], ["deliveryState", "State"], ["deliveryPincode", "PIN code"]].map(([name, label]) => <label className="field" key={name}><span>{label} <span className="required">*</span></span><VoiceInput name={name} value={fields[name]} onChange={updateField} required maxLength={name === "deliveryPincode" ? 6 : 100} pattern={name === "deliveryPincode" ? "[1-9][0-9]{5}" : undefined} inputMode={name === "deliveryPincode" ? "numeric" : undefined} /></label>)}</div>
              <label className="field"><span>NGO contact phone <span className="required">*</span></span><VoiceInput type="tel" name="contactPhone" value={fields.contactPhone} onChange={updateField} required maxLength={20} autoComplete="tel" placeholder="e.g. +91 98765 43210"/><small>Donors use this number to coordinate this request.</small></label>
              <label className="field"><span>Priority</span><select name="priority" value={fields.priority} onChange={updateField}>{["Low", "Medium", "High"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field"><span>Needed by <small>(optional)</small></span><VoiceInput type="date" name="neededBy" value={fields.neededBy} onChange={updateField} /></label>
              <label className="field"><span>Notes for donors <small>(optional)</small></span><VoiceTextarea name="notes" value={fields.notes} onChange={updateField} maxLength={2000} rows={3} placeholder="e.g. New notebooks; deliveries accepted Monday–Friday, 10 am–4 pm." /></label>
              {error && <Notice error>{error}</Notice>}
              <div className="goods-form-actions"><button type="submit" className="btn btn-primary" disabled={!catalog.length}>{busy ? "Saving…" : editing ? "Save changes" : "Publish request"}<Icon name="arrow" size={17} /></button>{editing && <Link className="btn btn-outline" href="/dashboard/ngo/requests">Cancel edit</Link>}</div>
            </fieldset>
          </form>
        </section>}
        {mode === "requests" && <section className="goods-requests" id="requested-items" aria-labelledby="your-requests-title">
          {!selectedRequest && <><header className="goods-panel-heading"><div><span className="eyebrow">YOUR REQUEST BOARD</span><h2 id="your-requests-title">Requested items <span className="goods-count">{requests.length}</span></h2></div><button type="button" className="goods-refresh" onClick={() => refreshAppData(true)} aria-label="Refresh requests"><Icon name="clock" size={18} /></button></header>
          <div className="goods-status-tabs" aria-label="Request status">{["Open", "Closed", "All"].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value}</button>)}</div>
          <label className="goods-search"><Icon name="search" size={17} /><input type="search" placeholder="Search your requests…" aria-label="Search your requests" value={requestQuery} onChange={(event) => setRequestQuery(event.target.value)} /></label>
          </>}
          {selectedRequest && <Link className="workflow-back" href="/dashboard/ngo/requests">&larr; All requests</Link>}
          {params.get("request") && !selectedRequest && <Notice error>This request is unavailable. Choose a request below.</Notice>}
          {listError && <Notice error>{listError}</Notice>}
          <div className="goods-request-list">{!selectedRequest && <NgoRequestList requests={visibleRequests} matches={data.matches}/>}
          {(selectedRequest ? [selectedRequest] : []).map((entry) => <ItemRequestSummary key={entry.id} request={entry} updates={<NgoDeliveryUpdates matches={data.matches} requestId={entry.id} closed={entry.status === "Closed"}/>} highlighted={savedId === entry.id || params.get("saved") === String(entry.id)}><Link href={`/dashboard/ngo/create?edit=${entry.id}`}>Edit request</Link><button type="button" disabled={busy || workingId !== null} onClick={() => changeStatus(entry)}>{workingId === entry.id ? "Saving…" : entry.status === "Open" ? "Close request" : "Reopen request"}</button>{entry.canDelete ? <DeleteItemButton label={entry.title} disabled={busy || workingId !== null} onDelete={() => deleteItemRequest(entry.id, entry.version)}/> : <small>Donation history is kept. Close this request to stop offers.</small>}</ItemRequestSummary>)}
            {!selectedRequest && !visibleRequests.length && <EmptyState title={requests.length ? "No matching requests" : "Your first request starts here"}>{requests.length ? "Try another search or status filter." : <Link href="/dashboard/ngo/create">Request items to get started →</Link>}</EmptyState>}</div>
        </section>}
      </div>
    </div>
  );
}
