import Link from "next/link";
import { redirect } from "next/navigation";
import { bereichsAbweisung, startPfad } from "../_lib/helferBereich";
import { requireHelferSitzung } from "../_lib/helferZugang";
import { sitzungsEtikett } from "../_lib/zugangHerkunft";
import { artikelListe } from "../_lib/lesepfade/artikel";
import { bestandJeArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { aktiverSchrank } from "../_lib/lesepfade/orte";
import { einWert } from "../_lib/suchparameter";
import { getDb } from "../_db/client";
import { HelferRahmen } from "../_ui/HelferRahmen";
import { ArtikelSuche } from "../_ui/ArtikelSuche";
import s from "../_ui/helfer.module.css";

/**
 * DIE ARTIKELLISTE — §7.2.2.
 *
 * Host und Sitzungsriegel kommen aus `helfer/layout.tsx`. Der zweite Aufruf von
 * `requireHelferSitzung` hier ist KEINE Doppelpruefung aus Misstrauen: ein
 * Layout kann einer Seite keine Props reichen, und `sitzungsetikett` und
 * `laeuftAb` kommen genau von dort (§7.8.2). Er ist billig — dasselbe gecachte
 * Handle (§5.13.2), derselbe Primaerschluessel-Lookup auf `tokens.id`.
 *
 * ⚠️ DIE ZUSAGE AUS TEIL 2 IST HIERMIT UEBERHOLT (Befund 38 des
 * Preflight-Scans). Der `Produces`-Block von T25
 * (`plans/2026-08-03-lagerbuch-modul-teil2.md:4977`) nennt `helfer/layout.tsx`
 * als einzigen Konsumenten von `requireHelferSitzung („nur dort")`. Teil 4 hat
 * drei: dieses Layout, diese Seite und `helfer/check/page.tsx`. Der Grund ist
 * der Absatz darueber — ein Layout reicht einer Seite keine Props, und die
 * Aktivmarkierung des Rahmens ist ein SERVER-Prop (Falle 63), kein
 * `usePathname`. Teil 2 wurde nie nachgezogen; wer ihn als Vertrag liest, haelt
 * den zweiten und dritten Aufruf sonst fuer einen Fehler.
 *
 * ⚠️ KEIN `requireLagerbuchHost` — der Riegel ruft ihn INTERN als erste
 * Anweisung (§2.24). Falle 17 gilt trotzdem: dass diese Seite den Riegel
 * ueberhaupt selbst ruft, ist die tragende Zusage, nicht die Route-Group. Das
 * ist der Grund, warum `page.test.tsx` sie OHNE Layout auf fremdem Host rendert.
 */
export const dynamic = "force-dynamic";

export default async function HelferSeite({
  searchParams,
}: {
  /**
   * IDA-295 — `ort` SETZT DIE LANDUNG NACH DEM SCAN EINES SCHRANK-ETIKETTS
   * (`schrankPfad`, `_lib/helferBereich.ts`). Er wird gegen die Datenbank
   * aufgeloest (`aktiverSchrank`); was dort kein aktiver Schrank ist, zeigt den
   * ganzen Handlager wie bisher. `string | string[]` aus demselben Grund wie
   * auf der Check-Seite: das ist Nexts Laufzeitwert.
   */
  searchParams?: Promise<{ ort?: string | string[] }>;
} = {}) {
  const roh = (await searchParams) ?? {};
  const db = getDb();
  const zugang = await requireHelferSitzung(db);

  /*
   * DIE KARTE AN DER EINHEIT UND DIE AN DER BOX KOMMEN HIER NICHT HEREIN —
   * DRK-417, und das ist die Haelfte des Tickets, die man am leichtesten
   * vergisst: bis hierher war die Entnahme der EINE Bereich ohne Riegel, weil
   * jeder Zugang sie durfte.
   *
   * ⚠️ ER STEHT VOR `artikelListe`, nicht dahinter. Diese Seite legt den
   * gesamten Handlagerbestand in den RSC-Payload; eine Umleitung DANACH haette
   * ihn fuer einen Zugang geladen, der ihn nicht bekommen soll (§3.4.5) — und
   * zwar sichtbar erst im Netzwerkteil, nie auf dem Schirm.
   *
   * ⚠️ UEBER `bereichsAbweisung` UND NICHT UEBER `zugang.reichweite` DIREKT:
   * die Funktion schreibt den `access_denied`-Eintrag mit dem Akteur. Ein
   * direkter Feldzugriff liesse die Umleitung STILL — und still ist sie genau
   * in dem Fall falsch, fuer den es sie gibt.
   */
  if (bereichsAbweisung(zugang, "entnahme")) {
    redirect(startPfad(zugang.reichweite, zugang.fahrzeugBindung));
  }

  // NUR die fuenf Anzeigefelder. `artikelListe` traegt serverseitig mehr
  // (mindestbestand, unterMindest, chargeKritisch, naechsteCharge …), und alles
  // davon landete sonst im RSC-Payload — auf einem privaten Telefon, in einer
  // Sitzung ohne Konto (§3.4.5), ohne dass die Seite es zeigt.
  //
  // OHNE `inklInaktiv`: das Ausblenden inaktiver Artikel liegt im Lesepfad
  // (Teil 3, T51). Ein zweiter Filter hier waere eine zweite Wahrheit ueber
  // dieselbe Frage.
  /*
   * IDA-295 — DER SCHRANK BEGRENZT DIE LISTE AUF SEINEN BESTAND. Wer vor dem
   * Schrank steht, sucht unter dem, was darin liegt; der Bestand je Zeile ist
   * dann der des Schranks, nicht der des ganzen Handlagers.
   *
   * ⚠️ NUR ARTIKEL MIT BESTAND IM SCHRANK. Was laut Buch woanders liegt, steht
   * nicht in diesem Schrank — und wer es trotzdem in der Hand haelt, kommt ueber
   * „Alle Artikel im Handlager" an ihn heran.
   */
  const schrank = aktiverSchrank(db, einWert(roh.ort));
  const imSchrank = schrank ? bestandJeArtikelAnOrt(db, schrank.id) : null;
  const artikel = artikelListe(db)
    .filter((a) => !imSchrank || (imSchrank.get(a.id) ?? 0) > 0)
    .map((a) => ({
      id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
      bestand: imSchrank ? (imSchrank.get(a.id) ?? 0) : a.bestand,
    }));

  return (
    <HelferRahmen
      aktiv="entnahme"
      reichweite={zugang.reichweite}
      sitzungsetikett={sitzungsEtikett(zugang)}
      laeuftAb={zugang.laeuftAb}
    >
      <div className={s.schirmKopf} data-rolle="helfer-kopf">
        {schrank ? `${schrank.name} — Artikel wählen` : "Artikel wählen"}
      </div>
      {/* IDA-295 — seit der Betreiberentscheidung vom 30.10.2026 scannen Helfer
          nur noch Ortsetiketten, keine Regaletiketten am Artikel. */}
      {schrank ? (
        <p className={s.fussnote} data-rolle="helfer-hinweis">
          Hier steht nur, was laut Buch in diesem Schrank liegt.{" "}
          <Link href="/helfer" data-rolle="helfer-alle">Alle Artikel im Handlager</Link>
        </p>
      ) : (
        <p className={s.fussnote} data-rolle="helfer-hinweis">
          Ortsetikett am Schrank scannen zeigt nur dessen Artikel — oder hier suchen.
        </p>
      )}
      <ArtikelSuche
        artikel={artikel}
        basis="/a"
        {...(schrank ? { ort: schrank.id, leerText: "Laut Buch liegt in diesem Schrank nichts." } : {})}
      />
    </HelferRahmen>
  );
}
