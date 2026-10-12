/**
 * Card printing: flexible batch printing, print queue of confirmed orders, print operator.
 * Owned by this feature; Arabic is the reference shape for the other locales.
 */
const ar = {
  title: "طباعة البطاقات",
};

type Strings = typeof ar;

const fr: Strings = {
  title: "Impression des cartes",
};

const en: Strings = {
  title: "Card printing",
};

export const printing = { ar, fr, en };
