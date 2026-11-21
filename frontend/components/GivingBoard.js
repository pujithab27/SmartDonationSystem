"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import useAppData from "../lib/useAppData";
import { givingThemes, matchingNeeds, directoryHref } from "../lib/givingExchange";

const categoryIcons = { food: "food", clothing: "heart", education: "book", healthcare: "medical" };
const givingStories = {
  food: { image: "/images/food.jpg", alt: "A nourishing meal made with everyday ingredients", line: "A full pantry. A little peace of mind.", caption: "Food & everyday essentials" },
  clothing: { image: "/images/community.jpg", alt: "Volunteers sorting supplies for a community", line: "Something to share. Someone to care.", caption: "Clothes & community care" },
  education: { image: "/images/education.jpg", alt: "Learning and education materials", line: "A new page. A world of possibilities.", caption: "Books & learning essentials" },
  healthcare: { image: "/images/healthcare.jpg", alt: "A healthcare professional providing care", line: "A little comfort. When it matters most.", caption: "Healthcare essentials" },
};
export default function GivingBoard({ compact = false }) {
  const [selected, setSelected] = useState("food");
  const { data, session, ready, error } = useAppData();
  const theme = givingThemes.find((item) => item.id === selected);
  const story = givingStories[selected];
  const needs = matchingNeeds(data.itemRequests, theme.category);
  const destination = directoryHref(theme.category);
  const isDonor = session?.role === "donor";
  const href = isDonor ? destination : session ? `/dashboard/${session.role}` : `/donor/login?next=${encodeURIComponent(destination)}`;
  return (
    <section className={`giving-finder${compact ? " compact-finder" : " story-finder"}`} aria-label="Find NGOs by what you can give">
      {!compact && <div className="giving-story"><Image key={selected} src={story.image} alt={story.alt} fill sizes="(max-width: 760px) 100vw, 50vw" /><span className="story-image-label"><Icon name={categoryIcons[selected]} size={16} />{story.caption}</span><div className="giving-story-caption" aria-live="polite"><span>THE POSSIBILITIES IN EVERY GIFT</span><h3>{story.line}</h3><small>Illustrative photography</small></div></div>}
      <div className="giving-controls">
      {!compact && <div className="finder-prompt"><span className="petal-label label-lavender">Choose what you can share</span></div>}
      <div className="giving-categories" role="group" aria-label="Choose what to give">
        {givingThemes.map((item) => <button key={item.id} className={`giving-category category-${item.id}`} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
          <span className="category-icon"><Icon name={categoryIcons[item.id]} size={23} /></span><span>{item.label}</span><span className="category-check"><Icon name={selected === item.id ? "check" : "plus"} size={16} /></span>
        </button>)}
      </div>
      <div className="giving-match">
        <div aria-live="polite" aria-atomic="true"><h3>{theme.caption}</h3><p>{theme.detail}</p><span className="match-status">{error ? "Request counts are unavailable right now." : !ready ? "Loading community needs…" : isDonor ? `${needs.length} open ${needs.length === 1 ? "request" : "requests"} in ${theme.category.toLowerCase()}` : session ? "Continue in your community workspace" : "Sign in with an approved donor account to view item requests"}</span></div>
        <Link href={href} className="round-link">{isDonor ? "Find matching NGOs" : session ? "Your workspace" : "Find a connection"}<span><Icon name="diagonal" size={19} /></span></Link>
      </div>
      </div>
    </section>
  );
}
