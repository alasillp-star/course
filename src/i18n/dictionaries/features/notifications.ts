/**
 * In-app notification texts, one per NOTIFICATION_TYPES entry (src/shared/enums.ts).
 * Placeholders are filled from the notification's data, see notificationText().
 */
const ar = {
  title: "الإشعارات",
  empty: "لا توجد إشعارات جديدة.",
  markAllRead: "تعليم الكل كمقروء",
  viewAll: "عرض كل الإشعارات",
  types: {
    community: {
      reply: "ردّ جديد على منشورك «{postTitle}»",
      answer_verified: "تم اعتماد إجابتك في «{postTitle}»",
      announcement: "إعلان جديد: {postTitle}",
    },
    live: {
      scheduled: "جلسة مباشرة جديدة: {title} — {startsAt}",
      cancelled: "أُلغيت الجلسة المباشرة: {title} ({startsAt})",
      recording: "تسجيل الجلسة «{title}» متاح الآن",
    },
    certificate: {
      issued: "شهادتك جاهزة (رقم {certificateNumber})",
    },
  },
  fallback: "إشعار جديد",
};

type Strings = typeof ar;

const fr: Strings = {
  title: "Notifications",
  empty: "Aucune nouvelle notification.",
  markAllRead: "Tout marquer comme lu",
  viewAll: "Voir toutes les notifications",
  types: {
    community: {
      reply: "Nouvelle réponse à votre publication « {postTitle} »",
      answer_verified: "Votre réponse a été validée dans « {postTitle} »",
      announcement: "Nouvelle annonce : {postTitle}",
    },
    live: {
      scheduled: "Nouvelle session en direct : {title} — {startsAt}",
      cancelled: "Session en direct annulée : {title} ({startsAt})",
      recording: "Le replay de « {title} » est disponible",
    },
    certificate: {
      issued: "Votre certificat est prêt (n° {certificateNumber})",
    },
  },
  fallback: "Nouvelle notification",
};

const en: Strings = {
  title: "Notifications",
  empty: "No new notifications.",
  markAllRead: "Mark all as read",
  viewAll: "See all notifications",
  types: {
    community: {
      reply: "New reply to your post “{postTitle}”",
      answer_verified: "Your answer was verified in “{postTitle}”",
      announcement: "New announcement: {postTitle}",
    },
    live: {
      scheduled: "New live session: {title} — {startsAt}",
      cancelled: "Live session cancelled: {title} ({startsAt})",
      recording: "The replay of “{title}” is available",
    },
    certificate: {
      issued: "Your certificate is ready (No. {certificateNumber})",
    },
  },
  fallback: "New notification",
};

export const notifications = { ar, fr, en };
