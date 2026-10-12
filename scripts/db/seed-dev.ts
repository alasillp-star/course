import "../_env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@/modules/access/actor";
import { ALL_PERMISSIONS } from "@/modules/access/catalog";
import { assignRoleUnchecked } from "@/modules/access/rbac.service";
import { markCardsSold } from "@/modules/activation/admin-codes.service";
import { createBatch, loadPrintableCards } from "@/modules/activation/batches.service";
import {
  applyDeliveryEvent,
  assignCardToOrder,
  ingestLandingOrder,
} from "@/modules/commerce/orders.service";
import { addLinkResource } from "@/modules/content/content.service";
import {
  completeUpload,
  startVideoUpload,
  writeLocalUpload,
} from "@/modules/content/media.service";
import { bootstrapPlatform } from "@/modules/platform/bootstrap.service";
import { closeDb, getDb } from "@/server/db/client";
import { courseModules, lessons, profiles, users } from "@/server/db/schema";
import { SYSTEM_REQUEST_META } from "@/server/http/request-meta";
import type { SystemRole } from "@/shared/enums";
import { seedCertificatesDemo } from "./seeds/certificates";
import { seedCommunityDemo } from "./seeds/community";
import { seedLiveDemo } from "./seeds/live";
import { seedOrderIntakeDemo } from "./seeds/orderIntake";
import { seedPrintingDemo } from "./seeds/printing";
import type { DemoSeedContext } from "./seeds/types";

/**
 * DEVELOPMENT DATA ONLY — refuses to run in staging/production.
 * Creates demo course content (based on the existing course outline), one
 * account per staff role, a small QR-only card batch and three delivery orders
 * for manual testing.
 */
const APP_ENV = process.env.APP_ENV ?? "development";
if (APP_ENV === "production" || APP_ENV === "staging") {
  console.error(`✗ seed-dev refuses to run with APP_ENV=${APP_ENV}`);
  process.exit(1);
}

const DEMO_MODULES = [
  {
    ar: "المتجر الاحترافي",
    fr: "La boutique professionnelle",
    descAr: "بناء صفحات هبوط تقنع الزبون من النظرة الأولى.",
    descFr: "Construire des pages de vente qui convainquent dès le premier regard.",
    lessons: [
      ["مدخل إلى المتجر الإلكتروني", "Introduction à la boutique en ligne"],
      ["بنية صفحة الهبوط المقنعة", "Structure d'une page de vente efficace"],
      ["تجربة الشراء على الهاتف", "L'expérience d'achat sur mobile"],
    ],
  },
  {
    ar: "استراتيجية السلعة الرابحة",
    fr: "La stratégie du produit gagnant",
    descAr: "كيف تجد المنتجات المطلوبة وتدرس منافسيك بذكاء.",
    descFr: "Trouver les produits demandés et analyser intelligemment la concurrence.",
    lessons: [
      ["معايير المنتج الرابح", "Les critères d'un produit gagnant"],
      ["تحليل المنافسين", "Analyser la concurrence"],
      ["التسعير والهامش", "Prix et marge"],
    ],
  },
  {
    ar: "إعلانات Meta الاحترافية",
    fr: "Publicité Meta professionnelle",
    descAr: "حملات موجهة بدقة للوصول إلى طلبات يومية.",
    descFr: "Des campagnes ciblées pour générer des commandes quotidiennes.",
    lessons: [
      ["إعداد مدير الإعلانات", "Configurer le gestionnaire de publicités"],
      ["الاستهداف والجماهير", "Ciblage et audiences"],
      ["قراءة النتائج والتحسين", "Lire les résultats et optimiser"],
    ],
  },
  {
    ar: "اللوجستيك والبيع",
    fr: "Logistique et vente",
    descAr: "التعامل مع المشتري، الشحن، وتحصيل الأموال.",
    descFr: "Relation client, livraison et encaissement.",
    lessons: [
      ["تأكيد الطلبات", "Confirmer les commandes"],
      ["الشحن والتوصيل", "Expédition et livraison"],
      ["التحصيل والتحويلات", "Encaissement et transferts"],
    ],
  },
  {
    ar: "كشف حصري: السوق البكر",
    fr: "Révélation : le marché vierge",
    descAr: "سوق جديد لم يكتشفه المنافسون بعد.",
    descFr: "Un nouveau marché encore inexploré par la concurrence.",
    lessons: [
      ["لماذا هذا السوق؟", "Pourquoi ce marché ?"],
      ["خطة الدخول", "Le plan d'entrée"],
    ],
  },
];

const DEMO_STAFF: Array<[string, SystemRole]> = [
  ["owner@academy.test", "super_admin"],
  ["admin@academy.test", "admin"],
  ["instructor@academy.test", "instructor"],
  ["moderator@academy.test", "moderator"],
  ["support@academy.test", "support_agent"],
  ["sales@academy.test", "sales_agent"],
  ["print@academy.test", "print_operator"],
];

