// src/app/m/radio/admin/(druck)/zugaenge/blatt/page.tsx
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { getDb } from "../../../../_db/client";
import { codesListe } from "../../../../_lib/lesepfade/codes";
import { requireRadioAdmin } from "../../../../_lib/zugang";
import "../../druck.css";

/**
 * DAS DRUCKBARE ZUGANGSBLATT — der aeussere Pfad `/admin/zugaenge/blatt`
 * (`Spec:314`: „neu: das druckbare Blatt mit den QR-Codes der ausgestellten Zugaenge";
 * Routenkarte `_lib/routen.ts:65`).
 *
 * ⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()` (`Spec:4378`).** Es ist die zweite Linie —
 * das Group-Layout riegelt bereits (`admin/(druck)/layout.tsx:47-49`), und beides ist Pflicht,
 * weil `requiresAuth: false` gilt und die Middleware hier nicht gatet (`Spec:4382-4386`).
 * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (`Spec:569-571`).
 *
 * ⛔ **DIE LAGE IST TEIL DER ZUSICHERUNG, NICHT IHRE KULISSE.** `riegel.test.ts` liefert fuer
 * alles ausserhalb von `admin/(arbeit)/` den strengen Zweig (`personenRiegelFuer`,
 * `riegel.test.ts:256-266`) — diese Seite ist dort gedeckt, ⛔ **aber nur, solange sie in
 * `(druck)` liegt.** Unter `(arbeit)` fiele sie in den ODER-Zweig, und die Shell druckte
 * Kopfzeile und App-Umschalter mit (`Spec:316-320`). Der Waechter darueber ist der Fall
 * „V21: admin/(druck)/zugaenge/blatt/page.tsx liegt in (druck) und nennt requireRadioAdmin,
 * NICHT requireRadioVerwaltung" in `admin/actions.test.ts`.
 *
 * ⛔ **KEINE INSEL** (`.superpowers/sdd/planteil4/briefs/KOPF.md:1386-1389`,
 * `briefs/V21.md:14-15`): ein Bogen mit QR-Codes und Klartext, ohne Bedienelement. ⛔ **Braeuchte er eine, waere das ein Zeichen,
 * dass etwas Interaktives auf dem Papier gelandet ist.** Deshalb kein `"use client"`, kein
 * antd, kein Druckknopf — `lagerbuch` traegt seinen in einer eigenen Insel
 * (`lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.tsx`), und genau die ist hier
 * nicht vorgesehen. Der Waechter darueber steht in `blatt/page.test.tsx`.
 *
 * ⛔ **KEIN `requireRadioHost(` DANEBEN:** `Spec:4369-4378` gibt jeder der zehn Seiten GENAU
 * EINE erste Anweisung; den Host haelt das Group-Layout und zusaetzlich der werfende Riegel
 * selbst (`_lib/zugang.ts`, `riegelAufStufe`). Bauform-Zulaessigkeitstafel Nr. 13.
 *
 * ⛔ **KEIN `force-dynamic`** — dieselbe Lage und dieselbe Entscheidung wie bei der
 * Zugangsverwaltung nebenan (`admin/(arbeit)/zugaenge/page.tsx:50-59`): `Spec:4644-4645`
 * verlangt es fuer Seiten, die SUCHPARAMETER oder ein dynamisches Segment lesen, und diese
 * liest weder das eine noch das andere. Dynamisch ist die Route ohnehin, weil
 * `requireRadioAdmin()` `headers()` liest (`_lib/zugang.ts:459-461`).
 * ⚠️ `lagerbuch` setzt es an derselben Stelle (`etiketten/page.tsx:10`) — das ist die
 * Hausform JENES Moduls; `radio`s Regel steht in `Spec:4644-4645` und ist die engere.
 *
 * ⛔ **DAS STYLESHEET WIRD HIER GEZOGEN, NICHT IM LAYOUT.** `admin/(druck)/layout.tsx:39-40`
 * sagt es woertlich: „KEIN Stylesheet-Import: `lagerbuch` zieht hier `./druck.css`. Das
 * Druckbild von `radio` gehoert zu Planteil 4, MIT dem Blatt." ⛔ Das Layout ist nicht Teil
 * dieser Aufgabe (`.superpowers/sdd/planteil4/briefs/V21.md:63-64`); ein globales Stylesheet
 * darf in Next im App Router aus jeder Datei des Segmentbaums kommen, und `druck.css` gehoert
 * damit dorthin, wo der einzige Verbraucher steht.
 */

