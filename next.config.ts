import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Dev-only: the suite is exercised across multiple *.localtest.me hosts against a
  // single `next dev` server. Next dev blocks cross-origin requests to /_next/* dev
  // resources from any host other than the one it was started on (localhost), which
  // prevents client hydration on every *.localtest.me host. Allow the dev hosts so
  // interactivity (and dev-login) works on each subdomain. No effect on `next build`/`next start`.
  allowedDevOrigins: ["*.localtest.me"],
  // `forbidden()` und `app/forbidden.tsx` (HTTP 403 mit Suite-Seite): der Proxy schreibt einen
  // verweigerten Seitenaufruf auf `/kein-zugriff` um, und die Seite dort wirft `forbidden()`.
  experimental: { authInterrupts: true },
};
export default nextConfig;
