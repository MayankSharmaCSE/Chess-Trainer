import Link from "next/link";
import { Logo } from "@/components/landing/Navbar";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full rounded-[18px] border border-[#D5DCE4] bg-white p-6 sm:p-8">
      <Logo />
      <h1 className="mt-6 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#56657A]">{subtitle}</p>
      <div className="mt-6">{children}</div>
      <p className="mt-6 text-center text-sm text-[#56657A]">
        <Link href="/#top" className="rounded-[6px] underline underline-offset-2 hover:text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]">
          Back to home
        </Link>
      </p>
    </div>
  );
}
