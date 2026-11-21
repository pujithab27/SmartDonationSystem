import PublicLayout from "../../components/PublicLayout";
import NgoDirectory from "../../components/NgoDirectory";
export const metadata = { title: "Our NGO community" };
export default function Ngos() {
  return (
    <PublicLayout>
      <div className="container section">
        <NgoDirectory standalone />
      </div>
    </PublicLayout>
  );
}
