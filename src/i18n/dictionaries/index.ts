import type { Locale } from "../config";
import { ar, type Dictionary } from "./ar";
import { en } from "./en";
import { fr } from "./fr";

const DICTIONARIES: Record<Locale, Dictionary> = { ar, fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary };
