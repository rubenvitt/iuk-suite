import type { ReactNode } from "react";
import Link from "next/link";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE HUELLE DER OFFLINE-FLAECHE — eigener 56px-Kopf, KEIN `<Shell>`, KEIN
 * `auth()`.
 *
 * ⛔ WARUM OHNE SHELL, und das ist die tragende Zeile dieser Aufgabe: gemessen
 * (M17.3) traegt JEDE Seite unter `SuiteRahmen` `{"userName":"…",
 * "angemeldet":true}` und die gruppenabhaengige App-Liste im Flight-Payload —
 * zwei Personen, dieselbe URL: 281.170 vs. 279.159 B. Der Inhaltsriegel des
 * Service Workers lehnt solches HTML ab, und zwar zu Recht. Wer hier eine Shell
 * einzieht, bekommt keine haessliche Seite, sondern GAR KEINE PWA — still.
 * `offlineflaeche.test.ts` haelt das fest.
 * Gegenbild: `uav /` mit 45.944 B, mit und ohne Sitzung byteidentisch, 0x
 * userName.
 *
 * ⛔ DIESELBE BEDIENDICHTE WIE `FullShell`: `ARBEITSDICHTE` 44/48 ueber dem
 * INHALT. Ohne sie stuenden die antd-Bedienelemente derselben Insel hier auf
 * 56/72 (dem Einsatzwert aus `buildTheme`), waehrend ihr eigenes Markup 44 als
 * Literal traegt — dieselbe Flaeche in zwei Groessen, und kein Gate sieht es
 * (Falle 5).
 *
 * ⛔ KEIN antd-`Layout.Header`: Falle 8 (die Kopfzeile vererbt ihre 64px
 * Zeilenhoehe an jedes Kind) entsteht hier gar nicht, weil die Regel an
 * `.ant-layout-header` haengt und ein eigenes `<header>` nichts davon erbt.
 * 56px ist bewusst NICHT 64: dies ist kein Suite-Kopf, sondern eine Zeile mit
 * einem Titel und einem Weg zurueck.
 *
 * ⛔ KEIN Compound-Zugriff auf antd (Falle 1): natives `<h1>`, natives
 * `<header>`. Kein `@ant-design/icons` (Falle 7). Kein Suite-Rot auf einer
 * Datenflaeche (Falle 3).
 */
export default function ZeichenRahmenlosLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACE.md,
          paddingInline: SPACE.md,
          borderBlockEnd: "1px solid var(--iuk-linie)",
        }}
      >
        <span style={SCHRIFT.unterTitel}>Taktische Zeichen</span>
        {/* /login steht in PASSTHROUGH (routing.ts) und ist deshalb die
            einzige Adresse, die von dieser Flaeche aus auch mit abgelaufener
            Sitzung sicher erreichbar ist. */}
        <Link
          href="/login"
          style={{
            ...SCHRIFT.neben,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            color: "inherit",
          }}
        >
          Anmelden
        </Link>
      </header>
      <main style={{ padding: SPACE.md }}>
        <Arbeitsdichte>{children}</Arbeitsdichte>
      </main>
    </div>
  );
}
