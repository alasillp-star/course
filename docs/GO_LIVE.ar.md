<div dir="rtl">

# تشغيل المنصة على الإنترنت (وضع العمل)

المنصة جاهزة للنشر. بعد أن تضع الإعدادات، كل نشر جديد على Vercel يقوم وحده بثلاثة أشياء:

- يحدّث قاعدة البيانات ويجهّز حساب المدير العام (`vercel-build`).
- يفحص الإعدادات قبل النشر، ويوقف النشر إذا كان فيها خطأ (HTTPS، بريد حقيقي، أسرار مختلفة، التحقق بخطوتين للفريق). يمكنك تشغيل نفس الفحص بنفسك: `npm run env:check`.
- يشغّل التنظيف اليومي تلقائيًا (Vercel Cron على `/api/cron/maintenance`).

ما يبقى عليك: فتح الحسابات أدناه ونسخ القيم إلى Vercel. لا يوجد أي خدمة وهمية: البريد والفيديو والتخزين تعمل فقط بحساباتك الحقيقية.

## 1. الحسابات المطلوبة

| الخدمة                                 | لماذا                               | إلزامي؟                     | التكلفة عند البداية (تقريبية)                 |
| -------------------------------------- | ----------------------------------- | --------------------------- | --------------------------------------------- |
| **اسم نطاق** (مثل `abdou-academy.com`) | عنوان المنصة، ومطبوع داخل كل رمز QR | نعم، **قبل طباعة البطاقات** | ~10–15 $ في السنة                             |
| **Supabase** (قاعدة البيانات)          | كل البيانات                         | نعم                         | خطة مجانية ثم 25 $ في الشهر                   |
| **Vercel** (الاستضافة)                 | تشغيل المنصة                        | نعم                         | Hobby مجاني / Pro 20 $ في الشهر               |
| **Resend** (البريد)                    | رموز الدخول والتفعيل                | نعم                         | مجاني حتى 3,000 رسالة في الشهر (100 في اليوم) |
| **Mux** أو **Cloudflare Stream**       | فيديوهات الدروس المحمية             | للفيديو                     | حسب الدقائق المخزّنة والمشاهدة                |
| **Cloudflare R2** أو تخزين Supabase    | ملفات الدروس (PDF…)                 | للملفات                     | مجاني حتى 10 GB على R2                        |

> خطة Vercel المجانية (Hobby) مخصّصة للاستعمال غير التجاري. لموقع يبيع فعلًا، الخطة المناسبة هي Pro.

## 2. قاعدة البيانات (Supabase)

1. أنشئ مشروعًا في supabase.com. اختر منطقة قريبة من الجزائر (Frankfurt أو Paris)، واحفظ كلمة سر قاعدة البيانات.
2. اضغط زر **Connect** وانسخ رابطين:
   - **Transaction pooler** (المنفذ `6543`): يصبح `DATABASE_URL`، وأضف في آخره `?sslmode=require`.
   - **Session pooler** (المنفذ `5432`): يصبح `DATABASE_MIGRATION_URL`، وأضف في آخره `?sslmode=require`.
3. لا تحتاج تفعيل أي شيء آخر في Supabase. المنصة تغلق الوصول المباشر للجداول (RLS).

## 3. البريد (Resend)

1. أنشئ حسابًا في resend.com، ثم **Domains → Add domain** (مثلًا `mail.abdou-academy.com`).
2. أضف سجلات DNS التي يعطيك إياها (SPF وDKIM) عند مزوّد النطاق، وانتظر التحقق.
3. **API Keys → Create** لإنشاء مفتاح.

## 4. الأسرار

على حاسوبك، داخل مجلد المشروع:

```bash
npm run secrets:generate
```

يطبع 6 قيم:

- `AUTH_SECRET`، `ACTIVATION_CODE_PEPPER`، `DATA_ENCRYPTION_KEY`: أسرار المنصة.
- `ORDERS_INTEGRATION_TOKEN`: رمز صفحة البيع.
- `DELIVERY_WEBHOOK_TOKEN`: رمز شركة التوصيل.
- `CRON_SECRET`: رمز التنظيف اليومي.

> احتفظ بنسخة من `DATA_ENCRYPTION_KEY` و`ACTIVATION_CODE_PEPPER` في مكان آمن خارج Vercel. بدونهما لا تعمل البطاقات غير المفعّلة بعد أي استرجاع للبيانات.

## 5. النشر على Vercel

1. في vercel.com: **Add New → Project**، ثم استورد المستودع `alasillp-star/course`.
2. العمل الحالي موجود على الفرع `claude/exciting-albattani-r5u25c`. هناك حلّان:
   - دمجه في `main`. أستطيع فتح Pull Request لذلك إذا طلبت.
   - أو تعيينه كفرع الإنتاج: في إعدادات المشروع **Environments → Production** غيّر **Production Branch** إلى `claude/exciting-albattani-r5u25c`.
