import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "antd";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { eigeneZeichenVon } from "../../_db/eigeneZeichen";
import { KATALOG_STAND } from "../../_lib/katalog";

export const dynamic = "force-dynamic";

/*
 * MEINE ZEICHEN — eine reine Server Component.
 *
 * ⛔ DAS GESPEICHERTE SVG WIRD ALS `<img src="data:image/svg+xml;base64,…">`
 * GERENDERT, NIEMALS MIT `dangerouslySetInnerHTML`. Es ist vom Client geliefertes
 * Markup, das die Server Action fachlich nicht nachpruefen kann (§6.6) — der
 * Vertrag im Repo lautet an beiden Praezedenzstellen, dass nur SERVERSEITIG
 * erzeugtes Markup so eingesetzt wird. In einem `<img>` fuehrt ein SVG kein Script
 * aus und laedt nichts nach. Die Formpruefung beim Speichern ist Hygiene; der
 * Riegel ist dieses `<img>`. Die Katalog-Detailseite rendert weiter mit
 * `dangerouslySetInnerHTML`, weil ihr SVG aus dem eingecheckten Generat stammt.
 *
 * ⛔ `session.user.id` IST der Pocket-ID-`sub`, aber der Typ luegt: @auth/core baut
 * `user` ohne `id`. Deshalb die ausdrueckliche Pruefung — TypeScript sieht das
 * nicht. Auf einer Seite ist der richtige Ausgang `notFound()`.
 *
 * KEIN `next/image`: das Bild ist eine `data:`-URL im Markup, es gibt nichts zu
 * optimieren und keinen Loader, der sie annaehme.
 */
export default async function MeineSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const meine = eigeneZeichenVon(getDb(), sub);

  return (
    <>
      <Seitenkopf
        titel="Meine Zeichen"
        beschreibung={`${meine.length} gespeichert. Bearbeiten öffnet sie im Baukasten.`}
      />
      {meine.length === 0 ? (
        <Card>
          <p style={SCHRIFT.text} data-testid="tz-meine-leer">
            Hier stehen die Zeichen, die du im Baukasten speicherst. Noch ist nichts dabei.
          </p>
          <Link href="/m/zeichen/baukasten" style={SCHRIFT.text}>
            Zum Baukasten
          </Link>
        </Card>
      ) : (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: SPACE.md }}
          data-testid="tz-meine-liste"
        >
          {meine.map((z) => (
            <Card key={z.id} style={{ width: 240 }} data-testid={`tz-meines-${z.id}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data:-URL, kein Loader */}
              <img
                src={`data:image/svg+xml;base64,${Buffer.from(z.svg, "utf8").toString("base64")}`}
                alt={z.name}
                width={160}
                height={160}
              />
              <h2 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>{z.name}</h2>
              {/*
                Ein eigenes Zeichen bleibt IMMER sichtbar — das Bild ueberlebt jede
                Katalogaenderung (Spec §4.6, Stufe 2). Nur das Bearbeiten kann
                fehlschlagen, deshalb steht der Stand dabei, gegen den es einmal
                gueltig war.
              */}
              <p style={{ ...SCHRIFT.neben, margin: 0 }}>
                Gespeichert mit Paket {z.paketVersion}, Daten {z.datenVersion}
                {z.paketVersion === KATALOG_STAND.paket ? "" : " — heute gilt ein neuerer Stand"}
              </p>
              {/*
                `v=` REICHT DIE GESPEICHERTE PAKETFASSUNG MIT (Spec §4.6 Stufe 2):
                laesst sich die Zusammenstellung heute nicht mehr zeichnen, sagt die
                Insel WOMIT sie einmal gespeichert wurde. Ohne die Angabe sagt die
                Meldung nicht, warum es heute nicht mehr geht.

                `Buffer.from(...).toString("base64url")` ist byteweise dasselbe wie
                `kodiereSpec` im Browser — `zustand.test.ts` haelt beide Wege
                gegeneinander.
              */}
              <Link
                style={SCHRIFT.text}
                data-testid={`tz-meines-oeffnen-${z.id}`}
                href={
                  `/m/zeichen/baukasten?s=${Buffer.from(z.specJson, "utf8").toString("base64url")}` +
                  `&v=${encodeURIComponent(z.paketVersion)}`
                }
              >
                Im Baukasten öffnen
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
