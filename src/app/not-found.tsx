import { headers } from "next/headers";
import { connection } from "next/server";
import { Button } from "antd";
import { Ruhezustand } from "@/core/ruhe";
import { resolveHost } from "@/core/routing";
import { leseZugangsauskunft, modulWurzelOffen, portalUrl } from "./_lib/zugangsseite";
import { Zugangszeilen } from "./_lib/Zugangszeilen";
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
 * 404 ist in dieser Suite nicht nur "gibt es nicht", sondern auch "darfst du
 * nicht sehen": mehrere Riegel (`requireFeedbackAccess`, `assertGroupAccess`,
 * der Gruppenvergleich) werfen bewusst `notFound()` statt eines 403, damit die
 * blosse Existenz einer Seite nicht verraten wird. Der Satz bleibt deshalb
 * neutral ("hier"), ohne zu verraten, welcher Fall vorliegt.
 *
 * HAARLINIE (IDA-347, Etappe 3): ein Ruhezustand mit Figur (`core/ruhe`, Lage
 * `fehlt`), der Satz als einzige Ueberschrift, ein Weg zurueck, die Ziffer
 * leise darunter. Status 404 setzt Next.js; die Ziffer ist Schmuck.
 *
 * KEINE SCHLEIFE (IDA-392): wer angemeldet ist und die Modulwurzel nicht sehen darf, bekam von
 * „Zur Startseite" dieselbe Seite wieder. Dann fuehrt der Weg ins Portal (`modulWurzelOffen`), und
 * darunter steht, mit welchem Konto man angemeldet ist und wen man um einen Zugang fragt.
 */
export default async function NotFound() {
  await connection();
  const host = resolveHost(await headers());
  const auskunft = await leseZugangsauskunft();
  const zurStartseite = auskunft.gruppen === null || modulWurzelOffen(host, auskunft.gruppen);
  return (
    <main className={styles.seite}>
      <Ruhezustand
        figur="fehlt"
        als="h1"
        mittig
        titel="Diese Seite gibt es hier nicht."
        aktion={
          /*
           * `/` und nicht der Suite-Host: unter dem Host-Rewrite
           * (`core/routing.ts`) fuehrt der relative Pfad zum Anfang GENAU DES
           * Moduls, auf dem man gerade steht — und auf dem Suite-Host zum
           * Portal. Ein absoluter Link koennte beides nicht zugleich.
           *
           * Kein `size` (Falle 4).
           */
          zurStartseite ? (
            <Button type="primary" href="/">
              Zur Startseite
            </Button>
          ) : (
            <Button type="primary" href={portalUrl()}>
              Zum Portal
            </Button>
          )
        }
      />
      <Zugangszeilen auskunft={auskunft} oderZugang />
      <p className={styles.ziffer} aria-hidden="true">
        404
      </p>
    </main>
  );
}
