"use client";
import Link from "next/link";
import { money } from "../../lib/data";
import { EmptyState, Status } from "../ui";
export function DonationTable({ donations, data, role = "donor" }) {
  if (!donations.length)
    return (
      <EmptyState title="Every giving story has a first chapter">
        {role === "donor" ? (
          <Link href="/campaigns" className="text-link">
            Find a cause to support →
          </Link>
        ) : (
          "Contributions to your campaigns will appear here."
        )}
      </EmptyState>
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Campaign</th>
            {role !== "donor" && <th>Donor</th>}
            <th>Amount</th>
            <th>Date</th>
            <th>{role === "donor" ? "Receipt" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {donations.map((d) => (
            <tr key={d.id}>
              <td>
                {d.campaignTitle ||
                  data.requests.find((c) => c.id === d.requestId)?.title ||
                  "Campaign"}
                <small>{d.id}</small>
              </td>
              {role !== "donor" && (
                <td>
                  {d.anonymous
                    ? "Anonymous donor"
                    : d.donorName ||
                      (role === "admin" ? d.donorEmail : "Community donor")}
                  {role === "admin" && <small>{d.donorEmail}</small>}
                </td>
              )}
              <td>{money(d.amount)}</td>
              <td>{new Date(d.date).toLocaleDateString("en-IN")}</td>
              <td>
                {role === "donor" ? (
                  <Link href={`/donations/${d.id}`} className="table-link">
                    View receipt
                  </Link>
                ) : (
                  <Status value="Pledge recorded" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CampaignTable({ campaigns, onSubmitDraft }) {
  if (!campaigns.length)
    return (
      <EmptyState title="Your next chapter starts here">
        Create your first campaign to share your organization’s mission.
      </EmptyState>
    );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Raised / target</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td>
                {c.title}
                <small>
                  {c.category} · {c.location}
                </small>
                {c.reviewNote && <small>Review: {c.reviewNote}</small>}
              </td>
              <td>
                {money(c.raised)}
                <small>of {money(c.need)}</small>
              </td>
              <td>
                <Status value={c.status} />
              </td>
              <td>
                {["Draft", "Rejected"].includes(c.status) && onSubmitDraft ? (
                  <button
                    className="btn btn-outline btn-small"
                    onClick={() => onSubmitDraft(c.id)}
                  >
                    Submit for review
                  </button>
                ) : ["Active", "Completed"].includes(c.status) ? (
                  <Link href={`/campaigns/${c.id}`} className="table-link">
                    View campaign
                  </Link>
                ) : (
                  <span className="tiny muted">Awaiting review</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
