"use client";

import { useEffect, useRef } from "react";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";

/** Schluessel der Re-Login-Marke im sessionStorage des Tabs. */
export const REAUTH_MARKE = "iuk-reauth";

/**
 * Wie lange nach einem sanften Versuch kein zweiter erlaubt ist.
 *
 * Fuenf Minuten, weil Pocket IDs Access-Token eine Stunde lebt: echte
 * Zusammenstoesse kommen hoechstens stuendlich, die Sperre feuert also nie
 * versehentlich — blockt aber jede Schleife, die schneller kreist.
 */
export const REAUTH_SPERRE_MS = 5 * 60 * 1000;

/**
 * Darf jetzt ein sanfter Re-Login versucht werden? Setzt bei „ja" zugleich die
 * Marke.
 *
 * ZEITSTEMPEL, NICHT EINMALMARKE — der Spec (§2.4) sah eine einmalige Marke
 * pro Seitenbesuch vor; die traegt nicht. Wird sie nie geraeumt, faellt ein
 * echter zweiter Fehlschlag Stunden spaeter sofort auf den harten Logout.
 * Wird sie bei Erfolg geraeumt, entsteht genau die Schleife, die sie
 * verhindern soll (Erfolg -> Marke weg -> Fehler -> Re-Login -> …). Ein
 * Zeitstempel ist keines von beidem.
 *
 * `sessionStorage` und nicht `useRef`: der Re-Login ist eine volle
 * Seitennavigation, ein Ref ueberlebt sie nicht. Und nicht `localStorage`: die
 * Marke soll mit dem Tab enden, nicht wochenlang liegen bleiben.
 *
 * Wirft der Speicher (Safari im privaten Modus, gesperrter Speicher), lautet
 * die Antwort NEIN. Ohne Riegel nicht sanft versuchen: eine Schleife im
 * Browser ist schlimmer als ein Logout.
 */
export function sanfterVersuchErlaubt(jetzt: number = Date.now()): boolean {
  try {
    const roh = window.sessionStorage.getItem(REAUTH_MARKE);
    const letzter = roh === null ? Number.NaN : Number(roh);
    if (Number.isFinite(letzter) && jetzt - letzter < REAUTH_SPERRE_MS) return false;
    window.sessionStorage.setItem(REAUTH_MARKE, String(jetzt));
    return true;
  } catch {
    return false;
  }
}

function SessionGuard({
  children,
  reauthProvider,
}: {
  children: React.ReactNode;
  reauthProvider: string | null;
}) {
  const { data: session } = useSession();
  // Hoechstens EINE Handlung pro Mount. React fuehrt Effekte in der
  // Entwicklungsfassung doppelt aus; ohne diesen Riegel verbrauchte der erste
  // Lauf den erlaubten sanften Versuch und der zweite feuerte `signOut`,
  // waehrend `signIn` noch seine drei HTTP-Umlaeufe macht.
  const gehandelt = useRef(false);

  useEffect(() => {
    if (session?.error !== "RefreshTokenError") return;
    if (gehandelt.current) return;
    gehandelt.current = true;

    // Ohne Pocket ID (Dev-Login-Instanz) gibt es niemanden, bei dem man sich
    // still neu anmelden koennte: `signIn` faende den Provider nicht und
    // navigierte hart auf die Login-Seite (next-auth/react.js:131-142).
    if (!reauthProvider || !sanfterVersuchErlaubt()) {
      // Ueber oidc-signout, sonst laeuft die Sitzung beim Identity Provider
      // weiter und der naechste Login-Klick meldet wortlos denselben Nutzer an.
      //
      // `callbackUrl` hier bewusst, obwohl drei Zeilen tiefer `redirectTo`
      // steht: `SuiteNav.tsx:242` und `oidc-signout/route.test.ts` fahren auf
      // dieser Schreibweise. Sie zu vereinheitlichen ist ein eigener Umbau,
      // kein Nebeneffekt dieser Aenderung — wer es hier still angleicht,
      // bricht `SuiteNav.test.tsx`.
      signOut({ callbackUrl: "/api/auth/oidc-signout" });
      return;
    }

    // `redirectTo`, nicht das veraltete `callbackUrl` (next-auth/lib/client.d.ts:38).
    // Absolut, damit der Nutzer auf DER Modul-Domain landet, von der er kam —
    // Auth.js loeste ein relatives Ziel gegen AUTH_URL auf, also aufs Portal
    // (siehe core/auth/callbackUrl.ts).
    signIn(reauthProvider, { redirectTo: window.location.href });
  }, [session?.error, reauthProvider]);

  return children;
}

export function Providers({
  children,
  reauthProvider,
}: {
  children: React.ReactNode;
  /**
   * Kennung des Providers fuer den stillen Re-Login, oder `null`, wenn es
   * keinen gibt. Kommt aus einer Server-Umgebung (`app/layout.tsx` ueber
   * `reauthProviderId()`) — eine Client Component kann `POCKET_ID_ISSUER`
   * nicht lesen, und serverseitig gibt next-auth die Providerliste nicht
   * heraus (`getProviders` ist eine Client-Funktion).
   */
  reauthProvider: string | null;
}) {
  return (
    <SessionProvider>
      <SessionGuard reauthProvider={reauthProvider}>{children}</SessionGuard>
    </SessionProvider>
  );
}
