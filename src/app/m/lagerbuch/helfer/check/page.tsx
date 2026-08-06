import { requireHelferSitzung } from "../../_lib/helferZugang";
import { fahrzeugListe, sollFuerFahrzeug } from "../../_lib/lesepfade/fahrzeuge";
import { geraeteFuerLagerort } from "../../_lib/lesepfade/geraete";
import { o2FlaschenFuerLagerort } from "../../_lib/lesepfade/o2";
import { verfallFuerLagerort } from "../../_lib/lesepfade/verfall";
import { verfallSchwellen } from "../../_lib/domain/verfall";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { FahrzeugWahl } from "../../_ui/FahrzeugWahl";
import { CheckFlow } from "../../_ui/CheckFlow";
import { LeerZustand } from "../../_ui/LeerZustand";

/**
 * DER FAHRZEUG-CHECK — §7.9.1, DIE EINE STRUKTURAENDERUNG DES KAPITELS
 * (Falle 15).
 *
 * Heute baut diese Seite VIER `Object.fromEntries(fahrzeuge.map(...))`-
 * Woerterbuecher (`helfer/check/page.tsx:16,19-21,23,24-26`) und reicht sie
 * KOMPLETT an die Client-Komponente; `?fz=` wirkt nur als Vorauswahl (`:28`).
 * Damit wandert bei JEDEM Helfer-Aufruf die Soll-Bestueckung, Geraeteliste,
 * Flaschenliste und Verfallslage DER GESAMTEN ORGANISATION in den RSC-Payload —
 * auf ein privates Telefon, in einer Sitzung ohne Konto (§3.4.5).
 *
 * AB JETZT: ERST WAEHLEN, DANN LADEN.
 *
 * Host und Sitzungsriegel kommen aus `helfer/layout.tsx` (§7.4.3); der zweite
 * Aufruf von `requireHelferSitzung` hier holt `sitzungsetikett` und `laeuftAb`,
 * die ein Layout einer Seite nicht reichen kann (§7.8.2). Er ist billig —
 * dasselbe gecachte Handle, derselbe Primaerschluessel-Lookup.
 *
 * ⚠️ DIE ZUSAGE AUS TEIL 2 IST HIERMIT UEBERHOLT (Befund 38 des
 * Preflight-Scans). Der `Produces`-Block von T25
 * (`plans/2026-08-03-lagerbuch-modul-teil2.md:4977`) nennt `helfer/layout.tsx`
 * als einzigen Konsumenten von `requireHelferSitzung` („nur dort"). Teil 4 hat
 * drei: das Layout, `helfer/page.tsx` und diese Datei.
 *
 * ⚠️ KEIN `requireLagerbuchHost` — der Riegel ruft ihn INTERN als erste
 * Anweisung (§2.24). Falle 17 gilt trotzdem: dass diese Seite den Riegel
 * ueberhaupt SELBST ruft, ist die tragende Zusage, nicht die Route-Group. Das
 * ist der Grund, warum `page.test.tsx` sie OHNE Layout auf fremdem Host rendert.
 *
 * ⚠️ WAS AN JEDER `.map()`-ZEILE UNTEN HAENGT: die Lesepfade fuehren mehr
 * Felder, als der Check zeigt (`SollZeile` = `CheckPos` plus `sort`, `herkunft`,
 * `entfernt`; `GeraetZeile` traegt zwoelf Felder statt drei; `VerfallAmLagerort`
 * traegt `erfasstAt`, `ampel`, `abgelaufen`, `text`). Weil Arrays kovariant sind
 * und die Ueberschuss-Pruefung nur auf frischen Objektliteralen greift,
 * kompilierte ein Durchreichen OHNE diese `.map()` sauber — `typecheck` und
 * `build` saehen nichts, und die Verwaltungsfelder landeten still im Payload.
 */
export const dynamic = "force-dynamic";

