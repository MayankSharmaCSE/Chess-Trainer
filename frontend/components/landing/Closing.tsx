import { Logo } from "./Navbar";
import { SIGNUP_URL } from "./data";

export function FinalCta() {
  return (
    <section className="bg-[#13233A]">
      <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-8 px-5 py-24 md:flex-row md:items-end md:justify-between">
        <p className="max-w-[16ch] font-display text-[clamp(2.2rem,5vw,4rem)] font-extrabold leading-[0.98] tracking-[-0.02em] text-white" style={{ fontStretch: "125%" }}>
          Your games already contain your training plan.
        </p>
        <a href={SIGNUP_URL} className="shrink-0 rounded-[10px] bg-white px-6 py-3.5 text-[16px] font-semibold text-[#13233A] hover:bg-[#E4E9EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Analyze my games
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  const links = ["About", "Privacy", "Terms", "GitHub", "Contact"];
  return (
    <footer className="bg-[#F2F4F6]">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <Logo />
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map((l) => (
            <li key={l}><a href="#" className="text-sm text-[#3B4B62] hover:text-[#13233A]">{l}</a></li>
          ))}
        </ul>
        <p className="text-sm text-[#56657A]">Not affiliated with Chess.com or Lichess.</p>
      </div>
    </footer>
  );
}
