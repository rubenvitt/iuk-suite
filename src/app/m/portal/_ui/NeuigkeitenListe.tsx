"use client";

import { useMemo, useState } from "react";
import { AppstoreOutlined } from "@ant-design/icons";
import { Alert, Card, Result, Segmented } from "antd";

import { ICONS } from "@/core/shell/icons";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { formatiereDatum } from "@/app/m/portal/_lib/neuigkeiten/datum";
import type { Neuigkeit } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import type { Notizblock } from "@/app/m/portal/_lib/neuigkeiten/typen";

const ALLE = "alle";

/**
 * DIE NEUIGKEITEN ALS LESBARE SEITE — Client-Insel aus zwei Gründen zugleich,
 * denselben wie bei `DiensteRaster`: der Filter braucht Zustand, und die
 * App-Zeichen dürfen nur hier auflösen (`@ant-design/icons` in einer Server
 * Component ist HTTP 500 schon beim Import, `docs/design/README.md`, Falle 7).
 * Die Seite darüber bleibt Server Component und übergibt fertige, serialisierbare
 * Daten — keine Funktionen über die Grenze (Falle 9).
 *
 * DER FILTER LIEGT IM ZUSTAND, NICHT IN DER ADRESSE, und das ist der Unterschied
 * zu `feedback/_ui/Segment.tsx`, wo dieselbe Bauform `?monate=` schreibt: dort
 * entscheidet die Wahl, WELCHE DATEN der Server holt, hier blendet sie in einer
 * bereits vollständig gelieferten Liste etwas aus. Ein Server-Umlauf für eine
 * Sichtfrage wäre eine Rechteprüfung mehr für nichts.
 */
export function NeuigkeitenListe({ neuigkeiten }: { neuigkeiten: Neuigkeit[] }) {
  const [modul, setModul] = useState<string>(ALLE);

  /**
   * Die Filterknöpfe kommen aus den vorhandenen Notizen, nicht aus der Registry:
   * ein Knopf für eine App ohne Notiz führte auf eine leere Liste. Reihenfolge =
   * Reihenfolge des ersten Auftretens, also nach Datum — die zuletzt geänderte
   * App steht vorn.
   *
   * `apps` und nicht `module`: `@next/next/no-assign-module-variable` verbietet
   * den Bezeichner, weil er in CommonJS-Modulen `module.exports` verdeckt.
   */
  const apps = useMemo(() => {
    const gesehen = new Map<string, string>();
    for (const n of neuigkeiten) if (!gesehen.has(n.modul)) gesehen.set(n.modul, n.modulTitel);
    return [...gesehen.entries()];
  }, [neuigkeiten]);

  const sichtbar = useMemo(
    () => (modul === ALLE ? neuigkeiten : neuigkeiten.filter((n) => n.modul === modul)),
    [neuigkeiten, modul],
  );

  // Kein Filter über einer leeren Liste — dieselbe Reihenfolge wie im
  // Kachelraster, wo der Leerzustand vor dem Suchfeld steht. `Result
  // status="info"` und kein `Alert type="error"`: hier fehlt nichts, hier ist
  // schlicht noch nichts passiert (Falle 3).
  if (neuigkeiten.length === 0) {
    return (
      <Result
        data-testid="neuigkeiten-leer"
        status="info"
        title="Hier steht noch nichts"
        subTitle="Sobald sich an einer deiner Apps etwas ändert, findest du es an dieser Stelle."
      />
    );
  }

  return (
    <div
      data-testid="neuigkeiten"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      {apps.length > 1 ? (
        /* `overflowX` am Wickel, nicht am Schalter: `Segmented` hat kein
           eigenes Rollverhalten, und bei fünf Apps auf 390px stünde die Zeile
           sonst über den Rand hinaus. `alignSelf` hält den Schalter auf seiner
           Inhaltsbreite, statt ihn über die ganze Spalte zu ziehen. */
        <div
          data-testid="neuigkeiten-filter"
          style={{ overflowX: "auto", alignSelf: "flex-start", maxWidth: "100%" }}
        >
          <Segmented
            value={modul}
            onChange={(wert) => setModul(String(wert))}
            options={[
              { value: ALLE, label: "Alle" },
              ...apps.map(([key, titel]) => ({ value: key, label: titel })),
            ]}
          />
        </div>
      ) : null}

      {sichtbar.map((n) => {
        const Icon = ICONS[n.icon] ?? AppstoreOutlined;
        return (
          // `id` = Sprungmarke: `/neuigkeiten#checkliste-als-pdf` führt auf
          // genau diese Notiz, und damit lässt sich eine einzelne Änderung
          // verschicken, ohne sie abzuschreiben.
          <Card key={n.slug} id={n.slug} data-testid="notiz" data-modul={n.modul}>
            <div
              style={{
                ...SCHRIFT.kicker,
                color: "var(--iuk-gedaempft)",
                display: "flex",
                alignItems: "center",
                gap: SPACE.sm,
                marginBlockEnd: SPACE.xs,
              }}
            >
              <Icon aria-hidden="true" />
              <span>{n.modulTitel}</span>
              <span aria-hidden="true">·</span>
              {/* `<time>` mit Maschinendatum: die Anzeige ist ausgeschrieben
                  („16. August 2026"), der Wert bleibt sortier- und lesbar. */}
              <time dateTime={n.datum}>{formatiereDatum(n.datum)}</time>
            </div>

            {/* Nacktes `<h2>` mit Typo-Rolle statt `Typography.Title`: die Seite
                trägt schon ein `<h1>` im `Seitenkopf`, und die Notizen sind
                dessen zweite Ebene. */}
            <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.md}px` }}>{n.titel}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
              {n.inhalt.map((block, i) => (
                <NotizBlock key={i} block={block} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Ein Block, eine Darstellung. Der `default`-Zweig ist kein toter Code, sondern
 * die Stelle, an der eine neue Blockart in `typen.ts` sofort auffällt: `never`
 * macht sie zu einem Typfehler, lange bevor jemand eine Notiz damit schreibt.
 */
function NotizBlock({ block }: { block: Notizblock }) {
  switch (block.art) {
    case "absatz":
      // `72ch` wie im `Seitenkopf`: eine Zeile, die über die volle Breite eines
      // Bildschirms läuft, verliert beim Zeilenwechsel den Anschluss.
      return <p style={{ ...SCHRIFT.text, maxWidth: "72ch", margin: 0 }}>{block.text}</p>;
    case "liste":
      return (
        <ul style={{ ...SCHRIFT.text, maxWidth: "72ch", margin: 0, paddingInlineStart: SPACE.xl }}>
          {block.punkte.map((punkt, i) => (
            <li key={i}>{punkt}</li>
          ))}
        </ul>
      );
    case "hinweis":
      // `type="info"` und ausdrücklich nicht `"error"`/`"warning"`: der Hinweis
      // sagt, was zu tun ist, und meldet keine Störung. Die Fehlerfarbe IST
      // ohnehin die Primärfarbe (Falle 3) — ein roter Kasten hier läse sich wie
      // eine Aufforderung, die etwas kaputtmacht.
      // `title` und nicht `message`: antd 6 hat `message` zwar noch, meldet es
      // aber zur Laufzeit als veraltet — eine Warnung, die in der CI steht und
      // niemandem nützt.
      return <Alert type="info" showIcon title={block.text} data-testid="notiz-hinweis" />;
    default: {
      const unbekannt: never = block;
      throw new Error(`Unbekannte Blockart in einer Release Note: ${JSON.stringify(unbekannt)}`);
    }
  }
}
