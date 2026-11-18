import { Suspense } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthForm from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle={<>Log in to sync your games and continue training.</>}
    >
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthCard>
  );
}
