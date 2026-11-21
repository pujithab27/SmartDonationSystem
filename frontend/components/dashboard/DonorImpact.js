"use client";
import Link from "next/link";
import Icon from "../Icon";
import { EmptyState, Metric } from "../ui";
import { donorImpact } from "../../lib/impact";
import { quantityLabel } from "../../lib/itemExchange";

export default function DonorImpact({ data, session }) {
  const impact = donorImpact(data.matches);
  const count = impact.completed.length;
  const milestones = [[1, "First ripple", "Your first confirmed delivery."], [5, "Kindness in motion", "Five deliveries received by NGOs."], [10, "Community champion", "Ten confirmed acts of giving."]];
  const next = milestones.find(([target]) => count < target);
  return <div className="impact-workspace">
    <section className="impact-thanks"><span className="impact-heart"><Icon name="heart" size={34}/></span><div><span className="eyebrow">YOUR KINDNESS, MADE VISIBLE</span><h2>{count ? `Thank you, ${session.name.split(" ")[0]}. Your giving has arrived.` : "Every act of giving starts with you."}</h2><p>{count ? `${count} ${count === 1 ? "delivery has" : "deliveries have"} been confirmed by receiving NGOs. Thank you for turning useful items into practical support.` : "Thank you for being part of this community. Your first confirmed delivery will begin your impact story here."}</p><Link className="btn btn-primary" href="/dashboard/donor/requirements">Find your next act of kindness <Icon name="arrow" size={16}/></Link></div></section>
    <div className="exchange-metrics"><Metric label="Confirmed deliveries" value={count} icon="check"/><Metric label="NGOs supported" value={impact.organizations} icon="building"/><Metric label="On the way" value={impact.inProgress} icon="box"/></div>
    <section className="exchange-panel"><h2>Your kindness milestones</h2><p>Earned through NGO-confirmed deliveries.</p><div className="impact-milestones">{milestones.map(([target, title, detail]) => <article key={target} className={count >= target ? "earned" : ""}><Icon name={count >= target ? "check" : "heart"} size={24}/><h3>{title}</h3><p>{detail}</p><strong>{count >= target ? "Earned" : `${Math.min(count, target)} / ${target} deliveries`}</strong></article>)}</div>{next && <p>{next[0] - count} more confirmed {next[0] - count === 1 ? "delivery" : "deliveries"} to reach “{next[1]}”.</p>}</section>
    <section className="exchange-panel"><h2>What your giving delivered</h2>{impact.quantities.length ? <div className="impact-totals">{impact.quantities.map((item) => <div key={`${item.name}:${item.unit}`}><strong>{quantityLabel(item.quantity, item.unit)}</strong><span>{item.name}</span></div>)}</div> : <p>Received quantities will appear after an NGO confirms delivery.</p>}<p className="impact-footnote">Based on confirmed receipts. Different items and units are counted separately.</p></section>
    <section className="exchange-panel"><h2>Your giving story</h2>{count ? <div className="impact-story">{impact.completed.map((match) => <article key={match.id}><span className="impact-story-mark"><Icon name="check" size={18}/></span><div><small>{new Date(match.completedAt || match.createdAt).toLocaleDateString("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric"})}</small><h3>{quantityLabel(match.quantity, match.unit)} of {match.name} received</h3><p>{match.ngoName} confirmed this delivery. Thank you for following through.</p>{match.deliveryNote && <blockquote><strong>Receipt note from the NGO</strong><p>{match.deliveryNote}</p></blockquote>}<Link className="text-link" href={`/dashboard/donor/matches?match=${match.id}`}>View receipt & journey <Icon name="arrow" size={14}/></Link></div></article>)}</div> : <EmptyState title="Your story is just beginning">Offer an item, connect with an NGO, and arrange pickup. Once the NGO confirms receipt, your delivery will appear here.</EmptyState>}</section>
  </div>;
}
