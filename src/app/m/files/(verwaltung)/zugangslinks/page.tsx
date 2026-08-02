import { headers } from "next/headers";
import { desc } from "drizzle-orm";

import { getDb } from "../../_db/client";
import { zugangslinks } from "../../_db/schema";
import { hostFuerRolle, oeffentlicheUrl } from "../../_lib/hostRolle";
import { entschaerfeTitel } from "../../_lib/zip";
import { zeitpunktBerlin } from "../../_lib/zeit";
import { ZugangslinksListe, type ZugangslinkZeile } from "../../_ui/ZugangslinksListe";

/**
 * DIE ABGABELINK-SEITE (Spec §8.6, §10.1; Plan T39).
 *
 * SIE LAEDT UND RECHNET, DIE INSEL BEDIENT. Alles, was an einer Uhr oder an der
 * Host-Konfiguration haengt, entsteht HIER — Zustand, Laufzeit, Restbudget,
 * Adresse. Der Client bekommt fertige Zeichenketten:
 *
 *  - `expires_at` und `created_at` fuehren SEKUNDEN (`mode: "timestamp"`,
 *    `_db/schema.ts`). Drizzle liefert `Date`-Objekte; hier wird deshalb NIE mit
 *    1000 multipliziert oder geteilt. Ein Faktor-1000-Fehler waere still: 24
 *    Stunden saehen als 24 Sekunden immer noch nach einer plausiblen Zahl aus.
 *  - Der ZUSTAND haengt an einer Uhr. Rechnete ihn der Browser, entschieden
 *    Server und Client an der Ablaufsekunde verschieden — die Zeile stuende dann
 *    auf „gueltig", waehrend jede Abgabe abgewiesen wird.
 *
 * KEIN EIGENER ZUGRIFFSRIEGEL, und das ist entschieden: diese Seite liegt IN
 * der Route-Group `(verwaltung)`, deren Layout `requireRolle("verwaltung")` und
 * `requireFilesAccess()` als erste Anweisungen traegt. Die Wurzelseite
 * `page.tsx` ruft beides ein zweites Mal, weil sie AUSSERHALB aller Groups liegt
 * und das Group-Layout fuer sie nicht greift (§3.5) — hier greift es.
 *
 * `select()` OHNE ARGUMENT IST IM MODUL NICHT ERLAUBT: die Spalten werden
 * aufgezaehlt, damit `token_hash` die Datenbank gar nicht erst verlaesst. Die
 * Alt-App selektierte alles, spreadete es und uebergab es an eine
 * Client-Komponente (Analyse Falle 11).
 */

/**
 * Die Einheit steht im NAMEN, nicht in einem Kommentar (§9.1). `Date.getTime()`
 * liefert MILLISEKUNDEN — die Spalte fuehrt Sekunden, Drizzle rechnet um.
 */
const MILLISEKUNDEN_PRO_STUNDE = 60 * 60 * 1000;

/**
 * BINAERE Praefixe, und das Wort dazu. Die Budget-Vorbelegung ist
 * `2 * 1024 * 1024 * 1024` (`_lib/grenzen.ts`) — eine Beschriftung „2,1 GB"
 * waere dieselbe Zahl unter einem anderen Namen, und genau dieses Paar (MiB
 * gegen MB, Faktor 1,048576) ist im Modul `files` schon einmal teuer geworden.
 */
const BYTE_EINHEITEN = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

