"use client";

import * as React from "react";

type PlayerControls = {
  /** Current playback time in seconds, or null before the video is ready. */
  getTime: () => number | null;
  seek: (seconds: number) => void;
};

type Registry = {
  controls: React.RefObject<PlayerControls | null>;
  register: (controls: PlayerControls | null) => void;
};

const PlayerContext = React.createContext<Registry | null>(null);

/** Lets the notes panel read the video time and jump to it, wherever both render. */
export function LessonPlayerProvider({ children }: { children: React.ReactNode }) {
  const controls = React.useRef<PlayerControls | null>(null);
  const value = React.useMemo<Registry>(
    () => ({
      controls,
      register: (next) => {
        controls.current = next;
      },
    }),
    [],
  );
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerRegistry(): Registry | null {
  return React.useContext(PlayerContext);
}
