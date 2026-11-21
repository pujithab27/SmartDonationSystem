"use client";

import { useState } from "react";
import Link from "next/link";
import Input from "./Input";
import ProfileFields from "./ProfileFields";
import { Notice } from "./ui";
import Icon from "./Icon";
import { validateProfile } from "../lib/validation";
import { registerAccount } from "../lib/api";
export default function SignupForm({ role }) {
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const issues = validateProfile(fields, role);
    if (!fields.agree) issues.agree = "Please agree to continue.";
    setErrors(issues);
    setMessage("");
    if (Object.keys(issues).length) {
      setMessage("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      await registerAccount(role, fields);
      setRegisteredEmail(fields.email.trim().toLowerCase());
    } catch (error) {
      if (error.fields) setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : value])));
      setMessage(error.message);
      setBusy(false);
    }
  }
  if (registeredEmail) return (
    <section className="signup-pending" aria-labelledby="pending-heading" role="status">
      <span className="pending-symbol"><Icon name="shield" size={32} /></span>
      <span className="eyebrow">ONE MORE STEP TOGETHER</span>
      <h2 id="pending-heading">Registration submitted</h2>
      <p>Your {role === "ngo" ? "organization" : "donor"} account for <strong>{registeredEmail}</strong> is ready for review.</p>
      <div className="pending-explanation"><Icon name="clock" size={22} /><div><strong>Awaiting administrator approval</strong><p>You can log in once an administrator has reviewed and approved your account.</p></div></div>
      <Link className="btn btn-primary full-width" href={`/${role}/login`}>Go to login <Icon name="arrow" size={18} /></Link>
      <Link className="text-link" href="/">Back to Smart Donation System</Link>
    </section>
  );
  return (
    <form className="form" onSubmit={submit} noValidate>
      <ProfileFields role={role} errors={errors} />
      <div className="form-grid">
        <Input
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password}
        />
        <Input
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Enter password again"
          error={errors.confirmPassword}
        />
      </div>
      <label className="check">
        <input type="checkbox" name="agree" required />
        <span>
          I agree to the <Link href="/terms">terms</Link> and{" "}
          <Link href="/privacy">privacy policy</Link>
          {role === "ngo"
            ? " and confirm these organization details are accurate."
            : "."}
        </span>
      </label>
      {errors.agree && <small className="field-error">{errors.agree}</small>}
      {message && <Notice error>{message}</Notice>}
      <p className="field-hint">An administrator will review your account before you can sign in.</p>
      <button
        className={`btn btn-primary full-width role-${role}`}
        disabled={busy}
      >
        {busy
          ? "Creating your account…"
          : role === "ngo"
            ? "Register your organization"
            : "Create donor account"}
        <Icon name="arrow" size={18} />
      </button>
      <p className="switch-text">
        Already part of the community?{" "}
        <Link href={`/${role}/login`}>Log in</Link>
      </p>
    </form>
  );
}
