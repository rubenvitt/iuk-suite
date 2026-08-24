// src/app/m/radio/(ausleihe)/geraete/page.tsx
import { Empty } from "antd";
import { listeAktualisieren } from "../../_actions/ausleihe";
import { getDb } from "../../_db/client";
import { geraeteMitLeihstand } from "../../_db/leihen";
import { AUSWAHL_MAX } from "../../_lib/auswahl";
import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import { KEINE_GERAETE_ERFASST } from "../../_lib/meldungen";
import { AktualisierenKnopf } from "../../_ui/AktualisierenKnopf";
import { AusleihRahmen } from "../../_ui/AusleihRahmen";
import { GeraeteListe } from "../../_ui/GeraeteListe";
import s from "../../_ui/ausleihe.module.css";

/**
 * DIE GERAETEUEBERSICHT — der aeussere Pfad `/geraete` (Spec 1 §4.1 Zeile 3325, §4.3.1
 * Zeile 3423).
 *
 * ⛔ SIE LIEGT AN `/geraete` UND NICHT AN `/` (Entscheidung E1,
 * `.superpowers/sdd/planteil3/briefs/KOPF.md:416-455`). Kapitel 4 §4.1 legt sie auf
 * `(ausleihe)/page.tsx`; das ist nicht baubar, aus zwei unabhaengigen Gruenden: dort loeste
 * sie auf denselben Pfad auf wie das Gate (`src/app/m/radio/page.tsx`), was Next beim Build
 * ablehnt — und ein `(ausleihe)/layout.tsx` mit Riegel ueber `/` liefe im Kreis, weil
 * `requireAusleihZugang` bei fehlendem Cookie auf `/` umleitet
 * (`_lib/ausleihZugang.ts:236-241`). Bindend ist die Routenkarte aus Kapitel 1 §1.2.1
 * (Spec:273-284), zugesichert in `_lib/routen.test.ts`.
 *
 * ⛔ DER RIEGEL IST DIE ERSTE ANWEISUNG, obwohl `(ausleihe)/layout.tsx` ihn ebenfalls ruft
 * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
 * Layout kann einer Seite keine Props reichen — diese Seite braucht `zugang` fuer den Rahmen.
 * ⛔ DER HOST-RIEGEL WIRD NICHT ZUSAETZLICH GERUFEN (Spec:3408-3413, Pflicht 16): das
 * Praedikat ruft ihn intern als erste Anweisung. `riegel.test.ts` Klausel (f) haelt beides
 * fest, `page.test.tsx` misst die Wirkung.
 *
 * ⛔ DIES IST EINE SERVER COMPONENT: kein `Typography.Title`, kein `Card.Meta`, kein
 * `Input.TextArea` — Compound-Zugriff ist HTTP 500 (Falle 1, `CLAUDE.md:11-13`,
 * Spec:3349-3351). Die Ueberschrift ist ein nacktes `<h1>`, und `Empty` wird NACKT benutzt:
 * ein `Empty.PRESENTED_IMAGE_SIMPLE` waere derselbe Compound-Zugriff. ⛔ Kein
 * `@ant-design/icons` (Falle 7, Entscheidung E5) und keine `Table` (Entscheidung E4 — ein
 * `columns[].render` aus einer Server Component ist Falle 9).
 *
 * ⛔ KEINE `<Shell>` (Entscheidung E9): der Rahmen ist `_ui/AusleihRahmen.tsx`.
 */

/**
 * ⛔ ERSATZ FUER `staleTime: 30_000` UND `keepPreviousData` DES ALT-KIOSK (§4.7,
 * Spec:3826-3829): „eine Bestandsliste, die 30 Sekunden alt sein darf, ist auf einer Flaeche
 * mit zwei Menschen am gleichen Regal genau die Ursache des Konflikts aus §4.3.2."
 *
 * ⛔ BEIDES, NICHT EINES VON BEIDEN (`.superpowers/sdd/planteil3/VORABSCAN-A.md:415-424`,
 * Fund F26): DIESE Zeile verhindert, dass die SERVERANTWORT vorgerendert ist;
 * `revalidatePath("/geraete")` in `_actions/ausleihe.ts:184` entwertet zusaetzlich den
 * ROUTER-CACHE DES CLIENTS, den der `redirect` unmittelbar danach benutzt. Ein spaeterer
 * Leser streicht sonst den, den er fuer ueberfluessig haelt.
 */
export const dynamic = "force-dynamic";

/**
 * Der Satz zur eben gebuchten Ausleihe, oder `null`.
 *
 * ⛔ ER NENNT DIE ZAHL UND NICHT DEN NAMEN — eine benannte Abweichung vom Wortlaut der Spec
 * (`:3429`: „2 Geräte an Max Mustermann ausgeliehen."). `?gebucht=<n>` traegt nur die Zahl
 * (`_actions/ausleihe.ts:218`), und einen Entleihernamen ueber die URL zu reichen hiesse,
 * ihn in den Verlauf eines geteilten Telefons zu schreiben — genau der Grund, aus dem der
 * Suchtext dort nicht steht (Spec:3633-3635).
 *
 * ⛔ DER WERT IST NUTZEREINGABE. Er wird streng gelesen: ganze Zahl, mindestens 1, hoechstens
 * `AUSWAHL_MAX` (`_lib/auswahl.ts:53`) — mehr kann die Action konstruktiv nie gebucht haben,
 * weil `auswahlLesen` dort deckelt. Alles andere ergibt `null` und damit KEINE Zeile: eine
 * Meldung ueber einen Vorgang, den es nie gab, ist schlechter als Schweigen (dieselbe Regel
 * wie am Gate, Spec:2396-2398).
 *
 * ⛔ DIE EINZAHL IST EIN EIGENER ZWEIG. „1 Geräte ausgeliehen." waere still falsch.
 */
