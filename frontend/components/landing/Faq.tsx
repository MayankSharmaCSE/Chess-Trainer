import { FAQ } from "./data";

export default function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-[820px] px-5 py-24">
      <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
        Questions
      </h2>
      <div className="mt-8 divide-y divide-[#D5DCE4] border-y border-[#D5DCE4]">
        {FAQ.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[6px] py-4 text-[17px] font-semibold text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-xl text-[#56657A] transition-transform group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true">+</span>
            </summary>
            <p className="max-w-[62ch] pb-5 text-[16px] leading-relaxed text-[#3B4B62]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
