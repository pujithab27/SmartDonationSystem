import Link from "next/link";
import Icon from "./Icon";
import { money, percent } from "../lib/data";
import { Progress, EmptyState } from "./ui";

export default function CampaignLedger({ campaigns }) {
  if (!campaigns.length) return <EmptyState title="New possibilities are on the way">Approved campaigns will appear here.</EmptyState>;
  return <div className="campaign-ledger">{campaigns.map((campaign, index) => <article key={campaign.id} className="campaign-ledger-row">
    <span className="ledger-index">{String(index + 1).padStart(2, "0")}</span>
    <Link className="ledger-image" href={`/campaigns/${campaign.id}`} tabIndex={-1} aria-hidden="true"><img src={campaign.image || "/images/community.jpg"} alt="" loading="lazy" width="200" height="160" /></Link>
    <div className="ledger-description"><span className="mono-label">{campaign.category} / {campaign.location}</span><h3><Link href={`/campaigns/${campaign.id}`}>{campaign.title}</Link></h3><span className="ledger-org"><Icon name="shield" size={14} />{campaign.ngo}</span></div>
    <div className="ledger-funding"><span><strong>{money(campaign.raised)}</strong> of {money(campaign.need)}</span><Progress campaign={campaign} /><small>{percent(campaign)}% of the campaign goal</small></div>
    <Link className="ledger-open" href={`/campaigns/${campaign.id}`} aria-label={`Explore ${campaign.title}`}><Icon name="diagonal" size={24} /></Link>
  </article>)}</div>;
}
