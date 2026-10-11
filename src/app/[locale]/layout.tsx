import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { ENABLED_LOCALES } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { THEME_SCRIPT } from "@/lib/theme-script";
import { cn } from "@/lib/utils";
import "../globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { dict, locale } = await getI18n();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(appUrl),
    title: { default: dict.meta.title, template: `%s · ${dict.meta.title}` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(ENABLED_LOCALES.map((code) => [code, `/${code}`])),
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      locale,
      type: "website",
    },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const { locale, dir, dict } = await getI18n();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(arabic.variable, latin.variable)}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-[100] rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {dict.common.skipToContent}
        </a>
        <Providers dir={dir}>{children}</Providers>
      </body>
    </html>
  );
}
