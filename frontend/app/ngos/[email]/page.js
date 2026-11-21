import PublicLayout from "../../../components/PublicLayout";
import NgoDetails from "../../../components/NgoDetails";
export default async function Ngo({ params }) {
  const { email } = await params;
  return (
    <PublicLayout>
      <NgoDetails email={email} />
    </PublicLayout>
  );
}
