"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Input from "./Input";
import Icon from "./Icon";
import { Notice } from "./ui";
import { loginAccount } from "../lib/api";
import { loginDestination } from "../lib/loginDestination";
export default function LoginForm({ role }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(email, password) {
    if (busy) return;
    setMessage("");
    setBusy(true);
    try {
      await loginAccount(role, email, password);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(loginDestination(role, next));
    } catch (e) {
      setMessage(e.message);
      setBusy(false);
    }
  }
  function submit(e) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    login(String(values.get("email")), String(values.get("password")));
  }
  return (
    <form onSubmit={submit} className="form">
      <Input
        label="Email address"
        name="email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
      />
      <Input
        label="Password"
        name="password"
        type="password"
        placeholder="Your password"
        autoComplete="current-password"
      />
      {message && <Notice error>{message}</Notice>}
      <button
        className={`btn btn-primary full-width role-${role}`}
        type="submit"
        disabled={busy}
      >
        {busy
          ? "Signing in…"
          : "Log in"}
        <Icon name="arrow" size={18} />
      </button>
      <p className="field-hint">
        {role === "admin"
          ? "Sign in with your administrator account."
          : "Your account needs administrator approval before your first sign-in."}
      </p>
      {role !== "admin" && (
        <p className="switch-text">
          New to Smart Donation System?{" "}
          <Link href={`/${role}/signup`}>Create an account</Link>
        </p>
      )}
      <Link href="/login" className="switch-role">
        Sign in with a different role
      </Link>
    </form>
  );
}