function erfolgssatz(roh: string | undefined): string | null {
  if (roh === undefined || !/^[0-9]+$/.test(roh)) return null;
  const anzahl = Number(roh);
  if (anzahl < 1 || anzahl > AUSWAHL_MAX) return null;
  return anzahl === 1 ? "1 Gerät ausgeliehen." : `${anzahl} Geräte ausgeliehen.`;
}

export default async function GeraeteUebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ gebucht?: string }>;
}) {
  const zugang = await requireAusleihZugang(getDb());

  /*
   * DIE FERTIGEN ZEILEN (Spec:3423). ⛔ `suchschluessel` IST HIER SCHON VORBERECHNET
   * (`_db/leihen.ts`, §4.5.2 Spec:3629-3632) — die Insel sucht darin, statt einmal je
   * Tastendruck je Geraet zu normalisieren. ⛔ UND DIE SERIENNUMMER REIST NICHT ALS EIGENES
   * FELD MIT (§4.1 Punkt 2, Spec:3343-3348): sie geht nur in den Suchschluessel ein. Drei
   * Waechter halten das, auf drei Ebenen — `_db/leihen.test.ts` (Lesemodell),
   * `page.test.tsx` (diese RSC-Grenze) und `_ui/GeraeteListe.test.tsx` (die Zeile).
   *
   * ⛔ HIER WIRD NICHT SORTIERT UND NICHT GEFILTERT. Beides hat seinen einzigen Ort in
   * `filtereGeraete` (`_lib/filter.ts:26-31`); zwei Sortierorte waeren zwei Wahrheiten, und
   * die zweite saehe man erst, wenn sie auseinanderlaufen.
   */
  const geraete = geraeteMitLeihstand(getDb());

  const { gebucht } = await searchParams;
  const erfolg = erfolgssatz(gebucht);

  return (
    <AusleihRahmen zugang={zugang} aktiv="uebersicht">
      <div className={s.uebersichtKopf}>
        <h1 className={s.uebersichtTitel}>Geräte</h1>
        {/*
          ⛔ DAS FORMULAR STEHT HIER, DER KNOPF IST EINE INSEL. `useFormStatus` ist ein
          Client-Hook und liest das `<form>`, in dem seine Komponente STEHT — in dieser
          Server Component kann er nicht laufen (Begruendung ausgeschrieben in
          `_ui/AktualisierenKnopf.tsx`). Die Server Action wird DIREKT importiert und nicht
          als Prop gereicht (Falle 9, `CLAUDE.md:52-70`).
        */}
        <form action={listeAktualisieren}>
          <AktualisierenKnopf />
        </form>
      </div>

      {erfolg !== null && (
        /*
          ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776): in `src/app` gibt es keinen Aufruf
          von `message.*` oder `App.useApp()`; ein Toast-System waere neu. Der Erfolg wandert
          als Ergebnisparameter durch den `redirect` und wird HIER gerendert (Spec:3429).
          ⛔ `role="status" aria-live="polite"` UND NICHT `role="alert"` — anders als am Gate
          (`_ui/GateFormular.tsx:124-146`, REVIEW-A11 Fund W3), und aus DESSEN Grund: dort
          entsteht der Satz nach einem Antippen OHNE Seitenwechsel, weshalb eine hoefliche
          Region ihn oft verschluckt. Hier kommt er mit einem frischen Dokument nach einer
          Weiterleitung; eine `assertive`-Region unterbraeche die Person beim Lesen.
          ⛔ GRUEN AUS DEM CHIP-SATZ, nicht `colorSuccess` — ein Farbsystem je Flaeche, und
          `colorError === colorPrimary` macht Rot auf einer Datenflaeche unbrauchbar
          (Falle 3, `src/core/theme/theme.ts:32-33`). Die Farbe steht im Stylesheet.
        */
        <p className={s.gebucht} role="status" aria-live="polite" data-rolle="radio-gebucht">
          {erfolg}
        </p>
      )}

      {geraete.length === 0 ? (
        /*
          ⛔ EIN SATZ OHNE VERWEIS AUF DIE VERWALTUNG (§4.9.6, Spec:3919-3922,
          `_lib/meldungen.ts`): der Bestand setzt hier einen Knopf „Geraete verwalten" auf
          `/admin` (`DeviceList.tsx:89-98`) — auf einer ANONYMEN Flaeche. Ein sichtbarer Weg
          dorthin, wo die aufrufende Person nicht hindarf, verletzt die Gegenprobe
          `docs/design/README.md:420`.
          ⛔ `Empty` NACKT, kein `Empty.PRESENTED_IMAGE_SIMPLE` — Compound-Zugriff in einer
          Server Component ist HTTP 500 (Falle 1). Vorbild:
          `src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx:130`.
          ⛔ UND DIE INSEL ERSCHEINT DANN GAR NICHT: eine Filterleiste ueber nichts ist eine
          Bedienflaeche ohne Gegenstand.
        */
        <div data-rolle="radio-leer-bestand">
          <Empty description={KEINE_GERAETE_ERFASST} />
        </div>
      ) : (
        <GeraeteListe geraete={geraete} />
      )}
    </AusleihRahmen>
  );
}