/** Demo data of the community, live sessions, certificates, printing and order intake. */
async function seedFeatureDemos(context: DemoSeedContext) {
  for (const seed of [
    seedCommunityDemo,
    seedLiveDemo,
    seedCertificatesDemo,
    seedOrderIntakeDemo,
    seedPrintingDemo,
  ]) {
    const line = await seed(context);
    if (line) console.log(`✓ ${line}`);
  }
}

async function main() {
  const db = getDb();
  const { courseId } = await bootstrapPlatform(db, {});

  const existingModules = await db
    .select({ id: courseModules.id })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId));
  if (existingModules.length === 0) {
    for (const [index, module] of DEMO_MODULES.entries()) {
      const [created] = await db
        .insert(courseModules)
        .values({
          courseId,
          position: index + 1,
          title: { ar: module.ar, fr: module.fr },
          description: { ar: module.descAr, fr: module.descFr },
          status: "published",
        })
        .returning({ id: courseModules.id });
      await db.insert(lessons).values(
        module.lessons.map(([ar, fr], lessonIndex) => ({
          courseId,
          moduleId: created!.id,
          position: lessonIndex + 1,
          slug: `m${index + 1}-l${lessonIndex + 1}`,
          title: { ar, fr },
          durationSeconds: 420 + lessonIndex * 180,
          isFreePreview: index === 0 && lessonIndex === 0,
          status: "published" as const,
        })),
      );
    }
    console.log(`✓ demo curriculum: ${DEMO_MODULES.length} modules`);
  }

  for (const [email, role] of DEMO_STAFF) {
    let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, emailVerifiedAt: new Date() })
        .returning({ id: users.id });
      await db.insert(profiles).values({ userId: user!.id, displayName: role.replace("_", " ") });
    }
    await assignRoleUnchecked(db, { userId: user!.id, roleKey: role });
  }
  console.log(`✓ demo staff: ${DEMO_STAFF.map(([email]) => email).join(", ")}`);

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_STAFF[0]![0]));
  const systemActor: Actor = {
    userId: owner!.id,
    email: DEMO_STAFF[0]![0],
    status: "active",
    locale: "ar",
    roles: ["super_admin"],
    permissions: new Set(ALL_PERMISSIONS),
    sessionId: "00000000-0000-0000-0000-000000000000",
    isStaff: true,
    mfaVerified: true,
    authenticatedAt: new Date(),
  };
  if (process.argv.includes("--extras")) {
    // Existing demo data (npm run setup): only the idempotent feature demos.
    await seedFeatureDemos({ actor: systemActor, courseId });
    return;
  }
  await attachSampleVideo(systemActor, courseId);

  // QR-only cards (no scratch PIN), activatable only after a sale or a delivery.
  const batch = await createBatch(
    systemActor,
    {
      name: "Demo batch (development)",
      courseId,
      quantity: 20,
      requiresPin: false,
      requiresSale: true,
    },
    SYSTEM_REQUEST_META,
  );
  const { cards } = await loadPrintableCards(
    systemActor,
    { batchId: batch.id, from: 1, to: 20, format: "csv" },
    SYSTEM_REQUEST_META,
  );
  await markCardsSold(
    systemActor,
    { serials: cards.slice(0, 10).map((card) => card.serial) },
    SYSTEM_REQUEST_META,
  );
  console.log(
    `✓ demo batch ${batch.serialPrefix}: 20 QR-only cards, the first 10 sold at the counter`,
  );

  const delivery = await seedDemoOrders(systemActor, cards.slice(10, 12));
  await seedFeatureDemos({ actor: systemActor, courseId });

  console.log("\n  Counter-sold demo cards (development only):");
  for (const card of cards.slice(0, 2)) {
    console.log(`   ${card.serial}  ${card.url}`);
  }
  console.log("\n  Delivery orders (development only):");
  console.log(
    `   ${delivery.inTransit.orderNumber}  card ${delivery.inTransit.card.serial} — parcel in transit, card LOCKED`,
  );
  console.log(`   ${delivery.inTransit.card.url}`);
  console.log(
    `   ${delivery.delivered.orderNumber}  card ${delivery.delivered.card.serial} — parcel delivered, card works`,
  );
  console.log(`   ${delivery.delivered.card.url}`);
  console.log(`   ${delivery.waiting.orderNumber}  — new landing-page order, no card packed yet`);
  console.log(
    process.env.EMAIL_TRANSPORT === "dev-outbox" || !process.env.EMAIL_TRANSPORT
      ? "\n  Sign-in codes are written to the dev mailbox (.data/mailbox)."
      : `\n  Sign-in codes are sent through ${process.env.EMAIL_TRANSPORT}${
          process.env.SMTP_URL?.includes("1025") ? " to Mailpit: http://localhost:8025" : ""
        }.`,
  );
}

/**
 * Three landing-page orders through the real intake and carrier code paths:
 * one in transit (card locked), one delivered (card unlocked), one waiting.
 */
