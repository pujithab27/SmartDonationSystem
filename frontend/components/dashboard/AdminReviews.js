"use client";

import { useState } from "react";
import { reviewNgo, reviewCampaign } from "../../lib/api";
import { money } from "../../lib/data";
import { Status, Notice, EmptyState } from "../ui";
export default function AdminReviews({
  data,
  type = "ngo",
  pendingOnly = false,
}) {
  const [filter, setFilter] = useState(pendingOnly ? "Pending" : "All");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [reasons, setReasons] = useState({});
  const items = (type === "ngo" ? data.ngos : data.requests).filter(
    (item) =>
      filter === "All" ||
      (filter === "Pending"
        ? item.status.includes("Pending")
        : item.status === filter),
  );
  async function decide(id, status) {
    try {
      if (type === "ngo") await reviewNgo(id, status, reasons[id] || "");
      else await reviewCampaign(id, status, reasons[id] || "");
      setError(false);
      setNotice(`Review saved: ${status}.`);
    } catch (e) {
      setError(true);
      setNotice(e.message);
    }
  }
  return (
    <>
      <label className="filter-select">
        Review status
        <select
          className="select-control"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {(type === "ngo"
            ? ["All", "Pending", "Verified", "Rejected"]
            : ["All", "Pending", "Active", "Draft", "Completed", "Rejected"]
          ).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {notice && <Notice error={error}>{notice}</Notice>}
      <div className="review-grid">
        {items.map((item) => {
          const id = type === "ngo" ? item.email : item.id;
          const ngo =
            type === "ngo"
              ? item
              : data.ngos.find((n) => n.email === item.ownerEmail);
          return (
            <article className="review-card" key={id}>
              <div className="review-summary">
                <div>
                  <h3>{item.ngoName || item.title}</h3>
                  <p>
                    {type === "ngo"
                      ? `${item.registrationNumber} · ${item.email}`
                      : `${item.ngo} · ${money(item.need)} goal`}
                  </p>
                </div>
                <Status value={item.status} />
              </div>
              <details>
                <summary>
                  Inspect {type === "ngo" ? "organization" : "campaign"} details
                </summary>
                <div className="review-details">
                  <p>
                    <strong>Description:</strong>{" "}
                    {item.description || "Not provided"}
                  </p>
                  {type === "ngo" ? (
                    <>
                      <p>
                        <strong>Contact:</strong> {item.phone || "Not provided"}{" "}
                        · {item.email}
                      </p>
                      <p>
                        <strong>Address:</strong>{" "}
                        {[item.address, item.city, item.state, item.pincode]
                          .filter(Boolean)
                          .join(", ") || "Not provided"}
                      </p>
                      <p>
                        <strong>Website:</strong>{" "}
                        {item.website || "Not provided"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>Location:</strong> {item.location}
                      </p>
                      <p>
                        <strong>Beneficiaries:</strong>{" "}
                        {item.beneficiaries || "Not provided"}
                      </p>
                      <p>
                        <strong>Dates:</strong> {item.startDate} to{" "}
                        {item.endDate}
                      </p>
                      <p>
                        <strong>Category:</strong> {item.category} ·{" "}
                        {item.urgency}
                      </p>
                      <p>
                        <strong>Organization:</strong>{" "}
                        {ngo?.status || "Unknown"} · {item.ownerEmail}
                      </p>
                      <img
                        className="upload-preview"
                        src={item.image}
                        alt="Campaign illustration"
                      />
                      {item.document && (
                        <a
                          href={item.document.data}
                          download={item.document.name}
                          className="table-link"
                        >
                          Download attachment: {item.document.name}
                        </a>
                      )}
                    </>
                  )}
                  {item.reviewNote && (
                    <p>
                      <strong>Last review:</strong> {item.reviewNote}
                    </p>
                  )}
                  <p className="tiny">
                    Review the submitted details and documents before recording your decision.
                  </p>
                </div>
                {!["Completed", "Draft"].includes(item.status) && (
                  <div className="review-actions">
                    <div className="field">
                      <label htmlFor={`review-${id}`}>
                        Review note (required to reject)
                      </label>
                      <input
                        id={`review-${id}`}
                        value={reasons[id] || ""}
                        onChange={(e) =>
                          setReasons({ ...reasons, [id]: e.target.value })
                        }
                        maxLength={500}
                        placeholder="Reason for the decision"
                      />
                    </div>
                    {item.status !==
                      (type === "ngo" ? "Verified" : "Active") && (
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() =>
                          decide(id, type === "ngo" ? "Verified" : "Active")
                        }
                      >
                        Approve {type === "ngo" ? "NGO" : "campaign"}
                      </button>
                    )}
                    {item.status !== "Rejected" && (
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => decide(id, "Rejected")}
                      >
                        Reject
                      </button>
                    )}
                    {type === "campaign" && item.status === "Active" && (
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => decide(id, "Completed")}
                      >
                        Mark completed
                      </button>
                    )}
                  </div>
                )}
              </details>
            </article>
          );
        })}
        {!items.length && (
          <EmptyState title="All clear here">
            No {type === "ngo" ? "organizations" : "campaigns"} match this
            review status.
          </EmptyState>
        )}
      </div>
    </>
  );
}
