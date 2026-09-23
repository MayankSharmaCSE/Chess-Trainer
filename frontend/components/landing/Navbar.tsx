"use client";

import { useState } from "react";
import { BRAND, LOGIN_URL, SIGNUP_URL } from "./data";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#weaknesses", label: "Weakness map" },
  { href: "#progress", label: "Progress" },
  { href: "#faq", label: "FAQ" },
];

export function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2 rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#13233A]">
      <span className="grid h-7 w-7 grid-cols-2 grid-rows-2 overflow-hidden rounded-[6px]" aria-hidden="true">
        <span className="bg-[#13233A]" /><span className="bg-[#E9ECE4]" /><span className="bg-[#E9ECE4]" /><span className="bg-[#C8372D]" />
      </span>
      <span className="font-display text-[17px] font-extrabold tracking-tight text-[#13233A]" style={{ fontStretch: "112%" }}>{BRAND}</span>
    </a>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-[#D5DCE4]/80 bg-[#F2F4F6]/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-[15px] text-[#3B4B62] hover:text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#13233A]">{l.label}</a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <a href={LOGIN_URL} className="rounded-[10px] px-3 py-2 text-[15px] font-semibold text-[#13233A] hover:bg-[#E4E9EF]">Log in</a>
          <a href={SIGNUP_URL} className="rounded-[10px] bg-[#13233A] px-4 py-2 text-[15px] font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A]">Analyze my games</a>
        </div>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#D5DCE4] md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          <span className="relative block h-3 w-4" aria-hidden="true">
            <span className={`absolute left-0 h-[2px] w-4 bg-[#13233A] transition ${open ? "top-[5px] rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 top-[5px] h-[2px] w-4 bg-[#13233A] ${open ? "opacity-0" : ""}`} />
            <span className={`absolute left-0 h-[2px] w-4 bg-[#13233A] transition ${open ? "top-[5px] -rotate-45" : "top-[10px]"}`} />
          </span>
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-[#D5DCE4] px-5 pb-5 md:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block py-3 text-[16px] text-[#13233A]">{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <a href={LOGIN_URL} className="flex-1 rounded-[10px] border border-[#D5DCE4] py-2.5 text-center font-semibold text-[#13233A]">Log in</a>
            <a href={SIGNUP_URL} className="flex-1 rounded-[10px] bg-[#13233A] py-2.5 text-center font-semibold text-white">Analyze my games</a>
          </div>
        </div>
      )}
    </header>
  );
}
