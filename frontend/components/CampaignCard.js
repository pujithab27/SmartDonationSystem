"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";
import { Progress } from "./ui";
import { money, percent } from "../lib/data";
import { toggleSaved, getSession } from "../lib/api";
export default function CampaignCard({ campaign, saved = false }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function save() {
    if (getSession()?.role !== "donor") {
      router.push(
        `/donor/login?next=${encodeURIComponent("/campaigns/" + campaign.id)}`,
      );
      return;
    }
    try {
      await toggleSaved(campaign.id);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <article
      className={`campaign-card cause-${campaign.category.toLowerCase().replace(/[^a-z]+/g, "-")}`}
    >
      <div className="campaign-image">
        <Link
          href={`/campaigns/${campaign.id}`}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={campaign.image}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/community.jpg";
            }}
          />
        </Link>
        <span className="category-label">{campaign.category}</span>
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          onClick={save}
          aria-label={`${saved ? "Unsave" : "Save"} ${campaign.title}`}
          aria-pressed={saved}
        >
          <Icon name="heart" size={19} />
        </button>
        {campaign.urgency === "Urgent" && (
          <span className="urgent-label">Urgent appeal</span>
        )}
      </div>
      <div className="campaign-body">
        <div className="campaign-org">
          <Icon name="shield" size={15} />
          {campaign.ngo}
        </div>
        <h3>
          <Link href={`/campaigns/${campaign.id}`}>{campaign.title}</Link>
        </h3>
        <p>{campaign.description}</p>
        <div className="raised-row">
          <strong>
            {money(campaign.raised)} <span>raised</span>
          </strong>
          <span>{percent(campaign)}%</span>
        </div>
        <Progress campaign={campaign} />
        <div className="campaign-meta">
          <span>
            Goal: <strong>{money(campaign.need)}</strong>
          </span>
          <span>
            <Icon name="pin" size={12} />
            {campaign.location}
          </span>
        </div>
        <Link href={`/campaigns/${campaign.id}`} className="campaign-link">
          {campaign.status === "Completed"
            ? "See the impact"
            : "Support this cause"}{" "}
          <Icon name="arrow" size={17} />
        </Link>
        {error && <small role="alert">{error}</small>}
      </div>
    </article>
  );
}
