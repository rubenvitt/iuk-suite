"use client";

import { useMemo, useState } from "react";
import { Card, Col, Empty, Input, Result, Row } from "antd";

import { KACHEL_GRUND, TINTE } from "@/core/favicon/zeichen";
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";
import type { LauncherEintrag } from "@/core/shell/types";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS PORTAL ALS VOLLFLÄCHIGE ANSICHT DERSELBEN LISTE, die der Umschalter als
 * Popover zeigt. Eine Wahrheit, zwei Darstellungen.
 *
 * Client-Insel, aus zwei Gründen zugleich: die Suche braucht Zustand, und die
 * Icons dürfen nur hier auflösen (`@ant-design/icons` in RSC ist HTTP 500
 * schon beim Import, Falle 7). Die Seite darüber bleibt Server Component und
 * übergibt fertige Daten.
 *
 * KEIN `Alert type="error"` im Leerzustand: `colorError === colorPrimary ===
 * #c8000f`, ein fehlender Zugang sähe damit aus wie eine Primäraktion — und
 * er ist keine Störung, sondern eine Auskunft (Falle 3).
 */
export function DiensteRaster({
  eintraege,
  ansprechpartner,
}: {
  eintraege: LauncherEintrag[];
  ansprechpartner: string | null;
}) {
  const [suche, setSuche] = useState("");

  const abschnitte = useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    const gefiltert = nadel
      ? eintraege.filter(
          (e) =>
            e.title.toLowerCase().includes(nadel) ||
            (e.beschreibung?.toLowerCase().includes(nadel) ?? false),
        )
      : eintraege;
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of gefiltert) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [eintraege, suche]);

  // Nichts freigeschaltet — nicht dasselbe wie „Suche ohne Treffer". Deshalb
  // steht dieser Zweig VOR dem Suchfeld: ein Suchfeld über einer leeren Liste
  // lädt zu einer Suche ein, die nichts finden kann.
  if (eintraege.length === 0) {
    return (
      <Result
        data-testid="portal-leer"
        status="info"
        title="Für dich ist noch nichts freigeschaltet"
        subTitle={
          <>
            <p>
              Welche Apps und Dienste du siehst, hängt an deinen Gruppen — im Moment passt keine
              davon zu etwas, das hier steht. Wenn du gerade erst freigeschaltet wurdest: melde
              dich einmal ab und wieder an. Neue Gruppen kommen mit der Anmeldung und werden sonst
              erst nach bis zu einer Stunde von selbst nachgezogen.
            </p>
            {ansprechpartner ? (
              <p data-testid="portal-kontakt">
                <strong>Ansprechpartner:</strong> {ansprechpartner}
              </p>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <div
      data-testid="portal-grid"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      <Input
        data-testid="portal-suche"
        type="search"
        value={suche}
        placeholder="Apps und Dienste durchsuchen"
        aria-label="Apps und Dienste durchsuchen"
        onChange={(e) => setSuche(e.target.value)}
        style={{ maxInlineSize: 420 }}
      />

      {abschnitte.length === 0 ? (
        <Empty data-testid="portal-ohne-treffer" description={`Nichts gefunden für „${suche}“.`} />
      ) : (
        abschnitte.map(([titel, liste]) => (
          <section key={titel}>
            {/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den Kontrast
                unprüfbar mit und hat keinen Dunkelzweig (übernommen aus der
                Typografie-Runde, die diese Seite zuletzt angefasst hat). */}
            <h2
              data-testid="portal-abschnitt"
              style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}
            >
              {titel}
            </h2>
            <Row gutter={[SPACE.lg, SPACE.lg]}>
              {liste.map((e) => {
                const zeichen = e.icon ?? "link";
                return (
                  <Col key={e.key} xs={12} sm={8}>
                    {/* Der Link liegt AUSSEN: antds Card rendert kein <a>, und
                        die Kachel ist die einzige Navigation ins Ziel. */}
                    <a
                      href={e.href}
                      target={e.extern ? "_blank" : undefined}
                      rel={e.extern ? "noopener noreferrer" : undefined}
                      data-testid="service-tile"
                      className="portal-kachel-link"
                      style={{ display: "block", blockSize: "100%" }}
                    >
                      {/* Die beiden Klassen tragen die Kachelkante und den
                          Fokusabgriff aus `portal.css` — `e2e/portal.spec.ts`
                          misst sie in Ruhe und im Hover, und die Kaskade
                          dahinter besitzt kein Quelltext-Scan. Ohne sie fällt
                          der Test, nicht der Build.

                          KEIN Kicker mit `e.abschnitt` auf der Kachel: die
                          Rubrik steht jetzt als Abschnittsüberschrift darüber,
                          und zweimal dasselbe Wort wäre Dekoration im Gewand
                          von Struktur. */}
                      <Card
                        hoverable
                        size="small"
                        className="portal-kachel"
                        style={{ blockSize: "100%" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                          {!e.extern ? (
                            <AppZeichen url={e.appIconUrl} zeichen={zeichen} />
                          ) : e.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={e.iconUrl}
                              alt=""
                              width={20}
                              height={20}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          ) : (
                            <Icons8Ikone name={zeichen} />
                          )}
                          {/* Ein Flex-Kind schrumpft nie unter sein längstes
                              Wort: ohne `minInlineSize: 0` lief „Kommunikations-
                              pläne“ auf dem Telefon aus der Kachel. Getrennt wird
                              an der Silbe (`lang="de"`), sonst hart. */}
                          <span
                            data-testid="kachel-titel"
                            style={{
                              ...SCHRIFT.unterTitel,
                              minInlineSize: 0,
                              overflowWrap: "anywhere",
                              hyphens: "auto",
                            }}
                          >
                            {e.title}
                          </span>
                        </div>
                        {e.beschreibung ? (
                          <div
                            style={{
                              ...SCHRIFT.neben,
                              color: "var(--iuk-gedaempft)",
                              marginBlockStart: SPACE.xs,
                            }}
                          >
                            {e.beschreibung}
                          </div>
                        ) : null}
                      </Card>
                    </a>
                  </Col>
                );
              })}
            </Row>
          </section>
        ))
      )}
    </div>
  );
}

/** Kante des App-Icons auf der Kachel; der Radius ist der der Kachel im Icon (112/512). */
const APP_ZEICHEN = 40;
const APP_RADIUS = Math.round((APP_ZEICHEN * 112) / 512);

/*
 * DAS APP-ICON EINES SUITE-MODULS — dasselbe wie auf dem Startbildschirm
 * (`core/favicon/app-icon.ts`). Module ohne eigenes Zeichen bekommen ihr
 * Icons8-Zeichen auf derselben Kachel, damit die Reihe der Apps einheitlich
 * bleibt.
 *
 * Die Kachel ist in beiden Themen weiß, wie das Icon selbst — es ist ein
 * eingebranntes Bild, kein Bedienelement. Die Haarlinie in `--iuk-linie` hebt
 * sie im hellen Thema von der weißen Card ab.
 */
function AppZeichen({ url, zeichen }: { url?: string; zeichen: Icons8Name }) {
  const rahmen = {
    inlineSize: APP_ZEICHEN,
    blockSize: APP_ZEICHEN,
    flex: "none",
    borderRadius: APP_RADIUS,
    boxShadow: "0 0 0 1px var(--iuk-linie)",
  } as const;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img data-testid="app-zeichen" src={url} alt="" width={APP_ZEICHEN} height={APP_ZEICHEN} style={rahmen} />
    );
  }
  return (
    <span
      data-testid="app-zeichen"
      style={{
        ...rahmen,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: KACHEL_GRUND,
        color: TINTE,
      }}
    >
      <Icons8Ikone name={zeichen} groesse={24} />
    </span>
  );
}
