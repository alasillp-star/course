import type { Locale } from "@/i18n/config";
import { localeDirection } from "@/i18n/config";
import { ACADEMY } from "@/config/academy";

/**
 * Transactional e-mail templates (Arabic / French / English).
 * Kept dependency-free: table-based HTML with inline styles renders reliably
 * across Gmail, Outlook and mobile clients. All interpolated values are escaped.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(locale: Locale, title: string, bodyHtml: string, footer: string): string {
  const dir = localeDirection(locale);
  const align = dir === "rtl" ? "right" : "left";
  const name = escapeHtml(ACADEMY.name[locale]);
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0b132b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e8ee;">
<tr><td style="background:#0b132b;padding:22px 28px;text-align:${align};">
<span style="color:#e3c26b;font-size:18px;font-weight:700;letter-spacing:.3px;">${name}</span>
</td></tr>
<tr><td dir="${dir}" style="padding:28px;text-align:${align};font-size:15px;line-height:1.7;">
${bodyHtml}
</td></tr>
<tr><td dir="${dir}" style="padding:18px 28px;border-top:1px solid #eef0f4;color:#6b7280;font-size:12px;line-height:1.6;text-align:${align};">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<div dir="ltr" style="margin:22px 0;padding:16px;background:#f7f3e8;border:1px solid #ead9a8;border-radius:12px;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#0b132b;">${escapeHtml(code)}</div>`;
}

const OTP_COPY = {
  ar: {
    subject: {
      login: "رمز الدخول إلى حسابك",
      activation: "رمز تأكيد تفعيل اشتراكك",
      email_change: "تأكيد بريدك الإلكتروني الجديد",
    },
    intro: {
      login: "استخدم الرمز التالي لتسجيل الدخول إلى حسابك:",
      activation: "استخدم الرمز التالي لتأكيد بريدك الإلكتروني وتفعيل وصولك إلى الدورة:",
      email_change: "استخدم الرمز التالي لتأكيد عنوان بريدك الإلكتروني الجديد:",
    },
    expiry: (minutes: number) => `صالح لمدة ${minutes} دقائق ولمرة واحدة فقط.`,
    warning: "لا تشارك هذا الرمز مع أي شخص. فريقنا لن يطلبه منك أبدًا.",
    ignore: "إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.",
  },
  fr: {
    subject: {
      login: "Votre code de connexion",
      activation: "Code de confirmation de votre activation",
      email_change: "Confirmez votre nouvelle adresse e-mail",
    },
    intro: {
      login: "Utilisez le code suivant pour vous connecter à votre compte :",
      activation:
        "Utilisez le code suivant pour confirmer votre adresse e-mail et activer votre accès à la formation :",
      email_change: "Utilisez le code suivant pour confirmer votre nouvelle adresse e-mail :",
    },
    expiry: (minutes: number) => `Valable ${minutes} minutes, utilisable une seule fois.`,
    warning: "Ne partagez jamais ce code. Notre équipe ne vous le demandera jamais.",
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.",
  },
  en: {
    subject: {
      login: "Your sign-in code",
      activation: "Confirm your course activation",
      email_change: "Confirm your new e-mail address",
    },
    intro: {
      login: "Use the following code to sign in to your account:",
      activation: "Use the following code to confirm your e-mail and activate your course access:",
      email_change: "Use the following code to confirm your new e-mail address:",
    },
    expiry: (minutes: number) => `Valid for ${minutes} minutes, single use only.`,
    warning: "Never share this code. Our team will never ask you for it.",
    ignore: "If you did not request this code, you can safely ignore this e-mail.",
  },
} as const;

export function renderOtpEmail(params: {
  locale: Locale;
  purpose: "login" | "activation" | "email_change";
  code: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const copy = OTP_COPY[params.locale];
  const subject = `${copy.subject[params.purpose]} — ${ACADEMY.name[params.locale]}`;
  const html = layout(
    params.locale,
    subject,
    `<p style="margin:0 0 6px;">${escapeHtml(copy.intro[params.purpose])}</p>
${codeBlock(params.code)}
<p style="margin:0 0 8px;color:#374151;">${escapeHtml(copy.expiry(params.expiresInMinutes))}</p>
<p style="margin:0;color:#b42318;font-size:13px;">${escapeHtml(copy.warning)}</p>`,
    escapeHtml(copy.ignore),
  );
  const text = [
    copy.intro[params.purpose],
    "",
    params.code,
    "",
    copy.expiry(params.expiresInMinutes),
    copy.warning,
    "",
    copy.ignore,
  ].join("\n");
  return { subject, html, text };
}

const NO_ACCOUNT_COPY = {
  ar: {
    subject: "محاولة دخول إلى الأكاديمية",
    body: "طلب أحدهم رمز دخول لهذا البريد الإلكتروني، لكن لا يوجد حساب مرتبط به. إذا اشتريت بطاقة تفعيل، امسح رمز QR الموجود على البطاقة لإنشاء حسابك. وإذا فعّلت سابقًا ببريد آخر، استخدم ذلك البريد لتسجيل الدخول.",
    cta: "صفحة التفعيل",
  },
  fr: {
    subject: "Tentative de connexion à l'académie",
    body: "Un code de connexion a été demandé pour cette adresse, mais aucun compte n'y est associé. Si vous avez acheté une carte d'activation, scannez son QR code pour créer votre compte. Si vous avez déjà activé avec une autre adresse, connectez-vous avec celle-ci.",
    cta: "Page d'activation",
  },
  en: {
    subject: "Sign-in attempt at the academy",
    body: "A sign-in code was requested for this address, but no account uses it. If you bought an activation card, scan its QR code to create your account. If you activated with another address, sign in with that one.",
    cta: "Activation page",
  },
} as const;

export function renderNoAccountEmail(params: {
  locale: Locale;
  activationUrl: string;
}): RenderedEmail {
  const copy = NO_ACCOUNT_COPY[params.locale];
  const subject = `${copy.subject} — ${ACADEMY.name[params.locale]}`;
  const html = layout(
    params.locale,
    subject,
    `<p style="margin:0 0 18px;">${escapeHtml(copy.body)}</p>
<a href="${escapeHtml(params.activationUrl)}" style="display:inline-block;background:#0b132b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">${escapeHtml(copy.cta)}</a>`,
    escapeHtml(OTP_COPY[params.locale].ignore),
  );
  return { subject, html, text: `${copy.body}\n\n${copy.cta}: ${params.activationUrl}` };
}

const EMAIL_CHANGED_COPY = {
  ar: {
    subject: "تم تغيير البريد الإلكتروني لحسابك",
    body: (masked: string) =>
      `تم تغيير البريد الإلكتروني المرتبط بحسابك إلى ${masked}. إذا لم تقم بهذا التغيير، تواصل مع الدعم فورًا.`,
  },
  fr: {
    subject: "L'adresse e-mail de votre compte a été modifiée",
    body: (masked: string) =>
      `L'adresse e-mail de votre compte a été remplacée par ${masked}. Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.`,
  },
  en: {
    subject: "Your account e-mail was changed",
    body: (masked: string) =>
      `The e-mail address of your account was changed to ${masked}. If you did not make this change, contact support immediately.`,
  },
} as const;

export function renderEmailChangedEmail(params: {
  locale: Locale;
  newEmailMasked: string;
}): RenderedEmail {
  const copy = EMAIL_CHANGED_COPY[params.locale];
  const subject = `${copy.subject} — ${ACADEMY.name[params.locale]}`;
  const body = copy.body(params.newEmailMasked);
  return {
    subject,
    html: layout(params.locale, subject, `<p style="margin:0;">${escapeHtml(body)}</p>`, ""),
    text: body,
  };
}
