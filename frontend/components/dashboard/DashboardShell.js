"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Brand from "../Brand";
import Icon from "../Icon";
import { Notice } from "../ui";
import useAppData from "../../lib/useAppData";
import { clearSession, refreshAppData } from "../../lib/api";
import DonorWorkspace from "./DonorWorkspace";
import NgoWorkspace from "./NgoWorkspace";
import Notifications from "./Notifications";
import AdminWorkspace from "./AdminWorkspace";
import WorkspaceSearch from "./WorkspaceSearch";
const menus = {
  donor: [
    ["overview", "Dashboard", "grid"],
    ["give", "Add donation", "plus"],
    ["requirements", "Browse NGO needs", "heart"],
    ["items", "My donations", "box"],
    ["impact", "My impact", "heart"],
    ["matches", "Matches & pickups", "link"],
    ["notifications", "Notifications", "bell"],
    ["profile", "My profile", "user"],
  ],
  ngo: [
    ["overview", "Dashboard", "grid"],
    ["create", "Request items", "plus"],
    ["available", "Available donations", "heart"],
    ["requests", "My requests", "box"],
    ["matches", "Deliveries & pickups", "link"],
    ["notifications", "Notifications", "bell"],
    ["profile", "Organization profile", "building"],
  ],
  admin: [
    ["overview", "Overview", "grid"],
    ["approvals", "Account approvals", "shield"],
    ["donors", "Manage donors", "people"],
    ["ngos", "Manage NGOs", "building"],
    ["requests", "NGO requests", "box"],
    ["tracking", "Delivery tracking", "link"],
    ["donations", "Item donations", "receipt"],

    ["settings", "Settings", "settings"],
  ],
};
const navigationGroups = {
  donor: { give: "GIVING", items: "ACTIVITY", profile: "ACCOUNT" },
  ngo: { create: "REQUESTS", matches: "ACTIVITY", profile: "ACCOUNT" },
};
const exchangePages = {
  impact: ["Your impact", "Celebrate the items received, the NGOs supported, and every act of kindness along the way."],
  available: ["Available donations", "See what donors are offering and let them know your NGO is interested."],
  create: ["Request items", "Tell donors what your NGO needs and where to deliver it."],
  requests: ["My requests", "See what is needed, what donors accepted and what has arrived."],
  give: ["Make a donation", "Give something useful. We’ll help you find where it’s needed."],
  requirements: ["Browse NGO needs", "Find an item you can share, then choose the NGO you want to support."],
  items: ["Donation history", "Track your item donations, matches, and completed deliveries."],
  matches: ["Deliveries & pickups", "Follow accepted donations, arrange collection and record receipt."],
  notifications: ["Notifications", "Your latest donation, pickup, and delivery updates."],
  profile: ["Your profile", "Manage your contact information and address."],
};
export default function DashboardShell({ role, section = "overview" }) {
  const router = useRouter();
  const { data, session, ready, error } = useAppData();
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggle = useRef(null);
  const menu = menus[role];
  useEffect(() => {
    if (!navigationOpen) return;
    const close = (event) => { if (event.key === "Escape") { setNavigationOpen(false); navigationToggle.current?.focus(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navigationOpen]);
  useEffect(() => {
    if (ready && !error && !signingOut && (!menu || session?.role !== role))
      router.replace(`/${menu ? role : "donor"}/login`);
  }, [ready, session, role, router, menu, error, signingOut]);
  useEffect(() => {
    if (!session || signingOut) return;
    const refresh = () => { if (document.visibilityState === "visible") refreshAppData(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [session?.email, session?.role, signingOut]);
  if (error) return <main className="container section"><Notice error>{error}</Notice><button className="btn btn-primary" onClick={() => refreshAppData(true)}>Try again</button></main>;
  if (!ready || !session || session.role !== role || !menu)
    return (
      <main className="loading" role="status">
        <span>Opening your workspace…</span>
      </main>
    );
  const exchangePage = role !== "admin" ? exchangePages[section] : null;
  const title = exchangePage?.[0] || (
    section === "overview"
      ? role === "donor"
        ? "Your giving dashboard"
        : role === "ngo"
          ? "Your NGO dashboard"
          : "Community overview"
      : role === "admin" && ["verification"].includes(section)
        ? "Account approvals"
        : menu.find(([key]) => key === section)?.[1]);
  if (!title)
    return (
      <main className="container section">
        <h1>That workspace page isn’t here.</h1>
        <Link href={`/dashboard/${role}`} className="btn btn-primary">
          Back to overview
        </Link>
      </main>
    );
  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");
    try {
      await clearSession();
      router.replace("/", { scroll: false });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch (err) {
      setLogoutError(err.message);
      setSigningOut(false);
    }
  }
  return (
    <div
      className={`dashboard-layout ${role}-shell ${role !== "admin" ? "exchange-shell" : ""} ${data.settings[session.email]?.compact ? "compact" : ""}`}
    >
      <a href="#workspace-content" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar" data-navigation-open={navigationOpen}>
        <div className="sidebar-content">
          <div className="workspace-brand-row"><Brand light={role === "admin"} />{role !== "admin" && <button ref={navigationToggle} type="button" className="workspace-menu-toggle" aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(!navigationOpen)}><Icon name={navigationOpen ? "close" : "menu"} size={21}/><span>{navigationOpen ? "Close" : "Menu"}</span></button>}</div>
          {role === "admin" ? <span className="workspace-label">ADMIN WORKSPACE</span> : <div className="exchange-account-role"><Icon name={role === "ngo" ? "building" : "heart"} size={16}/><strong>{role === "ngo" ? "NGO workspace" : "Donor workspace"}</strong></div>}
          <nav className="sidebar-menu" id="workspace-navigation" aria-label="Workspace navigation">
            {menu.map(([key, label, icon]) => (
              <Fragment key={key}>
              {navigationGroups[role]?.[key] && <span className="workspace-nav-group">{navigationGroups[role][key]}</span>}
              <Link
                href={`/dashboard/${role}${key === "overview" ? "" : "/" + key}`}
                className={section === key ? "active" : ""}
                aria-current={section === key ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
              >
                <Icon name={icon} size={18} />
                <span>{label}</span>
                {role !== "admin" && key === "notifications" && data.unreadNotifications > 0 && <span className="workspace-nav-count">{Math.min(data.unreadNotifications, 99)}</span>}
                {role === "admin" && key === "approvals" && <span className="access-nav-count">{data.users.filter((user) => ["donor", "ngo"].includes(user.role) && user.approvalStatus === "Pending").length}</span>}
              </Link>
              </Fragment>
            ))}
          </nav>
          {role !== "admin" && <Link href="/how-it-works" className="workspace-help"><Icon name="book" size={18}/><span>How giving works</span><Icon name="diagonal" size={14}/></Link>}
          {role === "admin" && (
            <Link href="/" className="workspace-home">
              <Icon name="diagonal" size={16} />
              Back to the community
            </Link>
          )}
        </div>
        <div className="sidebar-bottom" aria-label="Your account">
          <div className="sidebar-account">
            <span className="avatar-circle">
              {session.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="sidebar-identity">
              <strong>{session.name}</strong>
              <small className="sidebar-email" title={session.email}>{session.email}</small>
              <small>
                {role === "ngo"
                  ? "Organization"
                  : role.charAt(0).toUpperCase() + role.slice(1)}{" "}
                account
              </small>
            </div>
          </div>
          <button type="button" className="signout-button workspace-signout" onClick={logout} disabled={signingOut}>
            <Icon name="logout" size={18} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {logoutError && <Notice error>{logoutError}</Notice>}
        </div>
      </aside>
      <main className="dash-content" id="workspace-content">
        <div className="dash-topbar">
          <span className="workspace-breadcrumb">
            {role === "ngo" ? "NGO" : role.charAt(0).toUpperCase() + role.slice(1)}<span aria-hidden="true">/</span><strong>{menu.find(([key]) => key === section)?.[1]}</strong>
          </span>
          <div className="dash-topbar-actions">
            {role !== "admin" && <WorkspaceSearch role={role} pages={menu}/>}
            {role === "admin" && <span className="badge badge-green">COMMUNITY OPERATIONS</span>}
            {role !== "admin" && <Notifications data={data} />}
            {role !== "admin" && <Link className="workspace-profile-link" href={`/dashboard/${role}/profile`} aria-label="Open your profile"><span>{session.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span></Link>}
          </div>
        </div>
        <header className="dash-header">
          <div>
            {role !== "admin" && section === "overview" && <span className="eyebrow">{`Welcome back, ${session.name.split(" ")[0]}`}</span>}
            <h1>{title}</h1>
            <p>
              {exchangePage?.[1] || (role === "donor"
                ? "Your donations, community needs, and what to do next."
                : role === "ngo"
                  ? "Keep your requests clear, your donors connected, and your deliveries on track."
                  : section === "overview" ? "A thoughtful overview of the people joining Smart Donation System." : "Manage accounts and follow item donations from offer to receipt.")}
            </p>
          </div>
        </header>
        {error && <Notice error>{error}</Notice>}
        {role === "donor" ? (
          <DonorWorkspace
            key={section}
            section={section}
            data={data}
            session={session}
          />
        ) : role === "ngo" ? (
          <NgoWorkspace
            key={section}
            section={section}
            data={data}
            session={session}
          />
        ) : (
          <AdminWorkspace
            key={section}
            section={section}
            data={data}
            session={session}
          />
        )}
      </main>
    </div>
  );
}
