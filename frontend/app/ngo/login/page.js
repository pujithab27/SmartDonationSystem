import AuthLayout from "../../../components/AuthLayout";
import LoginForm from "../../../components/LoginForm";

export default function NgoLogin() {
  return (
    <AuthLayout
      role="ngo"
      variant="login"
      title="NGO login"
      subtitle="Access your organization account and donation activities."
    >
      <LoginForm role="ngo" />
    </AuthLayout>
  );
}
