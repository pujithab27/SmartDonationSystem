"use client";
import AddressMapButton from "../AddressMapButton";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../Icon";
import PhotoInput from "./PhotoInput";
import DonationSteps from "./DonationSteps";
import { EmptyState, Metric, Notice, Status } from "../ui";
import { createMatch, request, updateMatch, refreshAppData, analyseReceivedItem } from "../../lib/api";
import { quantityLabel, localDateTime, prioritizeRequestCandidates } from "../../lib/itemExchange";
import { ngoDeliveryStep } from "./NgoDeliveryUpdates";
import { matchesSearch } from "../../lib/search";

const photoExtension = (image) => image.startsWith("data:image/png;") ? "png" : image.startsWith("data:image/webp;") ? "webp" : "jpg";

function Candidate({ candidate, donation, onMatch, busy, preferred }) {
  const quantity = candidate.suggestedQuantity;
  return <article className={`match-candidate${preferred ? " preferred" : ""}`}>
    <span className="exchange-icon"><Icon name="building" size={22}/></span>
    <div>{preferred && <span className="badge badge-neutral">Your selected request</span>}<strong>{candidate.ngoName}</strong><p>{candidate.title}</p><small><Icon name="pin" size={13}/>{candidate.city} ? {candidate.priority} priority{candidate.neededBy ? ` ? Needed by ${candidate.neededBy}` : ""}</small><span className="match-reason">{candidate.reason}</span></div>
    <form onSubmit={event => { event.preventDefault(); onMatch(candidate, quantity); }}>
      <div><strong>{quantityLabel(quantity, donation.unit)} to donate</strong><small>You have {quantityLabel(donation.available, donation.unit)} available. This NGO still needs {quantityLabel(candidate.available, donation.unit)}.</small></div>
      <button className="btn btn-primary btn-small" disabled={busy || !(quantity > 0)}>Confirm match <Icon name="arrow" size={15}/></button>
    </form>
  </article>;
}
function PickupForm({ match, onSaved }) {
  const [editing, setEditing] = useState(!match.pickupAt);
  const [values, setValues] = useState({pickupAt: localDateTime(match.pickupAt), pickupAddress: match.pickupAddress || "", pickupCity: match.pickupCity || "", pickupState: match.pickupState || "", pickupPincode: match.pickupPincode || "", pickupNotes: match.pickupNotes || ""});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await updateMatch(match.id, {...values, pickupAt: new Date(values.pickupAt).toISOString(), action: "schedule", version: match.version}); setEditing(false); onSaved("Pickup schedule saved. The NGO has been notified."); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  if (!editing) return <div className="pickup-confirmation" role="status"><p><strong>Pickup scheduled</strong> ? Awaiting NGO collection.</p><p>The NGO has been notified. You do not need to submit the schedule again.</p><button type="button" className="btn btn-outline btn-small" onClick={() => { setValues({pickupAt: localDateTime(match.pickupAt), pickupAddress: match.pickupAddress || "", pickupCity: match.pickupCity || "", pickupState: match.pickupState || "", pickupPincode: match.pickupPincode || "", pickupNotes: match.pickupNotes || ""}); setError(""); setEditing(true); }}>Edit pickup</button></div>;
  return <form onSubmit={save} className="pickup-form"><fieldset disabled={busy} className="exchange-fields"><div><h3>{match.pickupAt ? "Update pickup schedule" : "Schedule pickup"}</h3><p>The address where the NGO will collect your donation.</p></div><label className="field"><span>Pickup date and time <small>(your local time)</small></span><input type="datetime-local" required value={values.pickupAt} min={localDateTime(new Date().toISOString())} onChange={(event) => setValues({...values, pickupAt: event.target.value})}/></label><label className="field"><span>Donor pickup address</span><input required maxLength={300} value={values.pickupAddress} onChange={(event) => setValues({...values, pickupAddress: event.target.value})}/></label><AddressMapButton onChoose={location => setValues(old => ({...old, pickupAddress: location.address, pickupCity: location.city, pickupState: location.state, pickupPincode: location.pincode}))}/><div className="exchange-form-grid">{[["pickupCity", "City"], ["pickupState", "State"], ["pickupPincode", "PIN code"]].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input required maxLength={key === "pickupPincode" ? 6 : 100} pattern={key === "pickupPincode" ? "[1-9][0-9]{5}" : undefined} value={values[key]} onChange={(event) => setValues({...values, [key]: event.target.value})}/></label>)}</div><label className="field"><span>Pickup notes <small>(optional)</small></span><textarea maxLength={1000} rows={2} value={values.pickupNotes} onChange={(event) => setValues({...values, pickupNotes: event.target.value})}/></label>{error && <Notice error>{error}</Notice>}<button className="btn btn-primary">{busy ? "Saving…" : "Save pickup schedule"}</button>{match.pickupAt && <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Cancel changes</button>}</fieldset></form>;
}
export function ReceiptCheckResult({ result }) {
  if (!result?.status) return null;
  return <div className={`receipt-check-result ${result.status}`} role={result.status === "mismatch" ? "alert" : "status"}><strong>{result.status === "match" ? "Matching" : result.status === "mismatch" ? "Not matching" : "Upload a clearer photo"}</strong></div>;
}
export function MatchPhotos({ match, readOnly = false }) {
  const checkRevision = useRef(0);
  const [checking, setChecking] = useState(false), [checkError, setCheckError] = useState("");
  const [photos, setPhotos] = useState(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; checkRevision.current++; setChecking(false); setCheckError(""); setPhotos(null); setError(""); request(`matches/${match.id}/`).then((data) => { if (active) setPhotos(data); }).catch((issue) => { if (active) setError(issue.message); }); return () => { active = false; checkRevision.current++; }; }, [match.id, match.version, retry]);
  async function checkSavedPhotos() {
    const ticket = ++checkRevision.current;
    setChecking(true); setCheckError("");
    try { const result = await analyseReceivedItem(match.id, photos.deliveryProof); if (ticket === checkRevision.current) setPhotos(old => ({...old, receiptCheck: result})); }
    catch (issue) { if (ticket === checkRevision.current) setCheckError(issue.message); }
    finally { if (ticket === checkRevision.current) setChecking(false); }
  }
  if (error) return <Notice error>{error}<button type="button" className="text-link" onClick={() => setRetry((value) => value + 1)}>Try again</button></Notice>;
  if (!photos) return <p role="status">Loading donation photos…</p>;
  return <><ReceiptCheckResult result={photos.receiptCheck}/>{!readOnly && match.status === "Completed" && photos.deliveryProof && <div className="receipt-check"><button type="button" className="btn btn-outline btn-small" disabled={checking} onClick={checkSavedPhotos}>{checking ? "Checking saved photos?" : "Check saved photos"}</button><p>Photos are sent to Gemini to compare item types. This check does not change recorded delivery totals.</p>{checkError && <Notice error>{checkError}</Notice>}</div>}<div className="match-photos"><figure><figcaption><strong>Original donation</strong><small>Photo shared by the donor</small></figcaption>{photos.donationImage ? <a href={photos.donationImage} download={`donation-${match.donationId}.${photoExtension(photos.donationImage)}`}><img src={photos.donationImage} alt={`Original donation of ${match.name}`}/><span>Download photo</span></a> : <p className="photo-placeholder">No original photo was uploaded.</p>}</figure><figure><figcaption><strong>Received items</strong><small>{match.completedAt ? `Confirmed ${new Date(match.completedAt).toLocaleString("en-IN")}` : "Delivery photo appears after receipt is confirmed"}</small></figcaption>{photos.deliveryProof ? <a href={photos.deliveryProof} download={`delivery-${match.id}.${photoExtension(photos.deliveryProof)}`}><img src={photos.deliveryProof} alt={`Proof of received ${match.name} at ${match.ngoName}`}/><span>Download proof</span></a> : <p className="photo-placeholder">{match.status === "Completed" ? "No proof was attached to this earlier delivery." : "Awaiting a photo from the receiving NGO."}</p>}{photos.deliveryNote && <p>{photos.deliveryNote}</p>}</figure></div></>;
}
export function MatchTracking({ events = [] }) {
  if (!events.length) return null;
  return <section className="match-tracking" aria-label="Donation tracking history"><h3>Tracking history</h3><ol>{events.map((event) => <li key={event.id}><span className="tracking-dot"/><div><strong>{event.title}</strong><p>{event.message}</p><small>{event.actorRole === "ngo" ? "NGO" : event.actorRole === "donor" ? "Donor" : "System"} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("en-IN")}</time></small></div></li>)}</ol></section>;
}
export default function Matches({ data, session }) {
  const params = useSearchParams();
  const router = useRouter();
  const donationParam = params.get("donation"), matchParam = params.get("match"), requestParam = params.get("request");
  const donor = session.role === "donor";
  const donations = data.itemDonations || [], matches = data.matches || [];
  const [donationId, setDonationId] = useState("");
  const [candidates, setCandidates] = useState([]), [loading, setLoading] = useState(false), [candidateError, setCandidateError] = useState("");
  const [candidateFor, setCandidateFor] = useState(""), [reload, setReload] = useState(0), [query, setQuery] = useState(""), [status, setStatus] = useState("All"), [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState(null), [confirmError, setConfirmError] = useState("");
  const [proof, setProof] = useState(""), [proofNote, setProofNote] = useState(""), [proofReading, setProofReading] = useState(false);
  const [receiptCheck, setReceiptCheck] = useState(null), [checkingReceipt, setCheckingReceipt] = useState(false), [receiptReviewed, setReceiptReviewed] = useState(false);
  const dialog = useRef(null), detail = useRef(null), actionLock = useRef(false);
  const donation = donations.find((entry) => String(entry.id) === String(donationId));
  const preferredRequestId = donationId === donationParam ? requestParam : null;
  const preferredMatch = matches.find((entry) => String(entry.donationId) === donationId && String(entry.requestId) === preferredRequestId && entry.status !== "Cancelled");
  const orderedCandidates = prioritizeRequestCandidates(candidates, preferredRequestId);
  const selected = matches.find((entry) => entry.id === selectedId);
  const matchRevision = matches.map((match) => `${match.id}:${match.version}`).join(",");
  const available = donation?.available;
  useEffect(() => { setDonationId(/^\d+$/.test(donationParam || "") ? donationParam : ""); setSelectedId(Number(matchParam) || matches.find((entry) => String(entry.donationId) === donationParam)?.id || null); }, [donationParam, matchParam]);
  useEffect(() => {
    setCandidateFor("");
    if (!donor || !donationId || !(Number(available) > 0)) { setCandidates([]); setLoading(false); setCandidateError(""); return; }
    let active = true; setLoading(true); setCandidateError(""); setCandidates([]);
    request(`item-donations/${donationId}/candidates/`).then((result) => { if (active) { setCandidates(result); setCandidateFor(donationId); } }).catch((issue) => { if (active) setCandidateError(issue.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [donor, donationId, available, reload, matchRevision]);
  useEffect(() => { if (confirmation && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [confirmation]);
  useEffect(() => { if (selectedId) detail.current?.scrollIntoView({behavior: "instant", block: "start"}); }, [selectedId]);
  async function match(candidate, quantity) {
    if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try { const result = await createMatch({donationId: Number(donationId), requestId: candidate.requestId, quantity}); setSelectedId(result.id); setNotice("Match reserved. Choose a pickup date and address below."); setReload((value) => value + 1); }
    catch (issue) { setError(issue.message); setReload((value) => value + 1); }
    finally { actionLock.current = false; setBusy(false); }
  }
  function openConfirmation(action) { setConfirmError(""); setProof(""); setProofNote(""); setProofReading(false); setReceiptCheck(null); setCheckingReceipt(false); setReceiptReviewed(false); setConfirmation({action, match: selected}); }
  async function checkReceipt(image = proof) {
    if (!confirmation || !image || checkingReceipt) return;
    setCheckingReceipt(true); setReceiptCheck(null); setReceiptReviewed(false); setConfirmError("");
    try { setReceiptCheck(await analyseReceivedItem(confirmation.match.id, image)); }
    catch (issue) { setConfirmError(issue.message); }
    finally { setCheckingReceipt(false); }
  }
  async function confirm() {
    if (actionLock.current || !confirmation || proofReading) return;
    if (confirmation.action === "confirm" && !proof) { setConfirmError("Upload a photo of the received items before confirming delivery."); return; }
    if (confirmation.action === "confirm" && receiptCheck?.status !== "match") { setConfirmError("Check the received photo first. A different or unclear item cannot be confirmed."); return; }
    if (confirmation.action === "confirm" && !receiptReviewed) { setConfirmError("Review the received items against the donation and confirm they match before completing delivery."); return; } actionLock.current = true; setBusy(true); setConfirmError("");
    try { await updateMatch(confirmation.match.id, {action: confirmation.action, version: confirmation.match.version, ...(confirmation.action === "confirm" ? {deliveryProof: proof, deliveryNote: proofNote, itemMatchConfirmed: receiptReviewed} : {})}); setNotice(confirmation.action === "confirm" ? "Receipt confirmed. Requested quantities and donation history have been updated." : "Match cancelled. The quantity is available to match again."); dialog.current?.close(); setConfirmation(null); }
    catch (issue) { setConfirmError(issue.message); await refreshAppData(true); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const visible = matches.filter((entry) => (status === "All" || entry.status === status) && matchesSearch(`${entry.ngoName} ${entry.donorName} ${entry.name} ${entry.deliveryCity}`, query));
  const activity = <div className="exchange-metrics"><Metric label="Total matches" value={matches.length} icon="link"/><Metric label="Completed" value={matches.filter((entry) => entry.status === "Completed").length} icon="check"/><Metric label="Awaiting pickup / receipt" value={matches.filter((entry) => ["Pending", "Pickup scheduled"].includes(entry.status)).length} icon="clock"/></div>;
  return <div className="exchange-workspace">{donor ? <DonationSteps current={selected && ["Pending", "Pickup scheduled"].includes(selected.status) ? 3 : 2}/> : !selected && activity}
    {donor && donation && !selected && <Notice><strong>Thank you for offering {donation.name}.</strong><p>Your offer is saved. Choose an NGO and arrange pickup to turn your kindness into a confirmed delivery.</p></Notice>}
    {donor && selected?.status === "Completed" && <Notice><strong>Your kindness arrived. Thank you!</strong><p>{selected.ngoName} confirmed receipt of your donation.</p><Link className="text-link" href="/dashboard/donor/impact">See your impact and milestones</Link></Notice>}
    {notice && <Notice>{notice}</Notice>}{error && <Notice error>{error}</Notice>}
    {donor && !selected && <section className="exchange-panel"><div className="exchange-panel-head"><div><h2>Choose an NGO</h2><p>These NGOs need your item. Choose one to arrange pickup.</p></div><Link className="btn btn-outline btn-small" href="/dashboard/donor/give"><Icon name="plus" size={16}/>Add donation</Link></div><label className="field"><span>Your donation</span><select value={donationId} disabled={busy} onChange={(event) => { setDonationId(event.target.value); setSelectedId(null); setCandidateFor(""); setCandidates([]); setCandidateError(""); }}><option value="">Choose one of your donations</option>{donations.filter((entry) => Number(entry.available) > 0 || String(entry.id) === donationId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {quantityLabel(entry.available, entry.unit)} available · #{entry.id}</option>)}</select></label>{donation && <div className="run-matches-row"><p>Requests in your city appear first. The match uses the smaller of your available quantity and the NGO?s remaining need.</p><button type="button" className="btn btn-outline btn-small" disabled={Number(donation.available) <= 0 || loading || busy} onClick={() => setReload((value) => value + 1)}>{loading ? "Finding NGOs…" : "Refresh suggestions"}</button></div>}
      {loading && <p role="status">Finding matching requests…</p>}{candidateError && <Notice error>{candidateError}<button className="text-link" onClick={() => setReload((value) => value + 1)}>Try again</button></Notice>}
      {!loading && !candidateError && candidateFor === donationId && donation && preferredRequestId && !preferredMatch && !candidates.some((candidate) => String(candidate.requestId) === preferredRequestId) && <Notice>Your selected request is no longer available for this donation. Your offer is saved; you can choose another eligible NGO below.</Notice>}
      {!loading && candidateFor === donationId && donation && orderedCandidates.map((candidate) => <Candidate key={`${donation.id}-${candidate.requestId}-${candidate.suggestedQuantity}`} candidate={candidate} donation={donation} onMatch={match} busy={busy} preferred={String(candidate.requestId) === preferredRequestId}/>)}
      {!loading && !candidateError && donation && (candidateFor === donationId || Number(donation.available) <= 0) && !candidates.length && <EmptyState title={Number(donation.available) > 0 ? "No NGOs need this item right now" : "Your items have been reserved"}>{Number(donation.available) > 0 ? "Your donation is saved. Check again as NGOs publish new requests." : "Arrange pickup or follow delivery in your match details below."}</EmptyState>}
      {!donations.length && <EmptyState title="Your first connection starts with an item">Add a donation to discover NGO requests that match.</EmptyState>}
    </section>}
    {donor && !selected && <details className="donation-disclosure donation-activity"><summary><Icon name="chart" size={18}/><span>Donation activity</span><Icon name="plus" size={16}/></summary><div className="donation-disclosure-body">{activity}</div></details>}
    {!selected && <section className="exchange-panel"><div className="exchange-panel-head"><div><h2>{donor ? "Your deliveries" : "Incoming donations"}</h2><p>Follow each donation from connection to confirmed receipt.</p></div><button type="button" className="btn btn-outline btn-small" onClick={() => refreshAppData(true)}>Refresh</button></div><div className="exchange-filters"><label className="goods-search"><Icon name="search" size={18}/><input type="search" aria-label="Search matches" placeholder="Search by NGO, donor, item or city" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="Match status" value={status} onChange={(event) => setStatus(event.target.value)}>{["All", "Pending", "Pickup scheduled", "Completed", "Cancelled"].map((value) => <option key={value} value={value}>{!donor && value === "Pending" ? "Donor accepted" : value}</option>)}</select></div>
      <div className="match-list">{visible.map((entry) => <article className={`match-row ${selectedId === entry.id ? "selected" : ""}`} key={entry.id}><span className="exchange-icon"><Icon name={donor ? "building" : "user"} size={20}/></span><div><strong>{donor ? entry.ngoName : entry.donorName}</strong><small>{entry.deliveryCity}</small></div><div><strong>{entry.name}</strong><small>{quantityLabel(entry.quantity, entry.unit)}</small></div><Status value={!donor && entry.status === "Pending" ? "Donor accepted" : entry.status}/><button type="button" className="btn btn-outline btn-small" aria-expanded={selectedId === entry.id} onClick={() => {setSelectedId(entry.id); router.push(`/dashboard/${session.role}/matches?match=${entry.id}`);}}>{selectedId === entry.id ? "Close details" : "View details"}<Icon name="arrow" size={14}/></button></article>)}</div>
      {!visible.length && <EmptyState title="No matching donations">{matches.length ? "Try another search or status filter." : donor ? "Choose an NGO from your suggested matches to get started." : "Donors can connect their item donations to your published requests."}</EmptyState>}
    </section>}
    {selected && <nav className="workflow-detail-nav" aria-label="Delivery navigation"><button className="workflow-back" onClick={() => {setSelectedId(null); router.replace(`/dashboard/${session.role}/matches`);}}>&larr; All deliveries</button>{!donor && <Link href={`/dashboard/ngo/requests?request=${selected.requestId}`}>View original request &rarr;</Link>}</nav>}
    {selected && <section ref={detail} className="exchange-panel match-detail" aria-label="Match details"><div className="exchange-panel-head"><div><span className="eyebrow">MATCH #{selected.id}</span><h2>{selected.name} · {quantityLabel(selected.quantity, selected.unit)}</h2></div><Status value={!donor && selected.status === "Pending" ? "Donor accepted" : selected.status}/></div><div className="match-timeline" aria-label="Donation progress">{["Matched", "Pickup scheduled", "Completed"].map((label, index) => <div className={selected.status !== "Cancelled" && (index === 0 || index === 1 && selected.pickupAt || index === 2 && selected.status === "Completed") ? "done" : ""} key={label}><span>{index + 1}</span>{label}</div>)}</div><div className="match-detail-grid"><div><h3>{selected.ngoName}</h3><small>NGO delivery location</small><p>{[selected.deliveryAddress, selected.deliveryCity, selected.deliveryState, selected.deliveryPincode].filter(Boolean).join(", ")}</p><p>NGO contact: {selected.contactPhone ? <a href={`tel:${selected.contactPhone}`}>{selected.contactPhone}</a> : "Not added to this request"}</p><p>Donor: {selected.donorName}{selected.donorPhone && <> · <a href={`tel:${selected.donorPhone}`}>{selected.donorPhone}</a></>}</p>{selected.notes && <p>{selected.notes}</p>}</div><div><h3>Pickup details</h3>{selected.pickupAt ? <><p>{new Date(selected.pickupAt).toLocaleString("en-IN", {dateStyle: "medium", timeStyle: "short"})}</p><p>{[selected.pickupAddress, selected.pickupCity, selected.pickupState, selected.pickupPincode].filter(Boolean).join(", ")}</p>{selected.pickupNotes && <p>{selected.pickupNotes}</p>}</> : <p>The donor will add a pickup date and address.</p>}</div></div>
      {!donor && <p className="delivery-next-action"><strong>{ngoDeliveryStep(selected).title}</strong><span>{ngoDeliveryStep(selected).detail}</span></p>}
      {donor && ["Pending", "Pickup scheduled"].includes(selected.status) && <PickupForm key={`${selected.id}-${selected.version}`} match={selected} onSaved={setNotice}/>}
      <details className="donation-disclosure match-evidence" open={selected.status === "Completed"}><summary><Icon name="box" size={18}/><span>Photos and delivery history</span><Icon name="plus" size={16}/></summary><div className="donation-disclosure-body"><MatchPhotos match={selected}/><MatchTracking events={selected.events}/></div></details>
      {["Pending", "Pickup scheduled"].includes(selected.status) && <div className="exchange-actions">{!donor && selected.status === "Pickup scheduled" && <button className="btn btn-primary" disabled={busy} onClick={() => openConfirmation("confirm")}>Confirm physical receipt <Icon name="check" size={17}/></button>}<button className="btn btn-outline" disabled={busy} onClick={() => openConfirmation("cancel")}>Cancel match</button></div>}
      {selected.completedAt && <Notice>Receipt confirmed on {new Date(selected.completedAt).toLocaleString("en-IN")}.</Notice>}
    </section>}
    <dialog className="exchange-dialog" ref={dialog} onCancel={(event) => { if (busy || proofReading || checkingReceipt) event.preventDefault(); else setConfirmation(null); }} onClose={() => { if (!busy) setConfirmation(null); }}><span className="exchange-icon"><Icon name={confirmation?.action === "confirm" ? "check" : "close"} size={25}/></span><h2>{confirmation?.action === "confirm" ? "Confirm physical receipt?" : "Cancel this match?"}</h2><p>{confirmation?.action === "confirm" ? `Confirm that your NGO has received ${quantityLabel(confirmation.match.quantity, confirmation.match.unit)} of ${confirmation.match.name}. This updates the request’s received quantity and completes the match.` : "The reserved items will become available for another match. This pickup will be cancelled."}</p>{confirmation?.action === "confirm" && <div className="delivery-proof-form"><PhotoInput key={`${confirmation.match.id}-proof`} value={proof} onChange={(image) => { setProof(image); setReceiptCheck(null); setReceiptReviewed(false); setConfirmError(""); if (image) checkReceipt(image); }} onBusyChange={setProofReading} disabled={busy || checkingReceipt} label="Received item photo" required/><div className="receipt-check">{checkingReceipt && <p role="status">Checking photo...</p>}{confirmError && proof && <button type="button" className="btn btn-outline btn-small" disabled={checkingReceipt || proofReading || busy} onClick={() => checkReceipt()}>Retry photo check</button>}<ReceiptCheckResult result={receiptCheck}/>{receiptCheck?.status === "mismatch" && <p>The donor has been notified.</p>}<label className="receipt-review"><input type="checkbox" checked={receiptReviewed} disabled={!proof || busy || checkingReceipt || receiptCheck?.status !== "match"} onChange={(event) => setReceiptReviewed(event.target.checked)}/><span>I reviewed the received photo and confirm it shows the donated {confirmation.match.name}.</span></label></div><label className="field"><span>Receipt note <small>(optional)</small></span><textarea rows={2} maxLength={1000} value={proofNote} disabled={busy} onChange={(event) => setProofNote(event.target.value)} placeholder="Condition of the received items or other delivery details"/></label></div>}{confirmError && <Notice error>{confirmError}</Notice>}<div className="exchange-actions"><button type="button" className="btn btn-outline" disabled={busy || proofReading || checkingReceipt} onClick={() => { dialog.current?.close(); setConfirmation(null); }}>Go back</button><button type="button" className="btn btn-primary" disabled={busy || proofReading || checkingReceipt || (confirmation?.action === "confirm" && (!proof || !receiptReviewed || receiptCheck?.status !== "match"))} onClick={confirm}>{busy ? "Saving…" : confirmation?.action === "confirm" ? "Confirm receipt" : "Cancel match"}</button></div></dialog>
  </div>;
}
