import { requireHelferSitzung } from "../_lib/helferZugang";
import { artikelListe } from "../_lib/lesepfade/artikel";
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

export default async function HelferSeite() {
  const db = getDb();
  const zugang = await requireHelferSitzung(db);

  // NUR die fuenf Anzeigefelder. `artikelListe` traegt serverseitig mehr
  // (mindestbestand, unterMindest, chargeKritisch, naechsteCharge …), und alles
  // davon landete sonst im RSC-Payload — auf einem privaten Telefon, in einer
  // Sitzung ohne Konto (§3.4.5), ohne dass die Seite es zeigt.
  //
  // OHNE `inklInaktiv`: das Ausblenden inaktiver Artikel liegt im Lesepfad
  // (Teil 3, T51). Ein zweiter Filter hier waere eine zweite Wahrheit ueber
  // dieselbe Frage.
  const artikel = artikelListe(db).map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand,
  }));

  return (
    <HelferRahmen
      aktiv="entnahme"
      sitzungsetikett={`Zugang: Token ${zugang.code} · ${zugang.label}`}
      laeuftAb={zugang.laeuftAb}
    >
      <div className={s.schirmKopf}>Artikel wählen</div>
      {/* 1:1 aus `helfer/page.tsx:12` — die EINZIGE Stelle, an der die Anwendung
          sagt, dass das Regaletikett ein Einstieg ist (§7.2.1). */}
      <p className={s.fussnote} data-rolle="helfer-hinweis">
        Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.
      </p>
      <ArtikelSuche artikel={artikel} />
    </HelferRahmen>
  );
}
