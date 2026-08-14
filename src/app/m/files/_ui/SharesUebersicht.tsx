import { Suspense } from "react";
import { Alert, Button, Card } from "antd";
import { notFound } from "next/navigation";
import { ladeUebersicht, type UebersichtZeile } from "../_db/queries";
import { entschaerfeTitel } from "../_lib/zip";
import { zeitpunktBerlin } from "../_lib/zeit";
import type { Rolle } from "../_lib/hostRolle";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { AblageKachel } from "./AblageKachel";
import { SharesTabelle, SharesTabelleSkelett, type ShareZeile } from "./SharesTabelle";

/**
 * DIE FREIGABEN-UEBERSICHT (Spec §7.3, §10.1; Plan T23, ausgebaut in T36).
 *
 * DIESE KOMPONENTE LAEDT IHRE ZEILEN SELBST. `page.tsx` uebergibt ihr die ROLLE
 * und sonst nichts — kein Zeilen-Prop, keine Projektion, kein `viewer`. Das ist
 * eine Festlegung ueber die Naht, nicht ueber den Geschmack: die Uebersicht
 * bekommt in Welle 8a die Ablage-Kachel (T46). Liefe der Ladeweg ueber
 * `page.tsx`, haette der Rollen-Verteiler in JEDER dieser Wellen einen zweiten
 * Bearbeiter — und `page.tsx` ist die Datei, an der die Rollentrennung samt
 * Riegel haengt.
 *
 * ANTD IN EINER SERVER COMPONENT — ABER OHNE COMPOUND-ZUGRIFF. `Card`, `Button`
 * und `Alert` sind in RSC sicher; `Typography.Title` und Geschwister sind es
 * NICHT (sie sind dort `undefined` und ergeben HTTP 500, das `pnpm build` nicht
 * sieht). Die Ueberschrift ist deshalb ein nacktes `<h1>` — nicht aus
 * Sparsamkeit, sondern weil die naheliegende antd-Form die Seite abschieszt.
 * Aus demselben Grund liegt das SKELETT in `SharesTabelle.tsx`: es benutzt
 * `Skeleton.Button`, und das ist ein Compound-Zugriff.
 *
 * DIE TABELLE IST EINE CLIENT-INSEL, DIE SEITE BLEIBT RSC. `columns` mit
 * `render`-Funktionen reicht FUNKTIONEN ueber die RSC-Grenze — das scheitert
 * unabhaengig von der Compound-Falle. Hier wird geladen und gerechnet, dort
 * bedient.
 *
 * DIE LADEGRENZE LIEGT UM DIE ZEILEN, NICHT UM DIE SEITE. Ueberschrift und
 * „Freigabe anlegen" stehen AUSSERHALB der `Suspense`-Grenze und sind sofort da;
 * darunter erscheint das Tabellen-Skelett, bis die Datenbank antwortet (§10.1,
 * Spalte „Warten"). Wuerde diese Komponente `ladeUebersicht()` selbst
 * `await`en, gaebe die Seite bis dahin GAR NICHTS aus, und das Skelett waere
 * toter Kode — sichtbar nur noch in einem Test.
 */

/** Der Platzhalter, den der Import (Spec 2) jeder Altzeile in `created_by`
 *  gibt. Hier wird er nur ANGEZEIGT — gesetzt wird er dort. */
const ALTBESTAND = "import:easy-filesharing";

/**
 * BINAERE Praefixe, und das Wort dazu. Beide „500" unterscheiden sich um den
 * Faktor 1,048576 (476,8 MiB gegen 500,0 MB) — dieses Paar ist im Modul `files`
 * schon einmal teuer geworden (§9.1). Der Name traegt die Einheit, damit die
 * Verwechslung beim Lesen auffaellt und nicht erst beim Rechnen.
 *
 * Dieselbe Leiter steht in `(verwaltung)/zugangslinks/page.tsx`. Die Doppelung
 * ist bewusst und benannt: eine gemeinsame Stelle laege in `_lib/`, und beide
 * Dateien gehoeren anderen Tasks — sie zusammenzulegen ist eine eigene, kleine
 * Aenderung mit zwei Bearbeitern, kein Nebenprodukt dieser hier.
 */
const BYTE_EINHEITEN_BINAER = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

