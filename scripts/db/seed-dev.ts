import "../_env";
import { eq } from "drizzle-orm";
import type { Actor } from "@/modules/access/actor";
import { ALL_PERMISSIONS } from "@/modules/access/catalog";
import { assignRoleUnchecked } from "@/modules/access/rbac.service";
import { markCardsSold } from "@/modules/activation/admin-codes.service";
import { createBatch, loadPrintableCards } from "@/modules/activation/batches.service";
import { formatCardCode, formatCardPin } from "@/modules/activation/codes";
import { bootstrapPlatform } from "@/modules/platform/bootstrap.service";
import { closeDb, getDb } from "@/server/db/client";
import { courseModules, lessons, profiles, users } from "@/server/db/schema";
import { SYSTEM_REQUEST_META } from "@/server/http/request-meta";
import type { SystemRole } from "@/shared/enums";

/**
 * DEVELOPMENT DATA ONLY — refuses to run in staging/production.
 * Creates demo course content (based on the existing course outline), one
 * account per staff role and a small card batch for manual testing.
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
];

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
  const batch = await createBatch(
    systemActor,
    {
      name: "Demo batch (development)",
      courseId,
      quantity: 20,
      requiresPin: true,
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

  console.log(`✓ demo batch ${batch.serialPrefix}: 20 cards, the first 10 marked as sold`);
  console.log("\n  Sold demo cards (development only):");
  for (const card of cards.slice(0, 3)) {
    console.log(
      `   ${card.serial}  code ${formatCardCode(card.code)}  PIN ${formatCardPin(card.pin!)}`,
    );
    console.log(`   ${card.url}`);
  }
  console.log("\n  Sign-in codes are written to the dev mailbox (.data/mailbox).");
}

main()
  .catch((error: unknown) => {
    console.error("✗ dev seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
