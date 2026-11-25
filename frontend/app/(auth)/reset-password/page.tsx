import AuthCard from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = {
  title: "Set a new password — ChessLens",
  // The URL carries a one-time token: never send it to other sites.
  referrer: "no-referrer" as const,
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  return (
    <AuthCard title="Set a new password" subtitle={<>Choose a new password for your ChessLens account.</>}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
