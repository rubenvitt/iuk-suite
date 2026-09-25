"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Die Client-Provider der Suite — heute nur der `SessionProvider`, damit
 * `useSession()` in jedem Modul funktioniert.
 *
 * KEIN AUTOMATISCHER LOGOUT MEHR IM BROWSER. Hier stand bis DRK-444 ein
 * `SessionGuard`, der auf `session.error === "RefreshTokenError"` mit einem
 * stillen Neu-Login antwortete und notfalls ueber `oidc-signout` abmeldete.
 * Seit DRK-284 verwirft der Server die Sitzung selbst, sobald Pocket ID die
 * Verlaengerung endgueltig ablehnt (`jwt`-Callback in `core/auth/config.ts`),
 * und der Vermerk erreicht den Browser nie. Wer den Zweig zurueckholen will,
 * braucht zuerst einen Server, der wieder einen Vermerk statt `null` liefert —
 * und das oeffnete die Luecke von DRK-284 erneut.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
