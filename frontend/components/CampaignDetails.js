"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useAppData from "../lib/useAppData";
import {
  canDonate,
  isPublicCampaign,
  recordDonation,
  toggleSaved,
  refreshAppData,
} from "../lib/api";
import { money, percent } from "../lib/data";
import { Notice, Progress, Badge, EmptyState } from "./ui";
import Input from "./Input";
import Icon from "./Icon";
export default function CampaignDetails({ id }) {
  const { data, session, ready, error } = useAppData();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const transaction = useRef(null);
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (ready && !defaultsApplied.current) {
      const preferred = data.settings[session?.email]?.defaultAmount;
      const previewAmount = new URLSearchParams(window.location.search).get(
        "amount",
      );
      if (
        previewAmount &&
        /^\d{1,8}(?:\.\d{1,2})?$/.test(previewAmount) &&
        Number(previewAmount) >= 1 &&
        Number(previewAmount) <= 10000000
      ) {
        setAmount(previewAmount);
      } else if (preferred) {
        setAmount(String(preferred));
      }
      defaultsApplied.current = true;
    }
  }, [ready, data.settings, session]);
  const campaign = data.requests.find(
    (c) => c.id === id && isPublicCampaign(c, data),
  );
  const org = data.ngos.find((n) => n.email === campaign?.ownerEmail);
  if (!ready)
    return (
      <div className="loading">
        <span>Finding your cause…</span>
      </div>
    );
  if (error) return <section className="container section"><Notice error>{error}</Notice><button type="button" className="btn btn-outline" onClick={() => refreshAppData(true)}>Try again</button></section>;
  if (!campaign)
    return (
      <div className="container section">
        <EmptyState title="This campaign is not available">
          It may be awaiting review.{" "}
          <Link href="/campaigns" className="text-link">
            Explore other causes →
          </Link>
        </EmptyState>
      </div>
    );
  const accepting = canDonate(campaign, data);
  function returnTarget() {
    const validAmount =
      /^\d{1,8}(?:\.\d{1,2})?$/.test(amount) &&
      Number(amount) >= 1 &&
      Number(amount) <= 10000000;
    return `/campaigns/${id}${validAmount ? `?amount=${amount}` : ""}#donate`;
  }
  async function donate(e) {
    e.preventDefault();
    if (locked.current) return;
    if (session?.role !== "donor") {
      router.push(
        `/donor/login?next=${encodeURIComponent(returnTarget())}`,
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setMessage("");
    const fields = new FormData(e.currentTarget);
    try {
      transaction.current ||= crypto.randomUUID();
      const receipt = await recordDonation({
        campaignId: id,
        amount,
        anonymous: fields.get("anonymous") === "on",
        message: fields.get("message"),
        transactionId: transaction.current,
      });
      router.push(`/donations/${receipt}`);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
      locked.current = false;
    }
  }
  async function save() {
    if (session?.role !== "donor") {
      router.push(
        `/donor/login?next=${encodeURIComponent(returnTarget())}`,
      );
      return;
    }
    try {
      await toggleSaved(id);
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Campaign link copied.");
    } catch {
      setMessage("Copy the campaign URL from your browser to share it.");
    }
  }
  return (
    <div className="container">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/campaigns">Campaigns</Link>
        <span>/</span>
        <span>{campaign.category}</span>
      </nav>
      <div className="detail-layout">
        <article className="detail-main">
          <Badge>{campaign.category}</Badge>
          <h1>{campaign.title}</h1>
          <div className="detail-subtitle">
            <Link href={`/ngos/${encodeURIComponent(org.email)}`}>
              <Icon name="shield" size={15} /> {campaign.ngo}
            </Link>
            <span>
              <Icon name="pin" size={14} />
              {campaign.location}
            </span>
          </div>
          <img
            className="detail-cover"
            src={campaign.image}
            alt={`${campaign.category} campaign illustration`}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/community.jpg";
            }}
          />
          <section className="detail-story">
            <span className="eyebrow">THE STORY BEHIND THE CAUSE</span>
            <h2>
              A shared goal.
              <br />
              <em>A meaningful difference.</em>
            </h2>
            <p>{campaign.description}</p>
            <p>
              Every contribution brings this campaign closer to its goal. The
              organization’s plan is to use the funds for the needs described
              above, with a focus on the people and communities it serves.
            </p>
            <div className="detail-facts">
              <div>
                <span>Who this supports</span>
                {campaign.beneficiaries || "Community members in need"}
              </div>
              <div>
                <span>Fundraising goal</span>
                {money(campaign.need)}
              </div>
              <div>
                <span>Campaign begins</span>
                {campaign.startDate || "Ongoing"}
              </div>
              <div>
                <span>Campaign ends</span>
                {campaign.endDate || "Until the goal is reached"}
              </div>
            </div>
          </section>
          <div className="info-panel">
            <h3>Meet {org.ngoName}</h3>
            <p>{org.description}</p>
            <p style={{ marginTop: 12 }}>
              Registration: {org.registrationNumber} · Account approved
            </p>
            <Link
              href={`/ngos/${encodeURIComponent(org.email)}`}
              className="text-link"
              style={{ marginTop: 18 }}
            >
              View organization <Icon name="diagonal" size={16} />
            </Link>
          </div>
          <div className="detail-actions">
            <button
              onClick={save}
              aria-pressed={(data.saved[session?.email] || []).includes(id)}
            >
              <Icon name="heart" size={17} />
              {(data.saved[session?.email] || []).includes(id)
                ? "Saved to your causes"
                : "Save this cause"}
            </button>
            <button onClick={share}>
              <Icon name="diagonal" size={17} />
              Copy campaign link
            </button>
          </div>
          {message && <Notice>{message}</Notice>}
        </article>
        <aside className="donation-panel" id="donate">
          <span className="eyebrow">A LITTLE GENEROSITY GOES A LONG WAY</span>
          <h2>
            Be part of <em>the change.</em>
          </h2>
          <div className="raised-row">
            <strong>
              {money(campaign.raised)} <span>raised</span>
            </strong>
            <span>{percent(campaign)}%</span>
          </div>
          <Progress campaign={campaign} />
          <p className="funding-caption">
            of {money(campaign.need)} goal ·{" "}
            {campaign.status === "Completed" ? "Goal reached" : "Campaign"}
          </p>
          {accepting ? (
            <form className="form" onSubmit={donate}>
              <fieldset>
                <legend>Choose your contribution</legend>
                <div className="amount-grid">
                  {[250, 500, 1000].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={Number(amount) === value ? "active" : ""}
                      aria-pressed={Number(amount) === value}
                      onClick={() => setAmount(String(value))}
                    >
                      {money(value)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Input
                name="amount"
                label="Your amount (₹)"
                type="number"
                min="1"
                max="10000000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <label className="check">
                <input type="checkbox" name="anonymous" />{" "}
                <span>Make my contribution anonymous to the NGO</span>
              </label>
              <div className="field">
                <label htmlFor="donor-message">
                  A note of encouragement (optional)
                </label>
                <textarea
                  name="message"
                  id="donor-message"
                  maxLength={500}
                  rows={2}
                  placeholder="Leave a little kindness…"
                />
              </div>
              <button className="btn btn-primary full-width" disabled={busy}>
                {busy
                  ? "Preparing your receipt…"
                  : session?.role === "donor"
                    ? `Pledge ${money(amount)}`
                    : "Sign in to contribute"}
                <Icon name="heart" size={17} />
              </button>
              <p className="donation-note">
                This records a pledge. It does not process a payment or issue a tax receipt.
              </p>
            </form>
          ) : (
            <Notice>
              {campaign.status === "Completed"
                ? "This campaign has reached its goal. Thank you for being part of the journey."
                : "Contributions open during the campaign dates shown in the story."}
              <br />
              <Link href="/campaigns" className="text-link">
                Explore more causes →
              </Link>
            </Notice>
          )}
          {message && <Notice>{message}</Notice>}
        </aside>
      </div>
    </div>
  );
}
