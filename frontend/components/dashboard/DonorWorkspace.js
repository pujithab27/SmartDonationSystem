"use client";
import ProfilePanel from "./ProfilePanel";
import ItemDonationForm from "./ItemDonationForm";
import Matches from "./Matches";
import { ItemDonationHistory, BrowseRequirements } from "./ItemDonationViews";
import { NotificationList } from "./Notifications";
import DonorImpact from "./DonorImpact";
import DonorOverview from "./DonorOverview";
import { useSearchParams } from "next/navigation";

export default function DonorWorkspace({ section, data, session }) {
  const params = useSearchParams();
  if (section === "impact") return <DonorImpact data={data} session={session}/>;
  if (section === "give") return <ItemDonationForm key={params.get("edit") || "new"} data={data} session={session} />;
  if (section === "matches") return <Matches data={data} session={session} />;
  if (section === "requirements") return <BrowseRequirements data={data} />;
  if (section === "items") return <ItemDonationHistory data={data} />;
  if (section === "notifications") return <section className="exchange-panel"><NotificationList data={data} /></section>;
  if (section === "profile") return <ProfilePanel session={session} data={data} />;
  return <DonorOverview data={data} session={session} />;
}
