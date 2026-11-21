"use client";
import Link from "next/link";
import useAppData from "../lib/useAppData";
import { refreshAppData } from "../lib/api";
import { EmptyState, Badge, Notice } from "./ui";
export default function NgoDetails({ email }) {
  const { data, session, ready, error } = useAppData();
  if (error) return <section className="container section"><Notice error>{error}</Notice><button type="button" className="btn btn-outline" onClick={() => refreshAppData(true)}>Try again</button></section>;
  if (!ready)
    return (
      <div className="loading">
        <span>Meeting the organization…</span>
      </div>
    );
  const ngo = data.ngos.find(
    (n) => n.email === email && n.status === "Verified",
  );
  if (!ngo)
    return (
      <div className="container section">
        <EmptyState title="Organization unavailable">
          Only approved organizations appear here.{" "}
          <Link href="/ngos">Explore the directory →</Link>
        </EmptyState>
      </div>
    );

  return (
    <div className="container">
      <nav className="breadcrumbs">
        <Link href="/ngos">NGO community</Link>
        <span>/</span>
        <span>Organization profile</span>
      </nav>
      <section className="section">
        <div className="ngo-detail-heading">
          <span className={`ngo-monogram ${ngo.color || ""}`}>
            {ngo.initials || ngo.ngoName.slice(0, 2)}
          </span>
          <h1>{ngo.ngoName}</h1>
        </div>
        <Badge>Account approved</Badge>
        <div className="page-intro" style={{ paddingTop: 25 }}>
          <p>{ngo.description}</p>
          <p>
            {[ngo.city, ngo.state].filter(Boolean).join(", ")} · Registration{" "}
            {ngo.registrationNumber}
          </p>
        </div>
        <h2>Support their item needs</h2>
        <p>Browse current requests and offer useful items through your donor workspace.</p>
        <Link className="btn btn-primary" href={session?.role === "donor" ? "/dashboard/donor/requirements" : "/donor/login"}>Browse item needs</Link>
      </section>
    </div>
  );
}
