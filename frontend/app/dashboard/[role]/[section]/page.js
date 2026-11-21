import { redirect } from "next/navigation";
import DashboardShell from "../../../../components/dashboard/DashboardShell";
import { retiredWorkspaceDestination } from "../../../../lib/workspaceRoutes";
export default async function WorkspacePage({ params, searchParams }) {
  const { role, section } = await params;
  const destination = retiredWorkspaceDestination(role, section, await searchParams);
  if (destination) redirect(destination);
  return <DashboardShell role={role} section={section} />;
}
