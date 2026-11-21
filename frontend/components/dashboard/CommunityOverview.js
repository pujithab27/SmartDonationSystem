"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { Status, Metric } from "../ui";
import { openRequestItems, quantityLabel, requestDonationHref } from "../../lib/itemExchange";
import { categoryIcons, requestProgress } from "../../lib/itemRequests";
import { matchesSearch } from "../../lib/search";


function PanelHeading({ title, description, href, action = "View all" }) {
  return <div className="community-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{href && <Link href={href} className="text-link">{action}<Icon name="arrow" size={15}/></Link>}</div>;
}
function EmptyPanel({ icon = "box", title, children }) {
  return <div className="community-empty"><span className="community-symbol"><Icon name={icon} size={24}/></span><h3>{title}</h3><p>{children}</p></div>;
}

export default function CommunityOverview({ data, role }) {
  const ngo = role === "ngo", base = `/dashboard/${role}`;
  const [activity, setActivity] = useState("All");
  const [needQuery, setNeedQuery] = useState(""), [category, setCategory] = useState("All");
  const matches = data.matches || [], donations = data.itemDonations || [], requests = data.itemRequests || [];
  const pending = matches.filter((entry) => entry.status === "Pending");
  const scheduled = matches.filter((entry) => entry.status === "Pickup scheduled");
  const complete = (entry) => ngo ? requestProgress(entry).complete : entry.status === "Completed";
  const records = ngo ? requests : donations;
  const recent = records.filter((entry) => activity === "All" || (activity === "Completed" ? complete(entry) : !complete(entry) && entry.status !== "Closed")).slice(0, 4);
  const open = requests.filter((entry) => openRequestItems(entry).length > 0);
  const categories = [...new Set(open.flatMap((entry) => openRequestItems(entry).map((item) => item.category)))].sort();
  const needs = open.map((entry) => ({entry, items: openRequestItems(entry).filter((item) => category === "All" || item.category === category)}))
    .filter(({entry, items}) => items.length && matchesSearch(`${entry.title} ${entry.ngoName} ${entry.deliveryCity} ${items.map((item) => item.name).join(" ")}`, needQuery));
  const nextSteps = [
    ...(ngo && scheduled.length ? [{icon:"check", label:`${scheduled.length} pickups scheduled`, detail:"View collection details. Confirm receipt after the items arrive.", href:`${base}/matches`}] : []),
    ...(pending.length ? [{icon:"clock", label:ngo ? `${pending.length} donations accepted` : `${pending.length} pickups to arrange`, detail:ngo ? "Items are reserved. Check donor details and pickup progress." : "Choose a pickup time for your matched items.", href:`${base}/matches`}] : []),
    ...(data.unreadNotifications ? [{icon:"bell", label:`${data.unreadNotifications} unread updates`, detail:"See the latest changes to your donations.", href:`${base}/notifications`}] : []),
  ];
  const steps = ngo
    ? [["List what you need", "Choose items, quantities and a delivery address."], ["Connect with donors", "Review incoming matches and arrange collection."], ["Confirm delivery", "Record received quantities with a proof photo."]]
    : [["Add your item", "Type the details or use a photo or voice."], ["Choose an NGO", "Review matching needs and select a recipient."], ["Arrange pickup", "Set a time and follow the delivery."]];

  return <div className="community-dashboard">
    <section className="overview-start" aria-label={ngo ? "Create an item request" : "Start a donation"}>
      <span className="overview-start-icon"><Icon name={ngo ? "people" : "heart"} size={26}/></span>
      <div><span className="overview-overline">{ngo ? "CONNECT YOUR COMMUNITY" : "A LITTLE GIVING GOES A LONG WAY"}</span><h2>{ngo ? "Get the right items to the people you support." : "Something you share can mean a lot."}</h2><p>{ngo ? "Tell donors what you need. Track each request through to delivery." : "Offer an item, connect with an NGO, and follow its journey."}</p></div>
      <Link className="btn btn-primary" href={`${base}/${ngo ? "create" : "give"}`}><Icon name="plus" size={17}/>{ngo ? "Request items" : "Add donation"}</Link>
    </section>


    <section aria-label={ngo ? "Your request activity" : "Your donation activity"} className="community-stats exchange-metrics">
      <Link href={`${base}/${ngo ? "requests" : "items"}`}><Metric label={ngo ? "Open requests" : "Donations offered"} value={ngo ? open.length : donations.length} detail={ngo ? "Accepting items from donors" : "Your donation history"} icon="box"/></Link>
      <Link href={`${base}/matches`}><Metric label="Awaiting pickup" value={pending.length} detail={ngo ? "New donor connections" : "Ready to schedule"} icon="link"/></Link>
      <Link href={`${base}/matches`}><Metric label="Scheduled pickups" value={scheduled.length} detail="Track the next delivery" icon="clock"/></Link>
      <Link href={`${base}/${ngo ? "requests" : "items"}`}><Metric label={ngo ? "Fulfilled requests" : "Completed donations"} value={records.filter(complete).length} detail={ngo ? "All requested items received" : "Receipt confirmed by the NGO"} icon="check"/></Link>
    </section>

    <div className="community-main-grid">
      <section className="community-panel community-recent">
        <PanelHeading title={ngo ? "Your requests" : "Your donations"} description="Recent activity, with the details that matter." href={`${base}/${ngo ? "requests" : "items"}`}/>
        <div className="overview-tabs" aria-label="Filter recent activity">{["All", "Active", "Completed"].map((value) => <button key={value} type="button" aria-pressed={activity === value} onClick={() => setActivity(value)}>{value}</button>)}</div>
        {recent.length ? <div className="community-records">{recent.map((entry) => {
          const item = ngo ? entry.items[0] : entry;
          const href = ngo ? `${base}/requests?request=${entry.id}` : `${base}/matches?donation=${entry.id}`;
          return <article className="community-record" key={entry.id}>
            <span className="community-item-icon"><Icon name={categoryIcons[item?.category] || "box"} size={21}/></span>
            <div className="community-record-copy"><Link href={href}><strong>{ngo ? entry.title : entry.name}</strong></Link><small>{ngo ? entry.deliveryCity : `${entry.category} · ${quantityLabel(entry.quantity, entry.unit)}`}</small>
              {ngo && <p className="community-received">{entry.items.slice(0, 2).map((line) => `${line.name}: ${quantityLabel(line.fulfilled || 0, line.unit)} of ${quantityLabel(line.quantity, line.unit)} received`).join(" · ")}{entry.items.length > 2 && ` · +${entry.items.length - 2} more item types`}</p>}
            </div>
            <Status value={ngo ? requestProgress(entry).status : entry.status}/><Link className="community-open" href={href} aria-label={`View ${ngo ? entry.title : entry.name}`}><Icon name="arrow" size={17}/></Link>
          </article>;
        })}</div> : <EmptyPanel title={records.length ? "No activity in this view" : ngo ? "Your first request starts here" : "Your first donation starts here"}>{records.length ? "Choose another filter to see your activity." : ngo ? "Use Request items above to share what your NGO needs." : "Use Add donation above to share an item. Its progress will appear here."}</EmptyPanel>}
        <p className="overview-list-note" role="status">{recent.length} {ngo ? "requests" : "donations"} shown · View all for the complete history</p>
      </section>

      <aside className="community-panel community-attention">
        <PanelHeading title="Next steps" description="A clear view of what needs your attention."/>
        {nextSteps.length ? nextSteps.map((step) => <Link className="attention-action" href={step.href} key={step.label}><span className="attention-symbol"><Icon name={step.icon} size={20}/></span><div><strong>{step.label}</strong><small>{step.detail}</small></div><Icon name="arrow" size={15}/></Link>) : <div className="overview-caught-up"><span><Icon name="check" size={21}/></span><strong>You're all caught up</strong><p>New matches and updates will appear here.</p></div>}
        <details className="overview-guide"><summary>How {ngo ? "requests" : "donations"} work<Icon name="plus" size={16}/></summary><ol>{steps.map(([title, detail]) => <li key={title}><strong>{title}</strong><span>{detail}</span></li>)}</ol></details>
      </aside>
    </div>

    {!ngo && <Link className="impact-shortcut" href="/dashboard/donor/impact"><Icon name="heart" size={24}/><div><strong>Every delivery has a story. See yours.</strong><p>Your confirmed deliveries, kindness milestones and appreciation in one place.</p></div><Icon name="arrow" size={20}/></Link>}
    {!ngo && <section className="community-panel community-needs">
      <PanelHeading title="Find a need you can help with" description="Open requests from approved NGOs." href={`${base}/requirements`} action="Browse all needs"/>
      <div className="overview-discovery-tools"><label className="goods-search"><Icon name="search" size={18}/><input type="search" aria-label="Search community needs" placeholder="Search an item, NGO or city" value={needQuery} onChange={(event) => setNeedQuery(event.target.value)}/></label><select aria-label="Community need category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></div>
      {needs.length ? <div className="community-needs-grid">{needs.slice(0, 3).map(({entry, items}) => {
        const item = items[0];
        return <article className="community-need-row" key={entry.id}>
          <span className="community-item-icon"><Icon name={categoryIcons[item.category] || "box"} size={22}/></span>
          <div className="need-row-copy"><h3>{entry.title}</h3><p>{entry.ngoName}<span>·</span><Icon name="pin" size={13}/>{entry.deliveryCity}</p>{entry.priority === "High" && <span className="need-priority">High priority</span>}</div>
          <div className="need-row-quantity"><strong>{quantityLabel(item.remaining ?? item.quantity, item.unit)}</strong><span>{item.name} needed</span></div>
          <Link className="btn btn-outline btn-small" href={requestDonationHref(entry.id, item.itemId)} aria-label={`Donate ${item.name} to ${entry.ngoName}`}>Donate item<Icon name="arrow" size={15}/></Link>
        </article>;
      })}</div> : <EmptyPanel icon="search" title={open.length ? "No needs match your search" : "New requests will appear here"}>{open.length ? "Try a different item, location or category." : "You can still offer a donation using the button at the top."}</EmptyPanel>}
    </section>}
  </div>;
}