function byteText(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN[stufe]}`;
}

export default async function FilesZugangslinksSeite() {
  const kopfzeilen = await headers();

  /*
   * ERST FRAGEN, DANN BAUEN. `oeffentlicheUrl` WIRFT, wenn die Rolle keinen Host
   * hat — der Aufrufer muss den Zustand vorher abfragen (`hostRolle.ts`). Genau
   * dieser Fall ist der benannte Zustand aus §8.6: vor dem zweiten Cutover gibt
   * es keinen Link und keinen QR, sondern einen Satz, der sagt warum.
   */
  const inboxBasis = hostFuerRolle("inbox") === null ? null : oeffentlicheUrl("inbox", "", kopfzeilen);

  // EINE Uhr fuer alle Zeilen: zwei `new Date()` in einer Schleife liegen an
  // einer Sekundengrenze auseinander, und zwei gleich alte Links stuenden dann
  // in verschiedenen Zustaenden.
  const jetzt = new Date();

  const rohe = getDb()
    .select({
      id: zugangslinks.id,
      name: zugangslinks.name,
      tokenStart: zugangslinks.tokenStart,
      createdAt: zugangslinks.createdAt,
      expiresAt: zugangslinks.expiresAt,
      revokedAt: zugangslinks.revokedAt,
      budgetDateien: zugangslinks.budgetDateien,
      budgetBytes: zugangslinks.budgetBytes,
      verbrauchtDateien: zugangslinks.verbrauchtDateien,
      verbrauchtBytes: zugangslinks.verbrauchtBytes,
    })
    .from(zugangslinks)
    .orderBy(desc(zugangslinks.createdAt), desc(zugangslinks.id))
    .all();

  const zeilen: ZugangslinkZeile[] = rohe.map((roh) => ({
    id: roh.id,
    name: roh.name,
    tokenStart: roh.tokenStart,
    laufzeitText: `${Math.round(
      (roh.expiresAt.getTime() - roh.createdAt.getTime()) / MILLISEKUNDEN_PRO_STUNDE,
    )} h`,
    /* Die Zeitzone steht im NAMEN und nur EINMAL, in `_lib/zeit.ts`. Ohne feste
       Zone formatierte `Intl` in der Zone des Serverprozesses — im Container
       UTC, also zwei Stunden vor der Berliner Wanduhr. Die Laufzeit darueber
       ist davon unberuehrt: sie ist eine DIFFERENZ zweier Zeitpunkte und
       zonenfrei. */
    ablaufText: zeitpunktBerlin(roh.expiresAt),
    /*
     * DER WIDERRUF GEWINNT ueber den Ablauf. Beides kann zugleich zutreffen, und
     * „widerrufen" ist die Aussage ueber eine ENTSCHEIDUNG; „abgelaufen" ist nur
     * Zeitablauf. Ein widerrufener Link, der nach seiner Laufzeit als
     * „abgelaufen" erschiene, verlöre genau die Nachvollziehbarkeit, für die
     * `revoked_at` gegen das Zeilenlöschen eingetauscht wurde (§8.6).
     */
    zustand:
      roh.revokedAt !== null
        ? "widerrufen"
        : roh.expiresAt.getTime() <= jetzt.getTime()
          ? "abgelaufen"
          : "gueltig",
    budgetDateien: roh.budgetDateien,
    // Nie negativ: das Budget ist nachtraeglich senkbar-frei, aber ein
    // Wettlauf-Update kann `verbraucht` an die Grenze schieben — „-1 Dateien"
    // waere eine Zahl, die niemand deuten kann.
    restDateien: Math.max(0, roh.budgetDateien - roh.verbrauchtDateien),
    budgetBytesText: byteText(roh.budgetBytes),
    restBytesText: byteText(Math.max(0, roh.budgetBytes - roh.verbrauchtBytes)),
    uploads: roh.verbrauchtDateien,
    /*
     * Die Entschaerfung 1:1 aus `_lib/zip.ts` — und sie laeuft HIER, nicht in
     * der Insel: `zip.ts` zieht ueber `_lib/av.ts` `node:net` nach, und ein
     * Import von dort in ein `"use client"`-Modul truege das ins Client-Bundle.
     */
    qrDateiname: `${entschaerfeTitel(roh.name)}-qr.png`,
  }));

  return <ZugangslinksListe zeilen={zeilen} inboxBasis={inboxBasis} />;
}
