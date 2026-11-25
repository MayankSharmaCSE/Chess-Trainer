import type { ReactNode } from "react";
import ProfileShell from "@/components/profile/ProfileShell";

export const metadata = {
  title: "Player profile — ChessLens",
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <ProfileShell>{children}</ProfileShell>;
}
