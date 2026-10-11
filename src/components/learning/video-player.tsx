"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import {
  Loader2Icon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { formatClock } from "@/lib/media-format";
import { cn } from "@/lib/utils";
import { usePlayerRegistry } from "./player-context";

type Playback = {
  type: "hls" | "file";
  src: string;
  mimeType?: string;
  posterUrl?: string;
  expiresAt: string;
  watermark: string;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const HEARTBEAT_MS = 15_000;
const CONTROLS_HIDE_MS = 2_500;

function playedRanges(video: HTMLVideoElement): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < video.played.length; index += 1) {
    ranges.push([video.played.start(index), video.played.end(index)]);
  }
  return ranges.slice(-200);
}

function bufferedEnd(video: HTMLVideoElement): number {
  for (let index = video.buffered.length - 1; index >= 0; index -= 1) {
    if (video.buffered.start(index) <= video.currentTime) return video.buffered.end(index);
  }
  return 0;
}

/**
 * Lesson video player. Plays a short-lived, viewer-bound source (HLS through
 * hls.js or native HLS; a direct file with the development provider), shows a
 * drifting watermark that stays visible in full screen, reports progress, and
 * resumes where the student stopped. Controls stay left-to-right (media
 * convention) in every language.
 */
export function VideoPlayer({
  lessonId,
  startAt,
  tracked,
  initiallyCompleted,
  nextHref,
  labels,
  unavailableLabel,
  completedToast,
}: {
  lessonId: string;
  startAt: number;
  tracked: boolean;
  initiallyCompleted: boolean;
  nextHref: string | null;
  labels: Dictionary["student"]["lesson"]["player"];
  unavailableLabel: string;
  completedToast: string;
}) {
  const router = useRouter();
  const registry = usePlayerRegistry();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const lastBeatRef = useRef(0);
  const completedRef = useRef(initiallyCompleted);
  const resumeRef = useRef<number>(startAt);
  const refreshesRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playback, setPlayback] = useState<Playback | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mark, setMark] = useState({ top: 10, left: 6 });

  const [sourceVersion, setSourceVersion] = useState(0);
  /** Fetches a fresh signed source (retry, or token expiry during playback). */
  const reloadSource = useCallback(() => setSourceVersion((version) => version + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<Playback>(`/api/v1/lessons/${lessonId}/playback`).then(
      (source) => {
        if (cancelled) return;
        setFailed(false);
        setPlayback(source);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lessonId, sourceVersion]);

  // Attach the source to the <video> element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    let cancelled = false;
    const attachNative = () => {
      video.src = playback.src;
    };
    if (playback.type === "file") {
      attachNative();
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) attachNative();
          else setFailed(true);
          return;
        }
        const hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          const code = data.response?.code;
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            (code === 401 || code === 403 || code === 410) &&
            refreshesRef.current < 2
          ) {
            // Token expired: fetch a fresh one and continue from here.
            refreshesRef.current += 1;
            resumeRef.current = video.currentTime;
            reloadSource();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setFailed(true);
          }
        });
        hls.loadSource(playback.src);
        hls.attachMedia(video);
      });
    }
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [playback, reloadSource]);

  const sendHeartbeat = useCallback(
    (keepalive = false) => {
      const video = videoRef.current;
      if (!tracked || !video || !Number.isFinite(video.duration) || video.played.length === 0) {
        return;
      }
      lastBeatRef.current = Date.now();
      void fetch(`/api/v1/lessons/${lessonId}/progress`, {
        method: "POST",
        keepalive,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSeconds: video.currentTime,
          playedRanges: playedRanges(video),
        }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { data?: { completed?: boolean } } | null) => {
          if (payload?.data?.completed && !completedRef.current) {
            completedRef.current = true;
            toast.success(completedToast);
            router.refresh();
          }
        })
        .catch(() => {});
    },
    [completedToast, lessonId, router, tracked],
  );

  const heartbeatRef = useRef(sendHeartbeat);
  useEffect(() => {
    heartbeatRef.current = sendHeartbeat;
  }, [sendHeartbeat]);

  // Flush progress when the tab is hidden, closed, or the player unmounts.
  useEffect(() => {
    const flush = () => heartbeatRef.current(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // Notes panel integration.
  useEffect(() => {
    registry?.register({
      getTime: () => (videoRef.current ? videoRef.current.currentTime : null),
      seek: (seconds) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = seconds;
        void video.play().catch(() => {});
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    });
    return () => registry?.register(null);
  }, [registry]);

  // Drifting watermark: harder to crop out of a screen recording.
  useEffect(() => {
    const timer = setInterval(() => {
      setMark({ top: 6 + Math.random() * 74, left: 4 + Math.random() * 62 });
    }, 20_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  function revealControls() {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play().catch(() => {});
    else video.pause();
  }

  function seekBy(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || 0);
    revealControls();
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    // Full screen on the container (not the <video>) keeps the watermark visible.
    if (document.fullscreenEnabled && container.requestFullscreen) {
      void container.requestFullscreen().catch(() => setPseudoFullscreen(true));
    } else {
      setPseudoFullscreen(true);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
      if (event.key !== "f" && event.key !== "m") return;
    }
    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowRight":
        event.preventDefault();
        seekBy(10);
        break;
      case "ArrowLeft":
        event.preventDefault();
        seekBy(-10);
        break;
      case "m":
        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
        break;
      case "f":
        toggleFullscreen();
        break;
      case "Escape":
        if (pseudoFullscreen) setPseudoFullscreen(false);
        break;
    }
  }

  const playedPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const showControls = controlsVisible || !playing || ended;
  const isFullscreen = fullscreen || pseudoFullscreen;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      dir="ltr"
      onKeyDown={onKeyDown}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={revealControls}
      onContextMenu={(event) => event.preventDefault()}
      data-testid="lesson-player"
      className={cn(
        "group relative overflow-hidden bg-black outline-none select-none",
        "focus-visible:ring-gold/60 focus-visible:ring-[3px]",
        pseudoFullscreen
          ? "fixed inset-0 z-[100] flex items-center"
          : "shadow-lifted aspect-video w-full rounded-2xl",
        fullscreen && "flex items-center",
      )}
    >
      <video
        ref={videoRef}
        className="size-full bg-black object-contain"
        poster={playback?.posterUrl}
        playsInline
        preload="metadata"
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          sendHeartbeat();
        }}
        onEnded={() => {
          setEnded(true);
          setPlaying(false);
          sendHeartbeat();
        }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => setWaiting(false)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          const target = resumeRef.current;
          if (target > 0 && target < video.duration - 5) {
            video.currentTime = target;
            if (refreshesRef.current === 0) setResumedFrom(target);
            else void video.play().catch(() => {});
          }
          resumeRef.current = 0;
          setWaiting(false);
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          setCurrent(video.currentTime);
          setBuffered(bufferedEnd(video));
          if (!video.paused && Date.now() - lastBeatRef.current >= HEARTBEAT_MS) sendHeartbeat();
        }}
        onProgress={(event) => setBuffered(bufferedEnd(event.currentTarget))}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onError={() => {
          if (playback?.type === "file") setFailed(true);
        }}
      />

      {playback ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-[70%] truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white/45 transition-all duration-[1500ms] [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] sm:text-xs"
          style={{ top: `${mark.top}%`, left: `${mark.left}%` }}
          data-testid="player-watermark"
        >
          {playback.watermark}
        </span>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center text-white">
          <div className="grid justify-items-center gap-3">
            <p className="max-w-sm text-sm text-white/85" dir="auto">
              {unavailableLabel}
            </p>
            <button
              type="button"
              onClick={() => {
                refreshesRef.current = 0;
                reloadSource();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
            >
              <RefreshCwIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {!failed && (waiting || !playback) && !ended ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <Loader2Icon className="size-10 animate-spin text-white/80" aria-label={labels.loading} />
        </div>
      ) : null}

      {!failed && playback && !playing && !ended && !waiting ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={labels.play}
          className="bg-gold text-gold-foreground absolute top-1/2 left-1/2 z-20 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-2xl transition hover:scale-105 sm:size-20"
        >
          <PlayIcon className="size-7 translate-x-0.5 fill-current sm:size-8" />
        </button>
      ) : null}

      {resumedFrom !== null && !ended ? (
        <div
          className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/70 py-1 ps-3 pe-1 text-xs text-white backdrop-blur"
          dir="auto"
        >
          <span>{format(labels.resumed, { time: formatClock(resumedFrom) })}</span>
          <button
            type="button"
            className="rounded-full bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = 0;
              setResumedFrom(null);
            }}
          >
            {labels.restart}
          </button>
        </div>
      ) : null}

      {ended ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/75 p-6 text-white">
          <div className="grid justify-items-center gap-4 text-center">
            <p className="text-lg font-semibold" dir="auto">
              {labels.ended}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
              >
                <RotateCcwIcon className="size-4" />
                {labels.restart}
              </button>
              {nextHref ? (
                <Link
                  href={nextHref}
                  className="bg-gold text-gold-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  {labels.nextLesson}
                  <SkipForwardIcon className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-200 sm:px-4",
          showControls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <input
          type="range"
          className="player-range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          aria-label={labels.seek}
          aria-valuetext={`${formatClock(current)} / ${formatClock(duration)}`}
          disabled={!duration}
          onChange={(event) => {
            const video = videoRef.current;
            if (video) video.currentTime = Number(event.target.value);
            setCurrent(Number(event.target.value));
          }}
          style={{
            background: `linear-gradient(to right, var(--gold) ${playedPct}%, rgb(255 255 255 / 0.45) ${playedPct}% ${Math.max(playedPct, bufferedPct)}%, rgb(255 255 255 / 0.2) ${Math.max(playedPct, bufferedPct)}%)`,
          }}
        />
        <div className="mt-1.5 flex items-center gap-1 sm:gap-2">
          <ControlButton label={playing ? labels.pause : labels.play} onClick={togglePlay}>
            {playing ? (
              <PauseIcon className="fill-current" />
            ) : (
              <PlayIcon className="fill-current" />
            )}
          </ControlButton>
          <ControlButton label={labels.back10} onClick={() => seekBy(-10)}>
            <RotateCcwIcon />
          </ControlButton>
          <ControlButton label={labels.forward10} onClick={() => seekBy(10)}>
            <RotateCwIcon />
          </ControlButton>
          <ControlButton
            label={muted ? labels.unmute : labels.mute}
            onClick={() => {
              if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
            }}
          >
            {muted ? <VolumeXIcon /> : <Volume2Icon />}
          </ControlButton>
          <span className="tabular ms-1 text-xs text-white/85">
            {formatClock(current)} / {formatClock(duration)}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <label className="sr-only" htmlFor={`speed-${lessonId}`}>
              {labels.speed}
            </label>
            <select
              id={`speed-${lessonId}`}
              value={rate}
              onChange={(event) => {
                if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
              }}
              className="h-8 cursor-pointer rounded-md bg-white/10 px-1.5 text-xs font-semibold text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed} className="text-black">
                  {speed}×
                </option>
              ))}
            </select>
            <ControlButton
              label={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none [&_svg]:size-[18px]"
    >
      {children}
    </button>
  );
}
