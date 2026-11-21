"use client";
import Matches from "./Matches";
import AvailableDonations from "./AvailableDonations";
import { NotificationList } from "./Notifications";
import NgoRequests from "./NgoRequests";
import ProfilePanel from "./ProfilePanel";
import { ExchangeOverview } from "./ItemDonationViews";

export default function NgoWorkspace({ section, data, session }) {
  if (section === "available") return <AvailableDonations data={data} session={session} />;
  const ngo = data.ngos.find((entry) => entry.email === session.email);
  if (section === "matches") return <Matches data={data} session={session} />;
  if (section === "notifications") return <section className="exchange-panel"><NotificationList data={data} /></section>;
  if (section === "profile") return <ProfilePanel data={data} session={session} />;
  if (section === "create" || section === "requests") return <NgoRequests key={section} mode={section} data={data} session={session} ngo={ngo} />;
  return <ExchangeOverview data={data} role="ngo"/>;
}
