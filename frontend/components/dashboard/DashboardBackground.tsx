"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "chesslens.dashboard.motion";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// Motion preference as an external store: stored choice wins, otherwise the
// OS reduced-motion setting. `sessionChoice` keeps the toggle working when
// localStorage is unavailable (private mode), for the life of the page.
let sessionChoice: boolean | null = null;
const motionListeners = new Set<() => void>();

function readMotionPref(): boolean {
  if (sessionChoice !== null) return sessionChoice;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "on" || stored === "off") return stored === "on";
  } catch {
    /* Storage blocked: fall through to the OS setting. */
  }
  return !window.matchMedia(REDUCED_MOTION).matches;
}

function writeMotionPref(on: boolean) {
  sessionChoice = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* Private mode: preference simply won't persist past this page. */
  }
  motionListeners.forEach((cb) => cb());
}

function subscribeMotionPref(cb: () => void) {
  motionListeners.add(cb);
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb);
  return () => {
    motionListeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

/** Played in order, back to the first after the last: A -> B -> A -> ... */
const VIDEOS = ["/videos/dashboard-background.mp4", "/videos/dashboard-background-2.mp4"];

/** Cross-fade between clips; long enough to hide the cut, short enough to feel continuous. */
const FADE_MS = 400;

/**
 * Full-viewport ambient video background for the dashboard.
 * - Plays VIDEOS back to back in a loop, muted. Each clip is its own <video>,
 *   stacked: the next one is already buffered underneath, so when the current
 *   clip ends the next starts instantly and fades in (no black frame / reload).
 * - Honors prefers-reduced-motion and a persisted user toggle.
 * - Pauses while the tab is hidden. A clip that fails to load is skipped; if
 *   every clip fails, a static gradient is shown instead.
 */
export default function DashboardBackground() {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [failed, setFailed] = useState<boolean[]>(() => VIDEOS.map(() => false));
  // Kept in sync by onError (the only writer), so callbacks see it immediately.
  const failedRef = useRef(failed);
  // Hold off buffering the other clips until the first one is playing, so
  // they don't compete for bandwidth with what the user sees first.
  const [warm, setWarm] = useState(false);
  // Server render assumes motion on; the client snapshot corrects it on hydration.
  const motionOn = useSyncExternalStore(subscribeMotionPref, readMotionPref, () => true);
  const motionOnRef = useRef(motionOn);
  const rewindTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allFailed = failed.every(Boolean);

  const play = useCallback((video: HTMLVideoElement | null | undefined) => {
    video?.play().catch(() => {
      /* Autoplay can be blocked; the frozen frame still renders. */
    });
  }, []);

  /** Next index after `from` whose clip hasn't failed, or -1 if none. */
  const nextPlayable = useCallback((from: number, failedNow: boolean[]) => {
    for (let step = 1; step <= VIDEOS.length; step++) {
      const i = (from + step) % VIDEOS.length;
      if (!failedNow[i]) return i;
    }
    return -1;
  }, []);

  /** Make clip `i` the visible one and (if motion is on) start it from the top. */
  const switchTo = useCallback(
    (i: number) => {
      const prev = activeRef.current;
      activeRef.current = i;
      setActive(i);
      const video = videoRefs.current[i];
      if (!video) return;
      if (i !== prev) video.currentTime = 0;
      if (motionOnRef.current && !document.hidden) play(video);
      // Rewind the clip we just left once it has faded out, so it is parked on
      // its first frame (ready to cut back to) instead of its last.
      if (i !== prev) {
        if (rewindTimer.current) clearTimeout(rewindTimer.current);
        rewindTimer.current = setTimeout(() => {
          const old = videoRefs.current[prev];
          if (old && activeRef.current !== prev) {
            old.pause();
            old.currentTime = 0;
          }
        }, FADE_MS + 50);
      }
    },
    [play]
  );

  const onEnded = useCallback(
    (i: number) => {
      if (i !== activeRef.current) return;
      const next = nextPlayable(i, failedRef.current);
      // Only one usable clip left: switchTo(i) restarts it, i.e. a plain loop.
      switchTo(next === -1 ? i : next);
    },
    [nextPlayable, switchTo]
  );

  const onError = useCallback(
    (i: number) => {
      const failedNow = failedRef.current.map((f, j) => f || j === i);
      failedRef.current = failedNow;
      setFailed(failedNow);
      if (i === activeRef.current) {
        const next = nextPlayable(i, failedNow);
        if (next !== -1) switchTo(next);
      }
    },
    [nextPlayable, switchTo]
  );

  const applyPlayback = useCallback(
    (on: boolean) => {
      const video = videoRefs.current[activeRef.current];
      if (!video) return;
      if (on) play(video);
      else video.pause();
    },
    [play]
  );

  // Apply the preference whenever it changes (mount, toggle, OS setting, other tab).
  useEffect(() => {
    motionOnRef.current = motionOn;
    applyPlayback(motionOn);
  }, [motionOn, applyPlayback]);

  // Save CPU while the tab is hidden; resume only if motion is enabled.
  useEffect(() => {
    function onVisibility() {
      const video = videoRefs.current[activeRef.current];
      if (!video) return;
      if (document.hidden) {
        video.pause();
      } else if (motionOnRef.current) {
        play(video);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [play]);

  useEffect(
    () => () => {
      if (rewindTimer.current) clearTimeout(rewindTimer.current);
    },
    []
  );

  const toggle = useCallback(() => {
    writeMotionPref(!motionOnRef.current);
  }, []);

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {allFailed ? (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#DCE4EC_0%,#C9D6E2_38%,#B9C9D6_62%,#CBD8D2_100%)]" />
        ) : (
          VIDEOS.map((src, i) =>
            failed[i] ? null : (
              <video
                key={src}
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                className="absolute inset-0 h-full w-full object-cover transition-opacity ease-linear"
                style={{
                  opacity: i === active ? 1 : 0,
                  transitionDuration: `${FADE_MS}ms`,
                  zIndex: i === active ? 1 : 0,
                }}
                src={src}
                muted
                playsInline
                preload={i === 0 || warm ? "auto" : "none"}
                disablePictureInPicture
                tabIndex={-1}
                onPlaying={i === 0 ? () => setWarm(true) : undefined}
                onEnded={() => onEnded(i)}
                onError={() => onError(i)}
              />
            )
          )
        )}
        {/* Readability veil: stronger at the header/footer, lighter mid-page. */}
        <div className="absolute inset-0 z-[2] bg-gradient-to-b from-[#F2F4F6]/70 via-[#F2F4F6]/30 to-[#F2F4F6]/65" />
        {/* Soft vignette to seat the content column. */}
        <div className="absolute inset-0 z-[2] bg-[radial-gradient(120%_90%_at_50%_40%,transparent_60%,rgba(19,35,58,0.10)_100%)]" />
      </div>

      {!allFailed && (
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
