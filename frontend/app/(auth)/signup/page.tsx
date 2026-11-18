import { Suspense } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthForm from "@/components/auth/AuthForm";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle={<>Free to start. Only a username and email are needed — no Chess.com password, ever.</>}
    >
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthCard>
  );
}
