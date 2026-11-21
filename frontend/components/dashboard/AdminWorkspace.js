"use client";
import { useState } from "react";
import AdminAccountDetails from "./AdminAccountDetails";
import AdminAccessPortal from "./AdminAccessPortal";
import SettingsPanel from "./SettingsPanel";
import AdminCommunityActivity from "./AdminCommunityActivity";
import AdminTracking from "./AdminTracking";
import AdminDirectory from "./AdminDirectory";

export default function AdminWorkspace({ section, data, session }) {
  const [accountId, setAccountId] = useState(null);
  const account = data.users.find((user) => user.id === accountId);
  if (account) return <AdminAccountDetails key={account.id} account={account} data={data} onBack={() => setAccountId(null)}/>;
  if (section === "settings") return <SettingsPanel session={session} data={data} />;
  if (["donors", "ngos"].includes(section)) return <AdminDirectory key={section} data={data} role={section === "ngos" ? "ngo" : "donor"} onOpenAccount={setAccountId}/>;
  if (["donations", "requests", "tracking"].includes(section)) return <AdminTracking data={data} mode={section}/>;
  return <>
    {section === "overview" && <AdminTracking data={data}/>}
    <AdminAccessPortal key={section} data={data} section={section} onOpenAccount={setAccountId}/>

    {section === "overview" && <AdminCommunityActivity data={data} session={session}/>}
  </>;
}
