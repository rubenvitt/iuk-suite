import Link from "next/link";
import { HILFE_SICHTEN, type HilfeSicht } from "../../_lib/hilfe";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { SeitenKopf } from "../SeitenKopf";
import { Mechanikbild } from "./Bilder";
import { Skizze } from "./Skizze";
import s from "../aufgaben.module.css";

/*
 * EIN KAPITEL DER ANLEITUNG — die Darstellung einer `HilfeSicht` (`_lib/hilfe.ts`).
 *
 * ══ DIE REIHENFOLGE DER ABSCHNITTE IST DIE REIHENFOLGE DER FRAGEN, DIE JEMAND VOR EINER FREMDEN
 *    FLAECHE STELLT: „wo bin ich hier" (die Skizze), „was tue ich" (die Schritte), „wie haengt das
 *    zusammen" (die Bilder), „warum geht das nicht" (die Grenzen). Ein Handbuch, das mit der
 *    Begriffsklaerung anfaengt, wird an der zweiten Ueberschrift weggelegt.
 *
 * ══ SERVER COMPONENT, KEIN "use client": diese Seite ist Text und SVG, sie hat keinen Zustand.
 *    Damit gilt Falle 1 (kein Compound-Zugriff auf antd) und Falle 9 (keine Funktion ueber die
 *    RSC-Grenze) — beides ist hier strukturell erfuellt, weil ausser `SeitenKopf` (und dessen
 *    `Breadcrumb` mit `items`) gar keine antd-Komponente vorkommt.
 *
 * ══ `<h2>` UND `<h3>` SIND NATIVES HTML mit `SCHRIFT`-Rollen, nie `Typography.Title` (Falle 1,
 *    modulweiter Quelltext-Scan in `SeitenKopf.test.tsx`).
 */
export function HilfeKapitel({
  sicht,
  zielHref,
}: {
  sicht: HilfeSicht;
  /** Die Adresse der beschriebenen Sicht — `null`, wo es keine gibt (`/a/<id>`). */
  zielHref: string | null;
}) {
  return (
    <>
      <SeitenKopf
        brotkrume={[
          { label: "Aufgaben", href: "/" },
          { label: "Anleitung", href: "/hilfe" },
          { label: sicht.titel },
        ]}
        titel={sicht.titel}
        kontext={sicht.wofuer}
        aktionen={zielHref ? <Link href={zielHref}>Sicht öffnen</Link> : undefined}
      />

      <p className={s.hilfeMarke}>Für {sicht.fuer}</p>

      {zielHref === null && sicht.ziel.art === "kein" ? (
        <p style={{ ...SCHRIFT.text, marginBlockEnd: SPACE.xl, maxWidth: 640 }}>
          <strong>So kommst du hin:</strong> {sicht.ziel.hinweis}
        </p>
      ) : null}

      <section style={{ marginBlockEnd: SPACE.xxl }}>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Aufbau der Sicht
        </h2>
        <Skizze titel={sicht.titel} bloecke={sicht.skizze} />
      </section>

      <section style={{ marginBlockEnd: SPACE.xxl }}>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Schritt für Schritt
        </h2>
        <ol className={s.hilfeSchritte} style={{ maxWidth: 640 }}>
          {sicht.schritte.map((schritt) => (
            <li key={schritt.titel}>
              <strong>{schritt.titel}</strong>
              <span>{schritt.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {sicht.bilder.length > 0 ? (
        <section style={{ marginBlockEnd: SPACE.xxl }}>
          <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
            Wie es zusammenhängt
          </h2>
          <div className={s.hilfeBilder}>
            {sicht.bilder.map((bild) => (
              <Mechanikbild key={bild} name={bild} />
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginBlockEnd: SPACE.xxl }}>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Was hier nicht geht — und warum
        </h2>
        <ul className={s.hilfeGrenzen} style={{ maxWidth: 640 }}>
          {sicht.grenzen.map((grenze) => (
            <li key={grenze}>{grenze}</li>
          ))}
        </ul>
      </section>

      {sicht.verweise.length > 0 ? (
        <section>
          <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
            Weiterlesen
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
            {sicht.verweise.map((schluessel) => (
              <Link key={schluessel} href={`/hilfe/${schluessel}`} className={s.leiseLink}>
                {HILFE_SICHTEN[schluessel].titel}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
