import DashboardShell from "../../../components/dashboard/DashboardShell";
export default async function Dashboard({ params }) {
  const { role } = await params;
  return <DashboardShell role={role} />;
}
