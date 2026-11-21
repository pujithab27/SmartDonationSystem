import PublicLayout from "../../../components/PublicLayout";
import DonationReceipt from "../../../components/DonationReceipt";
export default async function Receipt({ params }) {
  const { id } = await params;
  return (
    <PublicLayout>
      <DonationReceipt id={id} />
    </PublicLayout>
  );
}
