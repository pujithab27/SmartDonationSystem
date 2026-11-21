"use client";

import Link from "next/link";
import { useState } from "react";
import useAppData from "../lib/useAppData";
import { canDonate } from "../lib/api";
import { money, percent } from "../lib/data";
import Icon from "./Icon";

const amounts = [250, 500, 1000];
const tones = {
  Education: "education",
  Food: "food",
  Healthcare: "healthcare",
};

export default function CauseExplorer() {
  const { data } = useAppData();
  const [selectedId, setSelectedId] = useState(null);
  const [amount, setAmount] = useState(500);
  const featured = data.requests
    .filter((campaign) => canDonate(campaign, data))
    .filter((campaign) => tones[campaign.category])
    .slice(0, 3);
  const campaign =
    featured.find((item) => item.id === selectedId) || featured[0];

  if (!campaign) return null;

  const currentProgress = percent(campaign);
  const previewProgress = Math.min(
    100,
    Math.round(((campaign.raised + amount) / campaign.need) * 100),
  );
  const tone = tones[campaign.category];

  function followPointer(event) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spot-x",
      `${((event.clientX - bounds.left) / bounds.width) * 100}%`,
    );
    event.currentTarget.style.setProperty(
      "--spot-y",
      `${((event.clientY - bounds.top) / bounds.height) * 100}%`,
    );
  }

  function resetPointer(event) {
    event.currentTarget.style.removeProperty("--spot-x");
    event.currentTarget.style.removeProperty("--spot-y");
  }

  return (
    <section
      className={`cause-explorer cause-${tone}`}
      aria-labelledby="cause-explorer-heading"
      onPointerMove={followPointer}
      onPointerLeave={resetPointer}
    >
      <div className="container cause-explorer-inner">
        <div className="cause-explorer-copy">
          <span className="eyebrow">THE GIVING STUDIO · INTERACTIVE PREVIEW</span>
          <h2 id="cause-explorer-heading">
            What could your <em>kindness</em> move forward?
          </h2>
          <p>
            Pick a cause and an amount to see how a pledge would move its
            fundraising goal.
          </p>

          <div className="cause-choice" role="group" aria-label="Choose a cause">
            {featured.map((item) => (
              <button
                key={item.id}
                type="button"
                className={campaign.id === item.id ? "active" : ""}
                aria-pressed={campaign.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                {item.category}
              </button>
            ))}
          </div>

          <span className="cause-label">YOUR EXAMPLE CONTRIBUTION</span>
          <div
            className="amount-choice"
            role="group"
            aria-label="Choose an example amount"
          >
            {amounts.map((value) => (
              <button
                key={value}
                type="button"
                className={amount === value ? "active" : ""}
                aria-pressed={amount === value}
                onClick={() => setAmount(value)}
              >
                {money(value)}
              </button>
            ))}
          </div>

          <p className="cause-disclaimer">
            This is a preview. Choosing an amount does not record a pledge or
            process a payment.
          </p>
        </div>

        <div className="cause-stage" aria-live="polite" aria-atomic="true">
          <div className="cause-stage-image">
            <img
              key={campaign.id}
              src={campaign.image}
              alt=""
              loading="lazy"
            />
            <span className="cause-stage-index">
              0{featured.findIndex((item) => item.id === campaign.id) + 1} / 0
              {featured.length}
            </span>
            <span className="cause-stage-category">{campaign.category}</span>
          </div>
          <div className="cause-stage-card">
            <span className="cause-stage-kicker">
              <Icon name="shield" size={15} /> {campaign.ngo}
            </span>
            <h3>{campaign.title}</h3>
            <div className="cause-progress-labels">
              <span>
                Now <strong>{currentProgress}%</strong>
              </span>
              <span>
                With {money(amount)} <strong>{previewProgress}%</strong>
              </span>
            </div>
            <div
              className="cause-progress-track"
              role="img"
              aria-label={`Current progress ${currentProgress} percent. An example ${money(amount)} pledge would bring it to ${previewProgress} percent.`}
            >
              <span style={{ width: `${previewProgress}%` }} />
              <i style={{ width: `${currentProgress}%` }} />
            </div>
            <div className="cause-stage-bottom">
              <span>
                Goal <strong>{money(campaign.need)}</strong>
              </span>
              <Link href={`/campaigns/${campaign.id}?amount=${amount}#donate`}>
                Explore this cause <Icon name="diagonal" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
