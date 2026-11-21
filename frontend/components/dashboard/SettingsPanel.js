"use client";

import { useRef, useState } from "react";
import Input from "../Input";
import { Notice } from "../ui";
import { categories } from "../../lib/data";
import { updateSettings } from "../../lib/api";
export default function SettingsPanel({ session, data }) {
  const settings = data.settings[session.email] || {};
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  async function save(e) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await updateSettings({
          compact: form.get("compact") === "on",
          defaultAmount: Number(form.get("defaultAmount")) || 500,
          defaultCategory: form.get("defaultCategory") || "Education",
          showResolved: form.get("showResolved") === "on",
      });
      setError(false);
      setNotice("Your preferences are saved to your account.");
    } catch (err) {
      setError(true);
      setNotice(err.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel narrow">
      <h2>Make yourself at home</h2>
      <p>
        Personalize your workspace. Your preferences follow your account.
      </p>
      <form className="form" onSubmit={save}>
        {session.role === "donor" && (
          <Input
            label="Default contribution amount (₹)"
            name="defaultAmount"
            type="number"
            min="1"
            max="10000000"
            step="1"
            defaultValue={settings.defaultAmount || 500}
          />
        )}
        {session.role === "ngo" && (
          <div className="field">
            <label htmlFor="default-category">Default campaign category</label>
            <select
              name="defaultCategory"
              id="default-category"
              defaultValue={settings.defaultCategory || "Education"}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <label className="settings-check">
          <span>
            Compact tables
            <small>Use less space between rows in your dashboard.</small>
          </span>
          <input
            type="checkbox"
            name="compact"
            defaultChecked={settings.compact}
          />
        </label>
        {session.role === "admin" && (
          <label className="settings-check">
            <span>
              Show resolved activity
              <small>Include reviewed items in the activity list.</small>
            </span>
            <input
              type="checkbox"
              name="showResolved"
              defaultChecked={settings.showResolved}
            />
          </label>
        )}
        <div className="info-panel">
          <h3>Account & session</h3>
          <p>
            {session.email}
            <br />
            Workspace preferences
          </p>
          <p>
            Email notifications and password recovery are not yet available.
          </p>
        </div>
        {notice && <Notice error={error}>{notice}</Notice>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving preferences…" : "Save preferences →"}</button>
      </form>
    </section>
  );
}
