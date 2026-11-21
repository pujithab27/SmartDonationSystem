"use client";
import Link from "next/link";
import useAppData from "../lib/useAppData";
import { money } from "../lib/data";
import { Notice } from "./ui";
import Icon from "./Icon";
import { refreshAppData } from "../lib/api";
export default function DonationReceipt({ id }) {
  const { data, session, ready, error } = useAppData();
  if (error) return <section className="container section"><Notice error>{error}</Notice><button type="button" className="btn btn-outline" onClick={() => refreshAppData(true)}>Try again</button></section>;
  if (!ready)
    return (
      <div className="loading">
        <span>Opening your receipt…</span>
      </div>
    );
  const donation = data.donations.find(
    (d) =>
      d.id === id &&
      session?.role === "donor" &&
      d.donorEmail === session.email,
  );
  if (!donation)
    return (
      <section className="container section chooser">
        <h1>
          Keep your giving
          <br />
          <em>close to you.</em>
        </h1>
        <p>
          Sign in to the donor account that made this contribution to view its
          receipt.
        </p>
        <Link href={`/donor/login?next=${encodeURIComponent("/donations/" + id)}`} className="btn btn-primary">
          Donor login
        </Link>
      </section>
    );
  const campaign = data.requests.find((c) => c.id === donation.requestId);
  return (
    <div className="receipt-page">
      <article className="receipt">
        <span className="receipt-mark">
          <Icon name="check" size={30} />
        </span>
        <span className="eyebrow">KINDNESS LOOKS GOOD ON YOU</span>
        <h1>
          A little generosity.
          <br />
          <em>A new possibility.</em>
        </h1>
        <p>
          Your pledge has been recorded. Thank you for your commitment to giving.
        </p>
        <dl>
          {[
            ["Receipt", donation.id],
            [
              "Campaign",
              donation.campaignTitle || campaign?.title || "Campaign",
            ],
            ["Organization", donation.ngo || campaign?.ngo],
            ["Contribution", money(donation.amount)],
            ["Donor", donation.donorName || session.name],
            [
              "Date",
              new Date(donation.date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            ],
            ["Status", "Pledge recorded"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Notice>
          This record confirms a pledge, not a completed payment or a tax deduction.
        </Notice>
        <div className="button-row">
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Icon name="download" size={17} />
            Print / save receipt
          </button>
          <Link href="/dashboard/donor" className="text-link">
            Back to dashboard <Icon name="arrow" size={17} />
          </Link>
        </div>
      </article>
    </div>
  );
}
