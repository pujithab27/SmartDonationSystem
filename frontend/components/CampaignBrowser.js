"use client";

import { useEffect, useState } from "react";
import useAppData from "../lib/useAppData";
import { categories, percent } from "../lib/data";
import { isPublicCampaign, refreshAppData } from "../lib/api";
import { matchesSearch } from "../lib/search";
import CampaignCard from "./CampaignCard";
import Icon from "./Icon";
import { EmptyState, Notice, LoadingCards } from "./ui";
export default function CampaignBrowser({ savedOnly = false }) {
  const { data, session, error, ready } = useAppData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All causes");
  const [sort, setSort] = useState("featured");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("category");
    if (categories.includes(value)) setCategory(value);
  }, []);
  const saved = data.saved[session?.email] || [];
  const campaigns = data.requests.filter(
    (c) =>
      isPublicCampaign(c, data) &&
      (!savedOnly || saved.includes(c.id)) &&
      (category === "All causes" || c.category === category) &&
      matchesSearch(`${c.title} ${c.description} ${c.ngo} ${c.location}`, search),
  );
  if (sort === "urgent")
    campaigns.sort(
      (a, b) => Number(b.urgency === "Urgent") - Number(a.urgency === "Urgent"),
    );
  if (sort === "progress") campaigns.sort((a, b) => percent(b) - percent(a));
  if (sort === "newest")
    campaigns.sort((a, b) =>
      String(b.startDate || "").localeCompare(String(a.startDate || "")),
    );
  if (!ready) return <LoadingCards label="Loading campaigns" />;
  if (error) return <><Notice error>{error}</Notice><button type="button" className="btn btn-outline" onClick={() => refreshAppData(true)}>Try again</button></>;
  return (
    <>
      <div className="listing-tools">
        <label className="search-field">
          <Icon name="search" size={19} />
          <input
            type="search"
            aria-label="Search campaigns"
            placeholder="Search by cause, NGO, or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="select-control"
          aria-label="Sort campaigns"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="featured">Default order</option>
          <option value="urgent">Most urgent</option>
          <option value="progress">Highest funding progress</option>
          <option value="newest">Latest start date</option>
        </select>
      </div>
      <div className="filter-row" aria-label="Filter by cause">
        {["All causes", ...categories].map((c) => (
          <button
            key={c}
            className={`filter-chip ${category === c ? "active" : ""}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="listing-count" aria-live="polite">
        {campaigns.length} {savedOnly ? "saved " : ""}{campaigns.length === 1 ? "campaign" : "campaigns"} found
      </p>
      <div className="campaign-grid">
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} saved={saved.includes(c.id)} />
        ))}
        {!campaigns.length && (
          <EmptyState
            title={
              savedOnly && !saved.length
                ? "No saved campaigns yet"
                : "No campaigns found"
            }
          >
            {savedOnly && !saved.length
              ? "Tap the heart on any campaign to save it here."
              : "Try another search or category."}
          </EmptyState>
        )}
      </div>
    </>
  );
}
