/**
 * Live sessions: student schedule, join, replays; admin scheduling.
 * Owned by this feature; Arabic is the reference shape for the other locales.
 */
const ar = {
  title: "الجلسات المباشرة",
};

type Strings = typeof ar;

const fr: Strings = {
  title: "Sessions en direct",
};

const en: Strings = {
  title: "Live sessions",
};

export const live = { ar, fr, en };
