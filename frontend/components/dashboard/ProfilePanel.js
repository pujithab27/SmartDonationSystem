"use client";

import { useRef, useState } from "react";
import ProfileFields from "../ProfileFields";
import { Notice } from "../ui";
import { categories } from "../../lib/data";
import { validateProfile } from "../../lib/validation";
import { updateProfile } from "../../lib/api";
export default function ProfilePanel({ session, data }) {
  const profile =
    session.role === "ngo"
      ? data.ngos.find((n) => n.email === session.email)
      : data.users.find(
          (u) => u.email === session.email && u.role === session.role,
        );
  const values = {
    ...profile,
    firstName: profile?.firstName || session.name.split(" ")[0],
    lastName: profile?.lastName || session.name.split(" ").slice(1).join(" "),
  };
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  async function save(e) {
    e.preventDefault();
    if (submitting.current) return;
    const form = new FormData(e.currentTarget);
    const fields = Object.fromEntries(form);
    fields.email = session.email;
    const issues = validateProfile(fields, session.role, false);
    setErrors(issues);
    if (Object.keys(issues).length) {
      setNotice("Please check the highlighted fields.");
      setFailed(true);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await updateProfile({ ...fields, interests: form.getAll("interests") });
      setFailed(false);
      setNotice(
        session.role === "ngo"
          ? "Your profile has been updated. Changes to your NGO’s name or registration number require a new review."
          : "Your profile and interests have been updated.",
      );
    } catch (err) {
      setFailed(true);
      setNotice(err.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel narrow">
      <h2>
        {session.role === "ngo"
          ? "The story behind your organization"
          : "A little more about you"}
      </h2>
      <p>
        Keep your contact details up to date. Your account email cannot be changed here.
      </p>
      <form className="form" onSubmit={save} noValidate>
        <ProfileFields
          role={session.role}
          values={values}
          errors={errors}
          disabledEmail
        />
        {session.role === "donor" && (
          <fieldset>
            <legend>Causes close to your heart</legend>
            <span className="file-description">
              Used for the interest-based recommendations on your dashboard.
            </span>
            <div className="preference-grid">
              {categories.map((c) => (
                <label key={c} className="check">
                  <input
                    type="checkbox"
                    name="interests"
                    value={c}
                    defaultChecked={profile?.interests?.includes(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {notice && <Notice error={failed}>{notice}</Notice>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving profile…" : "Save profile →"}</button>
      </form>
    </section>
  );
}