/**
 * ⛔ **DIE BASIS KOMMT AUS `moduleUrl`, NICHT AUS `resolveHost(headers)`** — 1:1 die
 * Begruendung des Hausvorbilds (`lagerbuch/_db/etiketten.ts:44-57`): der angefragte Host
 * stammt aus `x-forwarded-host`, ist faelschbar und garantiert nicht den Modul-Host. Ein
 * manipulierter Kopf druckte einen ganzen Bogen auf eine fremde Domain — ⛔ **und der Fehler
 * zeigte sich erst, wenn jemand einen GEDRUCKTEN Aufsteller scannt.**
 *
 * ⬜ **UND HIER STEHT EINE BENANNTE LEERSTELLE STATT EINES ERFUNDENEN HOSTS.**
 * `moduleUrl("radio")` liest ueber `prodHostsFor()` aus `SUITE_HOST_RADIO`
 * (`src/core/shell/moduleUrl.ts:11-13`), und die Registry fuehrt fuer `radio`
 * `prodHosts: []` (`src/core/registry.ts:199`). ⛔ **In Produktion und VOR dem Cutover ist
 * der Wert deshalb `null`** — dann zeigt diese Seite den benannten Zustand unten, statt einen
 * plausibel aussehenden Host in die Pixel eines QR-Codes zu schreiben. Der Wert selbst ist
 * ⬜ **V-L2 / E1** (Betreiber, vor Cut 26; `.superpowers/sdd/planteil4/progress.md`).
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER SEITE, in EINER benannten Liste und nicht inline verstreut
 * (Global Constraint, `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`). ⚠️ Sie tragen ihre
 * Umlaute — es sind Bildschirmtexte, keine Bezeichner.
 *
 * ⚠️ KEINER DIESER SAETZE STAMMT AUS DER 1:1-TAFEL ABSCHNITT E
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1322-1339`), und das ist gemessen, nicht
 * angenommen: der Alt-Bestand kennt die Zugangscodes gar nicht (die Messung steht im Kopf von
 * `_lib/lesepfade/codes.ts:17-24`). ⛔ Deshalb traegt hier kein Satz eine Alt-Belegzeile; eine
 * erfundene waere genau die Klasse, gegen die die eiserne Regel steht.
 */
const BLATT_TEXTE = {
  titel: "Zugänge zur Funkgeräte-Ausleihe",
  /**
   * ⛔ ER STEHT AUF DEM PAPIER UND ERKLAERT DEN BOGEN DEM, DER IHN AUFHAENGT. Ohne ihn ist ein
   * QR-Code ohne Kontext. ⚠️ Was am Alt-Kiosk BELEGT ist, ist die Papierseite des Problems,
   * und nur sie: seine Codes trugen den geteilten Token als URL-Parameter, und „Nichts im
   * Repo weiß, wie viele Kärtchen im Umlauf sind" (`Spec:7025`, woertlich).
   */
  anleitung:
    "QR-Code scannen oder den Code auf der Startseite eingeben. Ein gesperrter Zugang steht nicht auf diesem Bogen.",
  /** ⛔ Der leere Bogen ist ein ZUSTAND, keine leere Seite (Global Constraint „jeder gestaltete Zustand traegt einen benannten Weg zurueck"). */
  leer: "Es ist kein aktiver Zugang ausgestellt. Ein neuer Zugang entsteht in der Zugangsverwaltung.",
  /** ⬜ Der benannte Zustand zur Leerstelle oben — er nennt die Variable, nicht ein Adjektiv. */
  basisFehlt:
    "Für die Funkgeräte ist noch keine öffentliche Domain konfiguriert (SUITE_HOST_RADIO). Ohne sie trüge jeder QR-Code eine falsche Adresse — der Bogen bleibt deshalb leer.",
  zurueck: "Zurück zur Zugangsverwaltung",
} as const;

