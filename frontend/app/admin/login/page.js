import AuthLayout from "../../../components/AuthLayout";
import LoginForm from "../../../components/LoginForm";

export default function AdminLogin() {
  return (
    <AuthLayout
      role="admin"
      title="Administrator login"
      subtitle="Authorized administrators only."
    >
      <LoginForm role="admin" />
    </AuthLayout>
  );
}
