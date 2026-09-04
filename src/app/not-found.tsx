import { Button } from "antd";
import styles from "./not-found.module.css";

/**
 * DIE 404-SEITE DER SUITE — an der Wurzel, also fuer jedes Modul dieselbe.
 *
 * Next.js sucht die naechstgelegene `not-found.tsx` nach oben. Weil es nur
 * diese eine gibt, liegt die Grenze direkt unter dem Root-Layout: alle
 * Modul-Layouts werden ersetzt, die Seite erscheint ohne Shell und ohne
 * Modulnavigation. Das ist hier die richtige Form — die Navigation eines
 * Moduls, das man womoeglich gar nicht betreten darf, gehoert nicht auf eine
 * Seite, die genau das mitteilt. Die Theme-Provider aus dem Root-Layout
 * (`AntdProvider`, `data-theme` am `<html>`) gelten dagegen weiter, also
 * traegt der Knopf das Suite-Theme und die Seite beide Modi.
 *
 * WARUM DER ZWEITE ABSATZ DA STEHT. 404 ist in dieser Suite nicht nur "gibt es
 * nicht", sondern auch "darfst du nicht sehen": mehrere Riegel
 * (`requireFeedbackAccess`, `assertGroupAccess`, der Gruppenvergleich) werfen
 * bewusst `notFound()` statt eines 403, damit die blosse Existenz einer Seite
 * nicht verraten wird. Diese Entscheidung bleibt — aber sie darf niemanden im
 * Dunkeln stehen lassen. Der Absatz nennt den Fall, ohne fuer den Einzelfall zu
 * verraten, welcher der beiden gerade vorliegt.
 *
 * Alles Sichtbare ausser dem Knopf ist eigenes Markup und faerbt sich aus
 * `not-found.module.css` ueber `--nf-*`; `--ant-*` waere hier still wirkungslos
 * (siehe Kopf jener Datei).
 */
export default function NotFound() {
  return (
    <main className={styles.seite}>
      <div className={styles.karte}>
        <p className={styles.ziffer} aria-hidden="true">
          404
        </p>
        <span className={styles.flagge} aria-hidden="true" />
        <h1 className={styles.titel}>Diese Seite gibt es hier nicht.</h1>
        <p className={styles.text}>
          Vielleicht ist der Link veraltet, vielleicht hat die Adresse einen
          Tippfehler.
        </p>
        <p className={styles.text}>
          Möglich ist auch, dass die Seite deinem Konto nicht offensteht: Was
          nicht freigegeben ist, sieht hier genauso aus wie etwas, das es nicht
          gibt. Wenn du sie eigentlich brauchst, wende dich an die
          Administration.
        </p>
        <div className={styles.aktion}>
          {/*
           * `/` und nicht der Suite-Host: unter dem Host-Rewrite
           * (`core/routing.ts`) fuehrt der relative Pfad zum Anfang GENAU DES
           * Moduls, auf dem man gerade steht — und auf dem Suite-Host zum
           * Portal. Ein absoluter Link koennte beides nicht zugleich.
           *
           * Kein `size`: `controlHeight` ist 56 und damit schon das richtige
           * Mass (docs/design/README.md).
           */}
          <Button type="primary" href="/">
            Zur Startseite
          </Button>
        </div>
      </div>
    </main>
  );
}
