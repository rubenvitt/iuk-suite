import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import { AntdProvider } from "@/core/theme/AntdProvider";
import { THEME_COOKIE, parseThemeMode, themeInitScript } from "@/core/theme/mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IuK-Suite",
  description: "Internes Service-Dashboard für I&K",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Serverseitig gelesen, damit der ERSTE Render schon den richtigen
  // Algorithmus trägt: kein Hydration-Mismatch, kein FOUC. Kostet nichts —
  // alle Routen sind durch Proxy-Rewrite und auth() ohnehin dynamisch.
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ colorScheme: mode }}
      suppressHydrationWarning
    >
      <head>
        {/* Primt beim ersten Besuch die OS-Präferenz ins Cookie — siehe mode.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(cookieDomain) }} />
      </head>
      <body>
        <AntdRegistry>
          <Providers>
            <AntdProvider initialMode={mode} cookieDomain={cookieDomain}>
              {children}
            </AntdProvider>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
