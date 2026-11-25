"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "chesslens.dashboard.motion";

/**
 * Full-viewport ambient video background for the dashboard.
 * - Autoplays muted/looped; a light veil keeps the light theme readable.
 * - Honors prefers-reduced-motion and a persisted user toggle.
 * - Pauses while the tab is hidden; falls back to a static gradient on error.
 */
export default function DashboardBackground() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [motionOn, setMotionOn] = useState(true);
  const [failed, setFailed] = useState(false);
  const motionOnRef = useRef(motionOn);
  motionOnRef.current = motionOn;

  const applyPlayback = useCallback((on: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    if (on) {
      video.play().catch(() => {
        /* Autoplay can be blocked; the frozen first frame still renders. */
      });
    } else {
      video.pause();
    }
  }, []);

  // Sync preference once on mount: stored choice wins, otherwise reduced motion.
  useEffect(() => {
    let enabled = true;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "on" || stored === "off") {
        enabled = stored === "on";
      } else {
        enabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
    } catch {
      enabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    motionOnRef.current = enabled;
    setMotionOn(enabled);
    applyPlayback(enabled);
  }, [applyPlayback]);

  // Save CPU while the tab is hidden; resume only if motion is enabled.
  useEffect(() => {
    function onVisibility() {
      const video = videoRef.current;
      if (!video || failed) return;
      if (document.hidden) {
        video.pause();
      } else if (motionOnRef.current) {
        video.play().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [failed]);

  const toggle = useCallback(() => {
    const next = !motionOnRef.current;
    motionOnRef.current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* Private mode: preference simply won't persist. */
    }
    setMotionOn(next);
    applyPlayback(next);
  }, [applyPlayback]);

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {failed ? (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#DCE4EC_0%,#C9D6E2_38%,#B9C9D6_62%,#CBD8D2_100%)]" />
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src="/videos/dashboard-background.mp4"
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
            onError={() => setFailed(true)}
          />
        )}
        {/* Readability veil: stronger at the header/footer, lighter mid-page. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#F2F4F6]/70 via-[#F2F4F6]/30 to-[#F2F4F6]/65" />
        {/* Soft vignette to seat the content column. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_60%,rgba(19,35,58,0.10)_100%)]" />
      </div>

      {!failed && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={motionOn}
          title={motionOn ? "Pause background animation" : "Play background animation"}
          className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#13233A]/15 bg-white/85 px-3.5 py-2 text-xs font-semibold text-[#13233A] shadow-[0_6px_24px_rgba(19,35,58,0.18)] backdrop-blur-md transition hover:border-[#13233A]/40 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A]"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${motionOn ? "bg-emerald-500 animate-pulse" : "bg-[#8B97A8]"}`}
          />
          {motionOn ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="1.5" y="1" width="3.2" height="10" rx="1" />
              <rect x="7.3" y="1" width="3.2" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M2.5 1.3a1 1 0 0 1 1.52-.86l7 4.7a1 1 0 0 1 0 1.72l-7 4.7a1 1 0 0 1-1.52-.86z" />
            </svg>
          )}
          <span>{motionOn ? "Motion on" : "Motion off"}</span>
        </button>
      )}
    </>
  );
}