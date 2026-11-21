"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { Notice } from "../ui";
import { prepareDonationImage } from "../../lib/photoUpload";

export default function PhotoInput({ value, onChange, onBusyChange, disabled = false, label = "Item photo", required = false }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [camera, setCamera] = useState(false), [ready, setReady] = useState(false), [facing, setFacing] = useState("user");
  const revision = useRef(0), cameraRevision = useRef(0), stream = useRef(null), video = useRef(null), mounted = useRef(true);
  function stopCamera() {
    cameraRevision.current++;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function closeCamera() { stopCamera(); setCamera(false); setReady(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; stopCamera(); }; }, []);
  useEffect(() => { if (disabled) closeCamera(); }, [disabled]);
  async function prepare(file) {
    const ticket = ++revision.current; setBusy(true); onBusyChange?.(true); setError(""); onChange("");
    try { const photo = await prepareDonationImage(file); if (ticket === revision.current) onChange(photo); }
    catch (issue) { if (ticket === revision.current) setError(issue.message); }
    finally { if (ticket === revision.current) { setBusy(false); onBusyChange?.(false); } }
  }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file) { closeCamera(); await prepare(file); }
  }
  async function openCamera(nextFacing = "user") {
    stopCamera(); setError(""); setReady(false); setFacing(nextFacing);
    if (!navigator.mediaDevices?.getUserMedia) { setError("Live camera is unavailable here. Choose a photo or use your device camera below."); return; }
    setCamera(true);
    const ticket = cameraRevision.current;
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 960 } } });
      if (ticket !== cameraRevision.current) { next.getTracks().forEach((track) => track.stop()); return; }
      stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
    } catch (issue) {
      if (ticket !== cameraRevision.current) return;
      closeCamera();
      setError(issue.name === "NotAllowedError" ? "Camera access was blocked. Allow camera access in your browser or upload a photo." : issue.name === "NotFoundError" ? "No camera was found. Upload a photo instead." : "The camera could not start. Close other apps using it and try again, or upload a photo.");
    }
  }
  async function capture() {
    if (!ready || !video.current?.videoWidth || busy) return;
    const ticket = cameraRevision.current;
    setBusy(true); onBusyChange?.(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not take a picture. Use the device camera option below.");
      context.drawImage(video.current, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
      if (ticket !== cameraRevision.current) return;
      if (!blob) throw new Error("The photo could not be captured. Try again.");
      closeCamera();
      await prepare(new File([blob], "donation-camera.jpg", { type: "image/jpeg" }));
    } catch (issue) { if (ticket === cameraRevision.current) setError(issue.message); }
    finally { if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  }
  return <div className="photo-input">
    <p className="exchange-label">{label} {required ? <span className="required">*</span> : <small>(optional)</small>}</p>
    <div className="upload-options">
      <label className="upload-zone"><Icon name="upload" size={23}/><strong>Choose a photo</strong><small>JPG, PNG or WebP / up to 12 MB</small><input type="file" aria-label={`Upload ${label.toLowerCase()}`} accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy || disabled}/></label>
      <button type="button" className="upload-zone camera-open" onClick={() => openCamera("user")} disabled={busy || disabled || camera}><Icon name="camera" size={23}/><strong>Open front camera</strong><small>Preview, then take a picture</small></button>
    </div>
    {camera && <div className="camera-panel"><video ref={(node) => { video.current = node; if (node && stream.current && node.srcObject !== stream.current) node.srcObject = stream.current; }} autoPlay playsInline muted aria-label="Camera preview" className={facing === "user" ? "camera-mirror" : ""} onLoadedMetadata={() => setReady(Boolean(video.current?.videoWidth))}/><p role="status">{ready ? "Place the donation items clearly in the frame." : "Opening camera... allow camera access if asked."}</p><div className="camera-actions"><button type="button" className="btn btn-primary btn-small" disabled={!ready || busy} onClick={capture}>Take picture</button><button type="button" className="btn btn-outline btn-small" disabled={!ready || busy} onClick={() => openCamera(facing === "user" ? "environment" : "user")}>Switch camera</button><button type="button" className="btn btn-outline btn-small" onClick={closeCamera} disabled={busy}>Close camera</button></div></div>}
    <label className="camera-fallback">Or use your device camera<input type="file" aria-label={`Take ${label.toLowerCase()}`} accept="image/jpeg,image/png,image/webp" capture="user" onChange={upload} disabled={busy || disabled}/></label>
    <small>Large photos are resized before uploading.</small>
    {busy && <p role="status">Preparing photo...</p>}{error && <Notice error>{error}</Notice>}
    {value && <div className="donation-preview"><img src={value} alt={`${label} preview`}/><button type="button" className="btn btn-outline btn-small" disabled={disabled || busy} onClick={() => onChange("")}>Remove photo</button></div>}
  </div>;
}
