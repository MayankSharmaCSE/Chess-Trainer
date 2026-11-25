import AuthCard from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = {
  title: "Forgot password — ChessLens",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle={<>Enter the email or username you signed up with.</>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
