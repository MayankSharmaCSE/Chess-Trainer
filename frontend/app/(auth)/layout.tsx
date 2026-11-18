import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in or sign up — ChessLens",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto grid min-h-screen w-full max-w-[480px] place-items-center px-5 py-12">
        {children}
      </main>
    </div>
  );
}