3. أضف متغيرات البيئة في **Settings → Environment Variables** (بيئة Production):

| المتغير                                                             | القيمة                                            |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `APP_ENV`                                                           | `production`                                      |
| `APP_URL`                                                           | `https://abdou-academy.com` (نطاقك النهائي)       |
| `DATABASE_URL`                                                      | رابط Transaction pooler                           |
| `DATABASE_PREPARE`                                                  | `false`                                           |
| `DATABASE_MIGRATION_URL`                                            | رابط Session pooler                               |
| `AUTH_SECRET`، `ACTIVATION_CODE_PEPPER`، `DATA_ENCRYPTION_KEY`      | من الخطوة 4                                       |
| `EMAIL_TRANSPORT`                                                   | `resend`                                          |
| `RESEND_API_KEY`                                                    | مفتاح Resend                                      |
| `EMAIL_FROM`                                                        | `Abdou Academy <no-reply@mail.abdou-academy.com>` |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL`                                       | بريدك أنت (المدير العام)                          |
| `NEXT_PUBLIC_SUPPORT_EMAIL`                                         | بريد الدعم الذي يظهر للطلبة                       |
| `ORDERS_INTEGRATION_TOKEN`، `DELIVERY_WEBHOOK_TOKEN`، `CRON_SECRET` | من الخطوة 4                                       |
| للفيديو: `VIDEO_PROVIDER=mux` و`MUX_*`                              | انظر `DEPLOYMENT.md` (قسم 3b)                     |
| للملفات: `STORAGE_PROVIDER=s3` و`S3_*`                              | انظر `DEPLOYMENT.md` (قسم 3b)                     |

4. **Settings → Functions → Region**: اختر نفس منطقة قاعدة البيانات (Frankfurt `fra1` أو Paris `cdg1`).
5. **Deploy**. سجل البناء يُظهر بالترتيب:
   - `✓ configuration valid` (إذا كان أي متغير ناقصًا أو خاطئًا يتوقف النشر هنا ويذكر اسمه بالضبط)
   - `✓ migrations applied`
   - `✓ super admin created for …`
   - ثم بناء المنصة.
6. **Settings → Domains**: أضف نطاقك واتبع تعليمات DNS. شهادة HTTPS تلقائية.

## 6. أول دخول

1. افتح `https://نطاقك/ar/login` بالبريد الذي وضعته في `BOOTSTRAP_SUPER_ADMIN_EMAIL`.
2. يصلك رمز بالبريد. بعده فعّل التحقق بخطوتين بتطبيق Google Authenticator، واحفظ رموز الاسترجاع.
3. أضف فريقك من «الفريق والصلاحيات».
4. أضف محتوى الدورة من «المحتوى» وانشره.

## 7. الربط مع صفحة البيع وشركة التوصيل

اتبع [INTEGRATIONS.md](./INTEGRATIONS.md). باختصار:

- **صفحة البيع (Lovable وSupabase الخاص بها):** في Supabase الخاص بصفحة البيع، أنشئ Database Webhook نحو `https://نطاقك/api/v1/integrations/orders` مع الترويسة `Authorization: Bearer <ORDERS_INTEGRATION_TOKEN>`.
- **شركة التوصيل:** أعطها الرابط `https://نطاقك/api/v1/integrations/delivery` و`DELIVERY_WEBHOOK_TOKEN`. إذا لم يكن لها Webhook، استعمل «استيراد حالات التوصيل» (CSV).
- **للتأكد:** صفحة «الطلبيات والتوصيل ← الربط مع الأنظمة» يجب أن تُظهر «مُفعّل» وآخر الرسائل المستلمة.
- **لاختبار الربط من حاسوبك:**
  ```bash
  npm run simulate -- order --url=https://نطاقك
  ```
  هذا الأمر يقرأ الرموز من `.env.local` على حاسوبك، فيجب أن تكون نفس قيم الإنتاج.

## 8. قبل طباعة البطاقات

- [ ] النطاق النهائي مضبوط في `APP_URL`. رابط كل رمز QR يُبنى منه، ولا يمكن تغييره بعد الطباعة.
- [ ] دفعة تجريبية من 5 بطاقات: طلبية، ثم وضع بطاقة في الطرد، ثم تسليم، ثم تفعيل على الهاتف.
- [ ] ألغِ البطاقات التجريبية الباقية.
- [ ] الطباعة النهائية، ثم «إتلاف الأسرار نهائيًا» بعد استلامها.
- [ ] مراقبة: Uptime على `https://نطاقك/api/health`.
- [ ] تأكد من تفعيل النسخ الاحتياطي في Supabase (PITR على الخطة المدفوعة).

</div>
