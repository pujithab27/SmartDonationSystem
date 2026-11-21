import AuthLayout from "../../../components/AuthLayout";
import DonorSignupForm from "../../../components/DonorSignupForm";

export default function DonorSignup() {
  return (
    <AuthLayout
      role="donor"
      title="Create donor account"
      subtitle="Enter your details to start supporting meaningful causes."
    >
      <DonorSignupForm />
    </AuthLayout>
  );
}
