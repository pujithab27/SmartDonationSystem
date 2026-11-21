"use client";
import { VoiceInput, VoiceTextarea } from "../VoiceField";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "../Icon";
import PhotoInput from "./PhotoInput";
import DonationSteps from "./DonationSteps";
import LocationPicker from "./LocationPicker";
import { Notice } from "../ui";
import { browserDonationSpeech } from "../../lib/donationSpeech";
import { beginDictation, speechSupported } from "../../lib/speechInput";
import { createItemDonation, updateItemDonation, analyseDonationPhoto, request } from "../../lib/api";
import { donationMatchesHref, openRequestItems, donationSpeechFields, quantityLabel } from "../../lib/itemExchange";

export default function ItemDonationForm({ data, session }) {
  const router = useRouter();
  const params = useSearchParams();
  const itemParam = params.get("item"), requestParam = params.get("request");
  const editId = params.get("edit");
  const catalog = data.itemCatalog || [];
  const profile = data.users.find((user) => user.email === session.email);
  const [fields, setFields] = useState({itemId: "", quantity: "", address: "", city: "", state: "", pincode: "", notes: "", image: ""});
  const [editing, setEditing] = useState(null), [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [analysing, setAnalysing] = useState(false), [suggestion, setSuggestion] = useState(null), [photoError, setPhotoError] = useState("");
  const photoRevision = useRef(0), autoFields = useRef(null), fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState(""), [voicePhase, setVoicePhase] = useState("");
  const [supported, setSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const recognition = useRef(null), submitting = useRef(false), clientId = useRef("");
  const item = catalog.find((entry) => entry.id === fields.itemId);
  const selectedRequest = (data.itemRequests || []).find((entry) => String(entry.id) === requestParam);
  const requestedItem = openRequestItems(selectedRequest).find((entry) => entry.itemId === fields.itemId);
  useEffect(() => {
    setSupported(speechSupported());
    return () => { recognition.current?.(); photoRevision.current++; };
  }, []);
  useEffect(() => {
    if (!editId) return;
    let active = true;
    request(`item-donations/${encodeURIComponent(editId)}/`).then((entry) => {
      if (!active) return;
      if (!entry.canEdit) { setError("This donation has match history. Manage its matches or create a new donation."); return; }
      setEditing(entry);
      setFields({ itemId: entry.itemId, quantity: String(entry.quantity), address: entry.address, city: entry.city, state: entry.state, pincode: entry.pincode, notes: entry.notes, image: entry.image });
    }).catch((issue) => { if (active) setError(issue.message); }).finally(() => { if (active) setLoadingEdit(false); });
    return () => { active = false; };
  }, [editId]);
  useEffect(() => { if (itemParam) setFields((old) => ({...old, itemId: itemParam})); }, [itemParam]);
  function update(event) { setFields((old) => ({...old, [event.target.name]: event.target.value})); }
  function applySuggestion(result) {
    const next = { itemId: result.itemId, quantity: result.quantity == null ? "" : String(result.quantity) };
    autoFields.current = next;
    setFields((old) => ({ ...old, ...next }));
  }
  async function changePhoto(image) {
    const ticket = ++photoRevision.current;
    setSuggestion(null); setPhotoError(""); setAnalysing(Boolean(image));
    const previous = autoFields.current;
    const current = { ...fieldsRef.current, image };
    if (previous && current.itemId === previous.itemId && current.quantity === previous.quantity) { current.itemId = ""; current.quantity = ""; }
    autoFields.current = null;
    setFields(current);
    if (!image) return;
    try {
      const result = await analyseDonationPhoto(image);
      if (ticket !== photoRevision.current) return;
      setSuggestion(result);
      if (result.status === "recognized" && fieldsRef.current.itemId === current.itemId && fieldsRef.current.quantity === current.quantity) applySuggestion(result);
    } catch (issue) { if (ticket === photoRevision.current) setPhotoError(issue.message); }
    finally { if (ticket === photoRevision.current) setAnalysing(false); }
  }
  function applyTranscript(text, before = fieldsRef.current, speechResult) {
    const result = speechResult?.fields ? speechResult : browserDonationSpeech(text, catalog);
    const parsed = donationSpeechFields(result, catalog);
    const current = fieldsRef.current;
    const accepted = Object.fromEntries(Object.entries(parsed).filter(([key]) => current[key] === before[key]));
    const next = {...current, ...accepted};
    setSpeechError(result.warnings.join(' '));
    setFields((old) => ({...old, ...Object.fromEntries(Object.entries(parsed).filter(([key]) => old[key] === before[key]))}));
    const missing = [["itemId", "item"], ["quantity", "quantity"], ["city", "city"], ["address", "pickup address"], ["state", "state"], ["pincode", "PIN code"]]
      .filter(([key]) => !next[key]).map(([, label]) => label);
    setVoiceStatus(missing.length ? `Still needed: ${missing.join(", ")}.` : "Review all filled details before saving.");
  }
  function voice() {
    if (listening) { recognition.current?.stop?.(); return; }
    setSpeechError(""); setTranscript(""); setListening(true);
    const before = {...fieldsRef.current};
    recognition.current = beginDictation({
      mode: 'donation',
      onPreview: setTranscript,
      onText(text, result) {
        setTranscript(text);
        applyTranscript(text, before, result);
      },
      onError: setSpeechError,
      onStatus: (text, phase) => {
        setVoiceStatus(phase === "recording" && !text.includes("no sound") ? "Listening… select Done when finished." : text);
        setVoicePhase(phase);
      },
      onEnd: () => { setListening(false); setVoicePhase(""); },
    });
  }
  async function save(event) {
    event.preventDefault();
    if (submitting.current || reading || listening || analysing || loadingEdit || (editId && !editing)) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if (!clientId.current) clientId.current = crypto.randomUUID();
      const result = editing ? await updateItemDonation(editing.id, {...fields, version: editing.version}) : await createItemDonation({...fields, clientId: clientId.current});
      router.push(editing ? "/dashboard/donor/items" : donationMatchesHref(result.id, requestParam));
    } catch (issue) { setError(issue.message); submitting.current = false; setBusy(false); }
  }
  return <div className="donation-flow">
    {!editId && <DonationSteps/>}
    <section className="exchange-panel donation-compose">
      <div className="exchange-panel-head"><span className="exchange-icon"><Icon name="heart" size={24}/></span><div><h2>{editId ? "Edit your donation" : "What would you like to give?"}</h2><p>Add your item, quantity, and pickup address.</p></div></div>
      {loadingEdit && <p role="status">Loading donation…</p>}
      {editId && !loadingEdit && !editing && <><Notice error>{error}</Notice><Link href="/dashboard/donor/items">Back to your donations</Link></>}
      {(!editId || editing) && <form onSubmit={save}><fieldset disabled={busy || loadingEdit} className="exchange-fields">
        {requestParam && <Notice>{requestedItem ? <><strong>For {selectedRequest.ngoName}</strong><p>{selectedRequest.title} · {quantityLabel(requestedItem.remaining ?? requestedItem.quantity, requestedItem.unit)} of {requestedItem.name} needed in {selectedRequest.deliveryCity}.</p><small>You’ll confirm this NGO in the next step.</small></> : <><strong>This request is unavailable for the selected item.</strong><p>You can still find another NGO that needs your donation.</p></>}</Notice>}

        <p className="voice-privacy-note"><Icon name="shield" size={14}/> Recordings up to 20 seconds are sent to Gemini for transcription. Review before saving.</p>
        <div className="donation-extras">
          <details className="donation-disclosure">
            <summary><Icon name="mic" size={18}/><span>Use voice instead</span><small>{listening ? voicePhase === "recording" ? "Listening…" : "Please wait…" : "Optional"}</small><Icon name="plus" size={16}/></summary>
            <div className={`donation-disclosure-body voice-panel${listening ? " is-active" : ""}`}>
              <div className="voice-panel-main">
                <span className="voice-panel-icon"><Icon name={voicePhase === "recording" ? "mic" : transcript ? "check" : "mic"} size={22}/></span>
                <div className="voice-panel-copy"><strong>Add by voice</strong><p>Item, quantity and pickup location.</p></div>
                <button type="button" className="voice-record-button" onClick={voice} disabled={!supported} aria-pressed={listening}>
                  {listening ? voicePhase === "recording" ? "Done" : "Cancel voice input" : "Voice input"}
                  <Icon name={listening ? "close" : "mic"} size={16}/>
                </button>
              </div>
              {!supported && <small>Use a supported browser on HTTPS or localhost, or type below.</small>}
              {voiceStatus && !speechError && <p className="voice-panel-status" role="status"><span aria-hidden="true"/>{voiceStatus}</p>}
              <div className="voice-text-editor">
                <label className="field"><span>{listening ? "Recording for transcription" : "Type or correct details"}</span><textarea aria-label="Donation transcript" rows={2} maxLength={4000} value={transcript} readOnly={listening} onChange={event => setTranscript(event.target.value)} placeholder="Item, quantity, pickup address, city, state, PIN and condition"/></label>
                <button type="button" className="btn btn-outline btn-small" disabled={listening || !transcript.trim()} onClick={() => applyTranscript(transcript)}>Fill from text</button>
              </div>
              {speechError && <Notice error>{speechError}</Notice>}
            </div>
          </details>
          <details className="donation-disclosure">
            <summary><Icon name="upload" size={18}/><span>Fill details from a photo</span><small>{fields.image || fields.notes ? "Added" : "Optional"}</small><Icon name="plus" size={16}/></summary>
            <div className="donation-disclosure-body">
              <p className="photo-analysis-help">Take or upload a photo to suggest the item, category and quantity. Photos added here are sent to Gemini for analysis. Review the suggestions before continuing.</p>
              <PhotoInput value={fields.image} onChange={changePhoto} onBusyChange={setReading} disabled={busy}/>
              {analysing && <p className="photo-analysis" role="status">Recognizing the item and quantity…</p>}
              {photoError && <div className="photo-analysis warning" role="alert"><p>{photoError}</p>{fields.image && <button type="button" className="btn btn-outline btn-small" onClick={() => changePhoto(fields.image)}>Try analysis again</button>}</div>}
              {suggestion && <div className={`photo-analysis${suggestion.status !== "recognized" || suggestion.quantity == null ? " warning" : ""}`} role="status">{suggestion.status === "recognized" && <strong>{suggestion.name} · {suggestion.category}{suggestion.quantity != null ? ` · ${quantityLabel(suggestion.quantity, suggestion.unit)}` : ""}</strong>}<p>{suggestion.warning}</p>{suggestion.status === "recognized" && (fields.itemId !== suggestion.itemId || (suggestion.quantity != null && Number(fields.quantity) !== suggestion.quantity)) && <button type="button" className="btn btn-outline btn-small" onClick={() => applySuggestion(suggestion)}>Use these details</button>}</div>}
              <label className="field"><span>Additional details <small>(optional)</small></span><VoiceTextarea name="notes" rows={3} maxLength={2000} value={fields.notes} onChange={update} placeholder="Condition, expiry date, packaging or other useful details"/></label>
            </div>
          </details>
        </div>

        <div className="donation-item-field">
          <label className="field"><span>Donation item</span><select required name="itemId" value={fields.itemId} onChange={update} aria-describedby="donation-item-help"><option value="">Choose what you’re donating</option>{[...new Set(catalog.map((entry) => entry.category))].map((category) => <optgroup key={category} label={category}>{catalog.filter((entry) => entry.category === category).map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</optgroup>)}</select></label>
          <div className="donation-quick-picks" aria-label="Common donation items"><small>Quick picks</small>{["rice", "notebook", "shirt", "blanket"].map((id) => catalog.find((entry) => entry.id === id)).filter(Boolean).map((entry) => <button type="button" key={entry.id} aria-pressed={fields.itemId === entry.id} onClick={() => setFields((old) => ({...old, itemId: entry.id}))}>{entry.name}</button>)}</div>
          <small id="donation-item-help">{item ? `${item.category} · Category and unit are set for you.` : "All donation items are available in the list above."}</small>
        </div>

        <div className="donation-essentials">
          <label className="field"><span>Quantity{item ? ` (${item.unit})` : ""}</span><VoiceInput type="text" name="quantity" required min="1" max="1000000" maxLength={7} pattern="(?:[1-9][0-9]{0,5}|1000000)" inputMode="numeric" value={fields.quantity} onChange={update} placeholder="e.g. 3 or 4"/></label>
          <label className="field"><span>Donation city</span><VoiceInput name="city" required maxLength={100} value={fields.city} onChange={update} autoComplete="address-level2" placeholder="e.g. Bengaluru" aria-describedby="donation-city-help"/></label>
        </div>
        <label className="field"><span>Full pickup address</span><VoiceInput name="address" required maxLength={300} value={fields.address} onChange={update} autoComplete="street-address" placeholder="House/building, street, area and landmark"/></label>
        <button type="button" className="pickup-map-trigger" onClick={()=>setLocationOpen(true)}><Icon name="pin" size={17}/>Choose location on map</button>
        {profile?.address && <button type="button" className="text-link" onClick={() => setFields((old) => ({...old, address: profile.address || "", city: profile.city || "", state: profile.state || "", pincode: profile.pincode || ""}))}>Use my saved address</button>}
        <div className="donation-essentials"><label className="field"><span>State</span><VoiceInput name="state" required maxLength={100} value={fields.state} onChange={update} autoComplete="address-level1"/></label><label className="field"><span>PIN code</span><VoiceInput name="pincode" required pattern="[1-9][0-9]{5}" inputMode="numeric" maxLength={6} value={fields.pincode} onChange={update} autoComplete="postal-code" placeholder="6-digit PIN code"/></label></div>
        <p className="donation-location-help" id="donation-city-help"><Icon name="pin" size={15}/>We’ll use this address for pickup. You can review it when choosing a time.</p>



        {item && Number(fields.quantity) > 0 && <p className="donation-summary" role="status"><Icon name="box" size={18}/><span><strong>{quantityLabel(fields.quantity, item.unit)} of {item.name}</strong>{fields.city.trim() && <> · {fields.city.trim()}</>}</span></p>}
        {error && <Notice error>{error}</Notice>}
        <div className="exchange-form-footer"><p>{reading ? "Preparing your photo…" : analysing ? "Checking your photo…" : listening ? "Finish voice input to continue." : editing ? "Review your changes before saving." : "Next: choose an NGO, then arrange pickup."}</p><button className="btn btn-primary" disabled={reading || listening || analysing || !catalog.length}>{busy ? "Saving donation…" : editing ? "Save changes" : "Find NGOs"}<Icon name="arrow" size={17}/></button>{editing && <Link href="/dashboard/donor/items">Cancel edit</Link>}</div>
        {!editing && <small className="donation-save-note">Your offer is saved when you continue. You choose the NGO before any items are reserved.</small>}
      </fieldset></form>}
    </section>
    {locationOpen && <LocationPicker onClose={()=>setLocationOpen(false)} onConfirm={location=>{setFields(old=>({...old,...location}));setLocationOpen(false);}}/>}
  </div>;
}
