import type { ReactNode } from "react";
import Link from "next/link";

import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DER KOPF JEDER ARBEITSSEITE DER SUITE.
 *
 * Er lag bis 2026-08-13 als `lagerbuch/_ui/SeitenKopf.tsx` bei einem Modul,
 * während `feedback`, `files` und `portal` ihre Überschriften jeweils selbst
 * bauten. Drei belegbare Nutznießer erfüllen den Maßstab aus
 * `docs/design/README.md`; `lagerbuch` behält seinen Namen als Adapter
 * darüber, genau wie `SCHRIFT` es vorgemacht hat.
 *
 * KEINE CLIENT-DIREKTIVE, und das ist der Punkt: die Überschrift ist NACKTES
 * `<h1>` mit einer Typografie-Rolle, nicht `Typography.Title`. Ein
 * Compound-Zugriff auf antd ergibt in einer Server Component HTTP 500
 * (Falle 1) — und die Alternative „macht die Überschrift halt zu einer
 * Client-Insel" kostete über vierzig Client-Grenzen für eine Zeile Text.
 *
 * `zurueck` ist der einzige Zuwachs gegenüber der Lagerbuch-Fassung. „Führt
 * jede Seite zurück, oder ist sie eine Sackgasse?" ist eine Prüf­frage aus
 * `docs/design/README.md` und hatte bisher keinen gemeinsamen Träger.
 * `next/link` und nicht `<a>`: der Weg bleibt im selben Modul, ein `<a>` warf
 * die ganze Anwendung weg und lud sie neu.
 *
 * KEIN ZEICHEN AM RÜCKWEG. `@ant-design/icons` in einer Server Component
 * ergibt HTTP 500 schon beim Import, und `"use client"` behebt das nicht, es
 * macht es still (Falle 7). Das Pfeilzeichen steht deshalb als Textliteral da.
 */
export function Seitenkopf({
  titel,
  beschreibung,
  aktionen,
  zurueck,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
  zurueck?: { titel: string; href: string };
}) {
  return (
    <div style={{ marginBlockEnd: SPACE.lg }}>
      {zurueck ? (
        <Link
          data-testid="seitenkopf-zurueck"
          href={zurueck.href}
          style={{
            ...SCHRIFT.neben,
            display: "inline-block",
            marginBlockEnd: SPACE.xs,
            color: "inherit",
          }}
        >
          ‹ {zurueck.titel}
        </Link>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: SPACE.md,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>{titel}</h1>
          {beschreibung ? (
            <p
              data-testid="seitenkopf-beschreibung"
              style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0`, maxWidth: "72ch" }}
            >
              {beschreibung}
            </p>
          ) : null}
        </div>
        {aktionen ? (
          <div
            data-testid="seitenkopf-aktionen"
            style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}
          >
            {aktionen}
          </div>
        ) : null}
      </div>
    </div>
  );
}