async function seedDemoOrders(actor: Actor, cards: Array<{ serial: string; url: string }>) {
  const intake = async (id: string, extra: Record<string, unknown>) =>
    ingestLandingOrder(
      {
        order_id: id,
        full_name: extra.name,
        phone: extra.phone,
        wilaya: extra.wilaya,
        commune: extra.commune,
        product: "Formation e-commerce — carte d'accès",
        total: 4900,
        shipping_fee: 400,
        ...extra,
      },
      SYSTEM_REQUEST_META,
    );
  const suffix = Date.now().toString(36).toUpperCase();
  const inTransit = await intake(`demo-${suffix}-1`, {
    name: "Yacine Benali",
    phone: "0555 12 34 56",
    wilaya: "16 - Alger",
    commune: "Bab Ezzouar",
    tracking_number: `DEMO-${suffix}-1`,
    carrier: "Demo carrier",
  });
  const delivered = await intake(`demo-${suffix}-2`, {
    name: "Amina Khelifi",
    phone: "0661 22 33 44",
    wilaya: "31 - Oran",
    commune: "Bir El Djir",
    tracking_number: `DEMO-${suffix}-2`,
    carrier: "Demo carrier",
  });
  const waiting = await intake(`demo-${suffix}-3`, {
    name: "Sofiane Haddad",
    phone: "0770 98 76 54",
    wilaya: "25 - Constantine",
    commune: "El Khroub",
  });
  await assignCardToOrder(
    actor,
    { orderId: inTransit.orderId!, serial: cards[0]!.serial },
    SYSTEM_REQUEST_META,
  );
  await assignCardToOrder(
    actor,
    { orderId: delivered.orderId!, serial: cards[1]!.serial },
    SYSTEM_REQUEST_META,
  );
  await applyDeliveryEvent(
    { trackingNumber: `DEMO-${suffix}-1`, status: "En transit" },
    { source: "webhook" },
  );
  await applyDeliveryEvent(
    { trackingNumber: `DEMO-${suffix}-2`, status: "Livré" },
    { source: "webhook" },
  );
  console.log("✓ demo orders: 1 in transit, 1 delivered, 1 waiting for a card");
  return {
    inTransit: { orderNumber: inTransit.orderNumber, card: cards[0]! },
    delivered: { orderNumber: delivered.orderNumber, card: cards[1]! },
    waiting: { orderNumber: waiting.orderNumber },
  };
}

/**
 * With the local (development) video provider, gives the first demo lesson a
 * real playable video, a text body and a link — through the same services the
 * admin editor uses.
 */
async function attachSampleVideo(actor: Actor, courseId: string) {
  if (process.env.VIDEO_PROVIDER !== "local") return;
  const db = getDb();
  const [first] = await db
    .select({ id: lessons.id, videoAssetId: lessons.videoAssetId })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.slug, "m1-l1")));
  if (!first || first.videoAssetId) return;
  const bytes = await readFile(path.resolve("tests/fixtures/lesson-sample.webm"));
  const { assetId, target } = await startVideoUpload(
    actor,
    {
      lessonId: first.id,
      filename: "sample-lesson.webm",
      sizeBytes: bytes.byteLength,
      contentType: "video/webm",
    },
    SYSTEM_REQUEST_META,
  );
  if (target.protocol !== "put") return;
  await writeLocalUpload(
    actor,
    target.url.split("/").pop()!,
    "video/webm",
    new Blob([bytes]).stream() as ReadableStream<Uint8Array>,
  );
  await completeUpload(actor, assetId, { durationSeconds: 20 }, SYSTEM_REQUEST_META);
  await db
    .update(lessons)
    .set({
      summary: {
        ar: "نظرة عامة على ما ستبنيه في هذه الدورة وكيف تستفيد منها أقصى استفادة.",
        fr: "Vue d'ensemble de ce que vous allez construire et comment en tirer le meilleur parti.",
      },
      body: {
        ar: "## ما ستتعلمه\n\n- بناء متجر يثق به الزبون\n- اختيار **منتج رابح**\n- إطلاق أول حملة إعلانية\n\n> نصيحة: دوّن ملاحظاتك أثناء المشاهدة، وستجدها كلها في صفحة «ملاحظاتي».",
        fr: "## Ce que vous allez apprendre\n\n- Construire une boutique qui inspire confiance\n- Choisir un **produit gagnant**\n- Lancer votre première campagne\n\n> Astuce : prenez des notes pendant la vidéo, elles sont toutes regroupées dans « Mes notes ».",
      },
    })
    .where(eq(lessons.id, first.id));
  await addLinkResource(
    actor,
    {
      lessonId: first.id,
      title: { ar: "دليل Meta لأصحاب المتاجر", fr: "Guide Meta pour les commerçants" },
      url: "https://www.facebook.com/business/learn",
    },
    SYSTEM_REQUEST_META,
  );
  console.log("✓ sample video, text and a link attached to the first lesson (local provider)");
}

main()
  .catch((error: unknown) => {
    console.error("✗ dev seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