export default async function CheckSeite({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string }>;
}) {
  const { fz } = await searchParams;
  const db = getDb();
  const zugang = await requireHelferSitzung(db);
  const etikett = `Zugang: Token ${zugang.code} · ${zugang.label}`;

  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  // ⚠️ ANSATZPUNKT 1 VON 2 fuer eine spaetere Durchsetzung von
  // `tokens.scope_lagerort_id` als RIEGEL (offene Betreiberfrage 5, §7.9.1).
  // Hier stuende:
  //     const erlaubt = scope ? fahrzeuge.filter((f) => f.id === scope) : fahrzeuge;
  // Heute ist die Spalte DEKORATION: ein Fahrzeug-Code kann JEDES Fahrzeug
  // checken (Falle 14). Eine Verschaerfung muss zur PHYSISCHEN VERTEILUNG der
  // Etiketten passen, und die ist unbeantwortet. Ansatzpunkt 2 ist die erste
  // Zeile von `checkAbschluss` (_actions/check.ts). MEHR BRAUCHT ES DANN NICHT.
  //
  // ⚠️ NUR FUER DEN SCOPE. Die abgedruckte Zeile prueft weder `typ` noch
  // `aktiv`; beides gehoert ZUSAETZLICH dazu. Auf dieser Seite haelt es der
  // `.filter((f) => f.aktiv)` oben zusammen mit `fahrzeugListe`, serverseitig
  // in der Action seit dem Abschluss-Fix von Teil 4 der Riegel 5 in
  // `_actions/check.ts` (Art und Aktiv gegen `lagerorte`).
  //
  // Genau EIN aktives Fahrzeug → keine Wahl anbieten. KEIN `redirect()`: das
  // spart eine Anfrage und schreibt keinen Pfad, den jemand aeusser/innen
  // verwechseln koennte (§2.1 g, §7.11). Ein `?fz=` auf eine unbekannte oder
  // stillgelegte Zeile faellt hier still durch — sonst laedt eine geratene ID
  // die Daten eines stillgelegten Fahrzeugs.
  const gewaehlt =
    (fz ? fahrzeuge.find((f) => f.id === fz) : undefined) ??
    (fahrzeuge.length === 1 ? fahrzeuge[0] : null);

  if (fahrzeuge.length === 0) {
    return (
      <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel="Kein Fahrzeug angelegt"
          text={"Die Verwaltung muss zuerst ein Fahrzeug mit Soll-Bestückung pflegen. "
              + "Bis dahin gibt es hier nichts zu prüfen."}
          weg={{ href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  if (!gewaehlt) {
    return (
      <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <FahrzeugWahl
          fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))}
        />
      </HelferRahmen>
    );
  }

  // ERST JETZT laden — und nur fuer dieses EINE Fahrzeug. Bei zehn Fahrzeugen
  // ist das eine Zehntelung des Payloads.
  //
  // Grabsteine (`entfernt`) sind auf dem Fahrzeug bewusst NICHT vorhanden →
  // nicht Teil des Checks (1:1 aus `helfer/check/page.tsx:15`).
  const soll = sollFuerFahrzeug(db, gewaehlt.id).filter((p) => !p.entfernt).map((p) => ({
    id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
    einheit: p.einheit, handlagerFach: p.handlagerFach, soll: p.soll,
    fahrzeugBestand: p.fahrzeugBestand, handlagerBestand: p.handlagerBestand,
  }));
  const geraete = geraeteFuerLagerort(db, gewaehlt.id).map((g) => ({
    id: g.id, typ: g.typ, name: g.name,
  }));
  // ⚠️ `letzterDruck` geht UNVERAENDERT weiter, `null` eingeschlossen. Ein
  // `?? 0` hier stellte den Fehlalarm wieder her, gegen den Teil 3 den Typ
  // nullbar gemacht hat: eine fehlende Messung wurde als „0 bar" gelesen →
  // Ampel rot → jemand lief los, um eine VOLLE Flasche zu tauschen.
  // `CheckFlow.tsx:826` loest den Null-Fall als „noch nicht gemessen" auf.
  const flaschen = o2FlaschenFuerLagerort(db, gewaehlt.id).map((f) => ({
    id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar, letzterDruck: f.letzterDruck,
  }));
  const verfall = Object.fromEntries(
    [...verfallFuerLagerort(db, gewaehlt.id)].map(([artikelId, e]) => [artikelId, e.verfall]),
  );

  return (
    <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      <CheckFlow
        fahrzeug={{ id: gewaehlt.id, name: gewaehlt.name, kennung: gewaehlt.kennung }}
        soll={soll}
        geraete={geraete}
        flaschen={flaschen}
        verfall={verfall}
        // Die Schwellen kommen vom SERVER; die Ampel im Zaehlschritt rechnet
        // der Client damit ueber `verfallStatus`, und das ist seit
        // Entscheidung 26 (b) zonenexplizit — Chip und Abschlusszahl koennen
        // konstruktiv nicht auseinanderfallen (§7.9.3).
        warn={verfallSchwellen()}
      />
    </HelferRahmen>
  );
}
