import AuthLayout from "../../../components/AuthLayout";
import LoginForm from "../../../components/LoginForm";

export default function DonorLogin() {
  return (
    <AuthLayout
      role="donor"
      variant="login"
      title="Welcome back"
      subtitle="Login to continue to your donor account."
    >
      <LoginForm role="donor" />
    </AuthLayout>
  );
}