function byteTextBinaer(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN_BINAER.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN_BINAER[stufe]}`;
}

/* Die Zeitzone steht im NAMEN der Funktion, nicht in einem Kommentar (§9.1) —
   und sie steht nur EINMAL, in `_lib/zeit.ts`. Ein Formatierer ohne `timeZone`
   uebernaehme die Zone des Serverprozesses; im Container ist das UTC, und die
   Ablaufstunde stuende im Sommer zwei Stunden zu frueh. */

/**
 * DIE PROJEKTION AN DER RSC-GRENZE — und der Grund, warum sie einen Namen hat.
 *
 * Alles, was an einer UHR oder an einer EINHEIT haengt, entsteht hier:
 *
 *  - `abgelaufen` rechnet der Server. Rechnete es der Browser, entschieden die
 *    beiden an der Ablaufsekunde verschieden — die Zeile stuende auf „gueltig",
 *    waehrend jeder Download 410 antwortet.
 *  - `ablaufAt` und `erstelltAt` sind `Date`-Objekte aus Drizzle (die Spalten
 *    fuehren SEKUNDEN, `mode: "timestamp"`); hier wird deshalb NIE mit 1000
 *    multipliziert oder geteilt. Hinausgereicht wird fertiger Text.
 *  - `gesamtGroesse` kommt aus den ZEILEN (`share_files.size`), nie aus
 *    `shares.total_size`: heute zeigen Dashboard und Detailseite dieselbe
 *    Groesze aus zwei Quellen und koennen verschiedene Zahlen zeigen.
 *
 * UND WAS HIER NICHT HERAUSKOMMT: `password_hash`. Die Abfrage holt ihn gar
 * nicht (`hatPasswort` entsteht in SQLite), und diese Funktion reicht nur
 * benannte Felder weiter — kein Spread einer Datenbankzeile. Die Alt-App
 * selektierte alle Spalten, spreadete sie und uebergab sie an die
 * Client-Komponente (Analyse Falle 11).
 *
 * `jetzt` ist ein Parameter und kein `new Date()` im Rumpf: zwei Aufrufe in
 * einer Schleife liegen an einer Sekundengrenze auseinander, und zwei gleich
 * alte Freigaben stuenden dann in verschiedenen Zustaenden.
 */
export function zuZeile(roh: UebersichtZeile, jetzt: Date): ShareZeile {
  return {
    id: roh.id,
    titel: roh.titel,
    typText: roh.typ === "file" ? "Datei" : "Ordner",
    anzahlDateien: roh.anzahlDateien,
    anzahlUnvollstaendig: roh.anzahlUnvollstaendig,
    groesseText: byteTextBinaer(roh.gesamtGroesse),
    ablaufText: zeitpunktBerlin(roh.ablaufAt),
    abgelaufen: roh.ablaufAt.getTime() <= jetzt.getTime(),
    /* `null` = UNBEGRENZT, nicht 0 und nicht −1 (§4.2) — deshalb `??` und
       niemals `||`: die Alt-Zeile `maxDownloads || null` machte aus „0
       Downloads" still einen unbegrenzten Share. */
    downloadsText: `${roh.downloadCount} / ${roh.maxDownloads ?? "∞"}`,
    hatPasswort: roh.hatPasswort,
    avSammelwert: roh.avSammelwert,
    /* `created_by` ist reine Anzeige — es gibt KEINE Ownership-Pruefung zwischen
       Mitgliedern (§2.4). Ein roher `import:easy-filesharing` in der Spalte
       „Erstellt von" saehe aus wie ein Benutzername, den man suchen koennte. */
    erstelltVonText:
      roh.erstelltVon === ALTBESTAND ? "Altbestand — nicht zuordenbar" : roh.erstelltVon,
    /* Die Entschaerfung 1:1 aus `_lib/zip.ts`, und sie laeuft HIER: `zip.ts`
       zieht ueber `_lib/av.ts` `node:net` nach, ein Import von dort in ein
       `"use client"`-Modul truege das ins Client-Bundle (§7.9). */
    qrDateiname: `${entschaerfeTitel(roh.titel)}-qr.png`,
  };
}

export async function SharesUebersicht({ rolle }: { rolle: Rolle }) {
  /*
   * DIE ROLLE IST DIE ZWEITE LINIE, nicht Zierde. Diese Ansicht zeigt die
   * Freigaben ALLER Mitglieder — Titel, Mengen, Ablauf. Auf der Inbox-Domain
   * darf sie nie erscheinen, dort ist jede Anfrage anonym.
   *
   * Entschieden wird das im Verteiler (`page.tsx`, Zweig `verwaltung`); diese
   * Zeile ist der Riegel am Ort der Daten, dieselbe Bauform wie
   * `requireFilesAccess()` aus ZWEI Stellen (§3.5). Sie kann heute nicht
   * ausloesen — und genau deshalb steht sie hier: der Tag, an dem jemand die
   * Uebersicht aus einer zweiten Seite rendert, ist der Tag, an dem sie es tut.
   * `notFound()` und nicht ein Wurf, weil das Modul die Existenz einer Ansicht
   * nirgends verraet.
   */
  if (rolle !== "verwaltung") notFound();

  return (
    <div data-testid="files-uebersicht">
      {/*
       * Punkt 1 der Pruefliste: `Seitenkopf` statt eines nackten `<h1>`. Kein
       * `zurueck` — diese Seite ist die Modulwurzel, ein Rueckweg auf sich
       * selbst waere eine Schleife.
       *
       * DER EINSTIEG STEHT IMMER DA, nicht nur im Leerzustand — jetzt in
       * `aktionen`. §10.2 nennt fuer `anlegenAction` zwei Wege: `/shares/neu`
       * und diesen Knopf auf `/`. Ohne ihn gaebe es ab der ERSTEN Freigabe
       * keinen Weg mehr zu einer zweiten — die Modulnavigation kennt „Freigabe
       * anlegen" nicht (`_lib/nav.ts`), und der Knopf im Leerzustand ist dann
       * per Definition unsichtbar. `aktionen` bleibt AUSSERHALB der
       * `Suspense`-Grenze (Seitenkopf steht davor), unveraendert sofort da.
       *
       * Kein `size`: `controlHeight` ist 44 (`ARBEITSDICHTE`) und schon das
       * richtige Masz, `size="large"` waeren 72px.
       */}
      <Seitenkopf
        titel="Freigaben"
        aktionen={
          <Button type="primary" href="/shares/neu" data-testid="files-uebersicht-anlegen">
            Freigabe anlegen
          </Button>
        }
      />

      <Suspense fallback={<SharesTabelleSkelett />}>
        <Zeilen />
      </Suspense>

      {/*
       * DIE ABLAGE-KACHEL STEHT HIER, weil hier der Mensch steht, der handeln
       * kann (T46, §7.6): Restplatz, Zeilen ohne Bytes, `scanning`/`error` und
       * `.part`-Reste stehen sonst nirgends, und der manuelle Auslöser des
       * Aufräumlaufs braucht einen Einstiegspunkt in der Oberfläche.
       *
       * EIGENE `Suspense`-GRENZE, nicht die der Zeilen: die Kachel liest neben
       * der Datenbank auch das Dateisystem (`statfs`, zwei `readdir`-Ebenen).
       * Läge sie in derselben Grenze, verzögerte die langsamere der beiden
       * Quellen die Freigabenliste — und die ist der Zweck der Seite.
       *
       * `Card loading` als Ersatz: `Skeleton.Button` wäre ein Compound-Zugriff
       * und in einer Server Component `undefined` (HTTP 500).
       */}
      <Suspense fallback={<Card title="Ablage" loading />}>
        <AblageKachel />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Die ladende Haelfte. Sie ist eine eigene Komponente, damit die
 * `Suspense`-Grenze UM DIE ZEILEN liegt und nicht um die ganze Ansicht — siehe
 * Kopfkommentar.
 */
async function Zeilen() {
  let rohe: UebersichtZeile[];
  try {
    rohe = await ladeUebersicht();
  } catch (grund) {
    /*
     * EIN LADEFEHLER IST EIN ZUSTAND DIESER ANSICHT, kein Seitenabsturz. Ohne
     * dieses `catch` liefe der Wurf in die naechste `error.tsx` — die es hier
     * nicht gibt — und die Person saehe eine technische Fehlerseite ohne
     * Ausweg. Protokolliert wird trotzdem: ein stiller Fehlerzustand ist ein
     * Betriebsproblem, das niemand findet.
     */
    console.error("[files] Freigaben-Uebersicht konnte nicht geladen werden:", grund);
    return <LadeFehler />;
  }

  if (rohe.length === 0) return <Leerzustand />;

  // EINE Uhr fuer alle Zeilen — Begruendung an `zuZeile`.
  const jetzt = new Date();
  return <SharesTabelle zeilen={rohe.map((roh) => zuZeile(roh, jetzt))} />;
}

function Leerzustand() {
  return (
    <Card data-testid="files-uebersicht-leer">
      <p>Noch keine Freigabe angelegt.</p>
      {/*
       * Der Knopf gehoert ZUM Leerzustand und nicht nur in die Kopfzeile
       * (§10.1): er ist dort der naechste Schritt, benannt an der Stelle, an
       * der die Person gerade steht.
       */}
      <Button type="primary" href="/shares/neu">
        Freigabe anlegen
      </Button>
    </Card>
  );
}

function LadeFehler() {
  return (
    /*
     * `type="warning"` und NICHT `type="error"`: `colorError === colorPrimary
     * === #c8000f`, ein roter Kasten auf einer Datenflaeche saehe aus wie eine
     * Primaeraktion (`docs/design/README.md`, Falle 3).
     */
    <Alert
      type="warning"
      showIcon
      data-testid="files-uebersicht-fehler"
      message="Die Freigaben konnten nicht geladen werden."
      description={
        <>
          <p>
            Der Zugriff auf die Datenbank ist fehlgeschlagen. Die Freigaben selbst sind davon nicht
            betroffen.
          </p>
          {/*
           * WIEDERHOLEN IST HIER EIN NEUER SEITENAUFRUF, kein Knopf mit
           * `onClick`: diese Ansicht ist eine Server Component, ein Handler
           * braeuchte eine zweite Client-Insel fuer eine Zeile. `/` ist auf dem
           * Verwaltungs-Host genau diese Seite (`core/routing.ts`).
           */}
          <Button href="/" data-testid="files-uebersicht-wiederholen">
            Erneut versuchen
          </Button>
        </>
      }
    />
  );
}
