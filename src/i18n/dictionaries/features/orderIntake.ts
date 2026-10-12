/**
 * Confirmed orders from EcoManager and other systems: confirmation, CSV import.
 * Owned by this feature; Arabic is the reference shape for the other locales.
 */
const ar = {
  title: "الطلبيات المؤكدة",
};

type Strings = typeof ar;

const fr: Strings = {
  title: "Commandes confirmées",
};

const en: Strings = {
  title: "Confirmed orders",
};

export const orderIntake = { ar, fr, en };
