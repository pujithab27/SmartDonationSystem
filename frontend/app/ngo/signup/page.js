import AuthLayout from "../../../components/AuthLayout";
import NgoSignupForm from "../../../components/NgoSignupForm";

export default function NgoSignup() {
  return (
    <AuthLayout
      role="ngo"
      title="Register your NGO"
      subtitle="Create an organization account for verification and donor access."
    >
      <NgoSignupForm />
    </AuthLayout>
  );
}
