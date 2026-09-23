"use client";

import { useEffect, useRef, useState } from "react";

// Put the Google Flow clips in /public with these names.
// Until they exist, the band shows a quiet board pattern instead.
const VIDEO = "/hero-loop.mp4";
const VIDEO_VERTICAL = "/hero-loop-vertical.mp4";
const POSTER = "/hero-poster.jpg";

export default function FilmBand() {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoOk, setVideoOk] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-[#13233A]" aria-label="Every game leaves evidence">
      <div
        className="absolute inset-0 -z-10 opacity-[0.07]"
        aria-hidden="true"
        style={{ backgroundImage: "repeating-conic-gradient(#fff 0 25%, transparent 0 50%)", backgroundSize: "88px 88px" }}
      />
      {videoOk && (
        <video
          ref={ref}
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60"
          autoPlay={!reduce}
          muted
          loop
          playsInline
          preload="none"
          poster={POSTER}
          aria-hidden="true"
          onError={() => setVideoOk(false)}
        >
          <source src={VIDEO_VERTICAL} media="(max-width: 767px)" type="video/mp4" />
          <source src={VIDEO} type="video/mp4" onError={() => setVideoOk(false)} />
        </video>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#13233A] via-[#13233A]/80 to-transparent" aria-hidden="true" />
      <div className="mx-auto flex min-h-[340px] max-w-[1180px] items-center px-5 py-20">
        <p className="max-w-[18ch] font-display text-[clamp(2rem,4.4vw,3.4rem)] font-extrabold leading-[1.02] text-white" style={{ fontStretch: "125%" }}>
          Every game you play leaves evidence.
        </p>
      </div>
    </section>
  );
}
