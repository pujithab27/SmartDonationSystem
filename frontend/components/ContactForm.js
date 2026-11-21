"use client";

import { useRef, useState } from "react";
import Input from "./Input";
import { Notice } from "./ui";
import { sendContact } from "../lib/api";
export default function ContactForm() {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    try {
      if (!fields.name.trim() || !fields.message.trim())
        throw new Error("Please add your name and message.");
      await sendContact(fields);
      setNotice(
        "Your message has been saved and is visible in the admin workspace.",
      );
      setError(false);
      form.reset();
    } catch (err) {
      setNotice(err.message);
      setError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <Input
        label="Your name"
        name="name"
        placeholder="Full name"
        maxLength={100}
      />
      <Input
        label="Email address"
        name="email"
        type="email"
        placeholder="you@example.com"
      />
      <div className="field">
        <label htmlFor="contact-subject">What can we help with?</label>
        <select id="contact-subject" name="subject">
          <option>General question</option>
          <option>Donor support</option>
          <option>NGO partnership</option>
          <option>Campaign concern</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="contact-message">Your message *</label>
        <textarea
          id="contact-message"
          name="message"
          required
          maxLength={2000}
          rows={5}
          placeholder="Tell us a little about it…"
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending message…" : "Send message →"}
      </button>
      <small className="field-hint">
        Your message will appear in the administrator’s inbox.
      </small>
      {notice && <Notice error={error}>{notice}</Notice>}
    </form>
  );
}
