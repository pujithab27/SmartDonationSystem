"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Brand from "./Brand";
import Icon from "./Icon";
import useAppData from "../lib/useAppData";
import { clearSession } from "../lib/api";

const links = [
  ["/", "Home"],
  ["/ngos", "Our NGOs"],
  ["/how-it-works", "How it works"],
  ["/about", "About us"],
  ["/contact", "Contact"],
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const toggle = useRef(null);
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAppData();

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) toggle.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 1000px)");
    const update = () => {
      setCompact(viewport.matches);
      if (!viewport.matches) setOpen(false);
    };
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");
    try {
      await clearSession();
      setOpen(false);
      router.replace("/", { scroll: false });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch (err) {
      setLogoutError(err.message);
    } finally {
      setSigningOut(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <header className={`site-header${pathname === "/" ? " over-sky" : ""}`}>
      <button type="button" className={`nav-backdrop${open ? " open" : ""}`} onClick={() => closeMenu(true)} tabIndex={-1} inert={!compact || !open} aria-label="Close navigation overlay" />
      <div className="container nav">
        <Brand />
        <nav className={`nav-links ${open ? "open" : ""}`}
          id="main-navigation" aria-label="Main navigation" inert={compact && !open}>
          <div className="nav-menu-heading" aria-hidden="true"><span>A little good starts here.</span><span className="nav-menu-flower">✳</span></div>
          {links.map(([href, label], index) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            return <Link key={href} href={href} onClick={() => closeMenu()} style={{ "--nav-order": index }}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}>
              <span className="nav-link-number" aria-hidden="true">0{index + 1}</span>
              <span className="nav-label-window"><span className="nav-label-text">{label}</span><span className="nav-label-echo" aria-hidden="true">{label}</span></span>
              <span className="nav-link-arrow" aria-hidden="true"><Icon name="diagonal" size={17} /></span>
            </Link>;
          })}
          <div className="mobile-auth">
            <Link href={session ? `/dashboard/${session.role}` : "/login"} onClick={() => setOpen(false)}>
              {session ? "My dashboard" : "Log in"}
            </Link>
            {!session && <Link href="/register" onClick={() => setOpen(false)}>Sign up</Link>}
          </div>
        </nav>
        <button ref={toggle} className="icon-button menu-toggle" type="button"
          aria-expanded={open} aria-controls="main-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => open ? closeMenu(true) : setOpen(true)}><span className="menu-glyph" aria-hidden="true"><span /><span /><span /></span></button>
        <div className={`nav-actions${session ? " signed-in" : ""}`}>
          <Link className="nav-login" href={session ? `/dashboard/${session.role}` : "/login"}>
            {session ? "My dashboard" : "Log in"}
          </Link>
          {session && <button type="button" className="signout-button" onClick={logout} disabled={signingOut}>
            <Icon name="logout" size={16} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>}
          <Link className="btn btn-primary btn-small nav-signup" href={session ? `/dashboard/${session.role}` : "/register"}>{session ? "Open workspace" : "Sign up"}<Icon name="diagonal" size={17} /></Link>
        </div>
      </div>
      {logoutError && <p className="container logout-error" role="alert">{logoutError}</p>}
    </header>
    </>
  );
}