/** Der aeussere Pfad der Zugangsverwaltung (`_lib/routen.ts:64`, `_lib/nav.ts:81`). */
const ZURUECK_ZIEL = "/admin/zugaenge";

export default async function RadioZugangsblattSeite() {
  await requireRadioAdmin();

  const basis = moduleUrl("radio")?.replace(/\/$/, "") ?? null;

  /*
   * ⛔ NUR AKTIVE ZUGAENGE AUF DAS PAPIER, UND DER FILTER STEHT HIER — NICHT IN `codesListe`.
   * Deren tragende Zusage ist die umgekehrte: „ein gesperrter Zugang BLEIBT in der Liste"
   * (`_lib/lesepfade/codes.ts:167-172`), weil `gesperrt_am`/`gesperrt_von` sonst sinnlos
   * waeren. Die VERWALTUNGSLISTE zeigt die Geschichte, der BOGEN zeigt, was gilt.
   *
   * ⛔ ES IST EINE BENANNTE WAHL DIESER AUFGABE UND KEIN PORT: es gibt keine Alt-Vorlage
   * (`_lib/lesepfade/codes.ts:17-24`, gemessen), und der Auftragsbrief nennt keinen Filter
   * (`.superpowers/sdd/planteil4/briefs/V21.md`, ueber die ganze Datei gemessen).
   *
   * ⚠️ **UND SIE VERENGT DEN WORTLAUT DER SPEC — das steht hier, statt eine Deckung zu
   * behaupten, die es nicht gibt.** `Spec:314` sagt „das druckbare Blatt mit den QR-Codes der
   * **ausgestellten** Zugaenge", und ein gesperrter Zugang IST ausgestellt worden. ⛔ Kein
   * Satz der Spec sagt, was mit ihm auf dem Papier geschieht; `Spec:2235` („kein zweiter
   * Aufsteller muss neu bedruckt werden") handelt von den ANDEREN Codes und traegt die Zusage
   * nicht — sie hier anzufuehren waere derselbe Fehlgriff wie beim ueberholten Anker von
   * ⬜ V-L11 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L11").
   *
   * ⛔ DER GRUND, DER TRAEGT, IST DIE FEHLERRICHTUNG: ein gesperrter Code auf einem geklebten
   * Aufsteller ist ein QR, der ins Leere fuehrt — ein Papierfehler, den niemand sieht, bis
   * jemand davorsteht. Ein zu Unrecht weggelassener Code kostet einen zweiten Ausdruck.
   * ⚠️ Dieselbe Wahl trifft `lagerbuch` an derselben Stelle und aus demselben Grund
   * (`lagerbuch/_db/etiketten.ts:59-64`: „hart auf `aktiv`").
   *
   * ⬜ **V21-L1 — DIE UMKEHRUNG IST EINE BETREIBERFRAGE UND EINE ZEILE.** Soll ein gesperrter
   * Zugang durchgestrichen mitgedruckt werden, damit ein Aufsteller beim Austausch
   * wiedererkennbar bleibt? Eigentuemer: **Betreiber**, vor dem Rollout — dieselbe Form wie
   * ⬜ V-L6 und ⬜ V-L11. Bis dahin gilt die Wahl oben.
   */
  const aktive = basis === null ? [] : codesListe(getDb()).filter((z) => z.aktiv);

  /*
   * ⛔ EIN `Promise.all`, KEINE SCHLEIFE MIT VERGESSENEM `await`: `qrSvg` ist async
   * (`src/core/qr/index.ts:37-40`), und ein fehlendes `await` ergaebe keine Fehlermeldung,
   * sondern `[object Promise]` als Markup (`lagerbuch/_db/etiketten.ts:67-71`).
   *
   * ⛔ DIE NUTZLAST IST DIE VOLLSTAENDIGE AEUSSERE URL `<basis>/t/<code>` — OHNE PARAMETER,
   * OHNE BASE64 (`Spec:2115-2122`, `Spec:3249`). Der heutige Alt-Code setzt
   * `url.searchParams.set('token', btoa(token))`; das ist der Mechanismus, den gesetzte
   * Entscheidung 8 ausschliesst (`Spec:64`, `Spec:6767`). ⛔ Der Bindestrich ist Teil des
   * gespeicherten Wertes (`Spec:2057`) und wandert ungefiltert in die Pixel — `code` wird
   * zeichengleich gespeichert und nie normalisiert (`Spec:1117`).
   */
  const karten = await Promise.all(
    aktive.map(async (z) => {
      const url = `${basis}/t/${z.code}`;
      return { id: z.id, bezeichnung: z.bezeichnung, code: z.code, url, qr: await qrSvg(url) };
    }),
  );

  return (
    <div className="rd-bogen" data-rolle="radio-blatt">
      {/*
        ⛔ `rd-nichtDrucken` STATT EINES KNOPFES. Der Weg zurueck ist ein `<a>` und damit kein
        Bedienelement im Sinne der Insel-Frage — er haelt keinen Zustand und ruft keine Action.
        Der Praezedenzfall steht daneben: `lagerbuch` traegt denselben Link auf derselben
        Druckseite und begruendet ihn mit dem Global Constraint „jeder gestaltete Zustand
        traegt einen benannten Weg zurueck" (`lagerbuch/verwaltung/(druck)/etiketten/page.tsx:71-90`).
        ⛔ KEIN `next/link`: das Blatt ist ein Endpunkt des Druckwegs, und ein `<a>` braucht
        keinen Prefetch-Apparat, den die Seite sonst nirgends benutzt.
      */}
      <p className="rd-nichtDrucken">
        <a href={ZURUECK_ZIEL}>{BLATT_TEXTE.zurueck}</a>
      </p>

      <h1 className="rd-titel">{BLATT_TEXTE.titel}</h1>

      {basis === null ? (
        <p className="rd-hinweis" data-rolle="radio-blatt-basis-fehlt">
          {BLATT_TEXTE.basisFehlt}
        </p>
      ) : (
        <p className="rd-hinweis">{BLATT_TEXTE.anleitung}</p>
      )}

      {basis !== null && karten.length === 0 ? (
        <p className="rd-hinweis" data-rolle="radio-blatt-leer">
          {BLATT_TEXTE.leer}
        </p>
      ) : null}

      {karten.map((k) => (
        <section className="rd-karte" key={k.id} data-rolle="radio-blatt-karte">
          {/*
            Das SVG kommt per `dangerouslySetInnerHTML` herein — dieselbe Stelle und dieselbe
            Begruendung wie `src/app/m/qr/QrDisplay.tsx:16-21` und
            `lagerbuch/.../EtikettenBogen.tsx:34-36`: das Markup stammt aus dem SVG-Serializer
            von `qrcode`, die Nutzlast landet als Modulkoordinaten im `d`-Attribut, nie als
            Text im Markup.
          */}
          <span className="rd-qr" dangerouslySetInnerHTML={{ __html: k.qr }} />
          <div className="rd-text">
            <span className="rd-bezeichnung">{k.bezeichnung}</span>
            {/*
              ⛔ DER KLARTEXT-CODE STEHT DANEBEN, UND ZWAR ZUM TIPPEN: das Gate nimmt ihn als
              Eingabe (`_ui/GateFormular.tsx`), und wer keine Kamera hat, kommt nur so herein.
              Er ist kein Einmalgeheimnis, sondern ein Dauerausweis (`Spec:2180-2182`).
            */}
            <span className="rd-code">{k.code}</span>
            <span className="rd-url">{k.url}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
