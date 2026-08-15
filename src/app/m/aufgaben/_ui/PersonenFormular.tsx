"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AutoComplete, Button, Input } from "antd";
import { personAendernAction, personAnlegenAction, personenSucheAction } from "../actions";
import type { PersonRow } from "../_db/schema";
import { ROLLE_TEXT, initialenAus } from "../_lib/anzeige";
import { ROLLEN } from "../_db/schema";
import { PERSONEN_SUCHE_MIN_ZEICHEN } from "../_lib/eingabe";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import type { DirectoryPerson, DirectoryStatus } from "@/core/directory";

/*
 * DIE PERSONENVERWALTUNG — ANLEGEN UND AENDERN (Aufgabe 14, Spec §4). Vorbild `RoutineFormular.tsx`:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR.
 *  2. KEIN antd-`Form`/`Form.Item`, KEIN antd-`Select` (Falle 1 gilt hier zwar nicht — eine
 *     Client-Insel darf Compounds nutzen —, aber ein natives `<select>` bleibt im Vokabular dieser
 *     Datei: dieselbe "kein zweites Formular-Muster im Modul"-Ueberlegung wie bei den nativen
 *     Kontrollkaestchen in `RoutineFormular.tsx`).
 *  3. KEIN `@ant-design/icons`.
 *  4. `values` TRAEGT JEDES GESENDETE FELD ZURUECK (`personFormularGemeinsam` in `actions.ts`).
 *
 * EIN FORMULAR FUER ANLEGEN UND AENDERN: `person` UNGESETZT heisst "neu anlegen"
 * (`personAnlegenAction`, das `sub`-Feld ist ein echtes Eingabefeld), GESETZT heisst "aendern"
 * (`personAendernAction`, `sub` erscheint nur noch als READ-ONLY-Text). Der Aufrufer setzt bei einem
 * Wechsel des Ziels einen neuen `key`, damit `useActionState` mit einem frischen Startwert beginnt.
 *
 * WARUM `sub` NACH DEM ANLEGEN NICHT MEHR EDITIERBAR IST: der `sub` ist die Pocket-ID-Kennung, ueber
 * die `personFuerSeite` (`_lib/zugang.ts`) eine Sitzung auf genau diese Zeile abbildet. Ein
 * geaendertes `sub` haengte die GESAMTE Geschichte einer Person (Aufgaben, Nachweise, Verlauf) still
 * an eine andere Anmeldung um — "laut statt still" (Lehre 5 dieser Aufgabenreihe) verlangt hier eine
 * Entscheidung, keinen stillen Zugriff: das Feld verschwindet aus dem Formular, statt eine
 * Aenderung zuzulassen, die niemand beabsichtigt haben kann.
 *
 * WOHER DIE KOORDINATION DEN `sub` KENNT, OHNE ZU RATEN (Brief verlangt genau diese Begruendung):
 * die betroffene Person sieht ihren EIGENEN `sub` auf `_ui/NichtEingetragenSeite.tsx` (dem Ausgang
 * aus dem Modulzugang-ohne-Personen-Zeile-Fall) und gibt ihn muendlich oder schriftlich an die
 * Koordination weiter — die Koordination traegt hier NUR EIN, was sie von der betroffenen Person
 * bekommen hat, sie raet nichts.
 *
 * ── ZWEITE QUELLE SEIT DEM VERZEICHNIS-AUTOFILL (2026-08-15, Entwurf §6) ──────────────────────
 *
 * DER ABSATZ DARUEBER BLEIBT GUELTIG, ER IST NUR NICHT MEHR DER EINZIGE WEG. Ist ein
 * Personenverzeichnis hinterlegt (`core/directory`, Pocket ID `GET /api/users`), sucht die
 * Koordination die Person nach NAMEN und uebernimmt `sub`, `name` und die daraus abgeleiteten
 * `initialen` aus dem Treffer. `rolle`, `sollMinutenTag` und der Zeitraum bleiben ihre Eingabe —
 * das Verzeichnis weiss davon nichts.
 *
 * DER RUECKFALLWEG IST PFLICHT, NICHT KUER, UND ER HAT ZWEI STUFEN:
 *
 *  a) KEIN VERZEICHNIS HINTERLEGT (`verzeichnisAktiv={false}`, aus `isDirectoryConfigured()` in
 *     `personen/page.tsx`) → das Textfeld von oben, unveraendert, samt seinem Hinweis. Eine
 *     Combobox, die nie Vorschlaege zeigt, waere eine Zusage, die die Oberflaeche nicht halten
 *     kann (Vorbild `feedback/_ui/Zuordnung.tsx`).
 *  b) VERZEICHNIS HINTERLEGT, ABER OHNE TREFFER ODER OHNE ANTWORT (`status: "error"` — abgelaufener
 *     API-Key, Zeitueberschreitung, 5xx) → das Suchfeld NIMMT DIE GETIPPTE KENNUNG TROTZDEM AN.
 *     Was im Feld steht, IST der abgeschickte Wert; nur ein Treffer aus der Liste ersetzt ihn.
 *     Ohne diese Stufe waere die Personenanlage genau dann unmoeglich, wenn der Identitaetsanbieter
 *     klemmt — und der Rueckfall aus a) griffe nicht, weil ein Key ja hinterlegt IST.
 *
 * DAS SICHTBARE FELD TRAEGT DEN `sub` SELBST — UND DAS IST DER UNTERSCHIED ZU
 * `feedback/_ui/Zuordnung.tsx`, WO EIN LESBARER WERT IM FELD STEHT UND DER `sub` VERSTECKT
 * MITFAEHRT. Dort heisst das Feld „Kennung oder E-Mail", eine UUID darin waere nicht pruefbar.
 * HIER heisst es „Pocket-ID-Kennung": der `sub` ist genau das, was hineingehoert, wer die Person
 * ist steht eine Zeile tiefer im vorbelegten Namen, und die Zuordnung „Anzeigetext → `sub`" (samt
 * ihrer Kollisionsbehandlung bei gleichnamigen Konten) entfaellt ersatzlos. Ein verstecktes Feld
 * bleibt trotzdem noetig, weil antds `AutoComplete` kein `name` an sein inneres `<input>` reicht.
 *
 * DIE FELD-ID `#pf-sub` UEBERLEBT BEIDE ZWEIGE, und das ist eine Zusage, keine Nebensache: sie
 * traegt in a) das Textfeld und in b) das Suchfeld, in beiden Faellen nimmt sie eine getippte
 * Kennung entgegen. `e2e/aufgaben.spec.ts` („Leerer Start: der volle Rundlauf") tippt genau dorthin.
 */
/**
 * Ohne Verzoegerung liefe pro Tastendruck eine Server-Action — auf einem zehn Zeichen langen Namen
 * also zehn Abrufe fuer ein Ergebnis. Dieselbe Zahl wie in `feedback/_ui/Zuordnung.tsx`.
 */
const SUCHE_VERZOEGERUNG_MS = 250;

export function PersonenFormular({
  person,
  verzeichnisAktiv = false,
  sucheVerzoegerungMs,
}: {
  person?: PersonRow;
  /**
   * Ist ein Personenverzeichnis hinterlegt? EIN BOOLEAN, KEINE LISTE: die Nutzerliste der
   * Organisation gehoert nicht in die Client-Nutzlast von `/personen`. Gesucht wird pro Anschlag,
   * serverseitig (`personenSucheAction`).
   */
  verzeichnisAktiv?: boolean;
  /** Nur fuer Tests herabsetzbar. */
  sucheVerzoegerungMs?: number;
}) {
  const action = person ? personAendernAction : personAnlegenAction;
  const [state, formAction, isPending] = useActionState(action, FORM_START);

  /*
   * DIE VORBELEGUNG AUS EINEM VERZEICHNISTREFFER — und warum sie ueber einen `key` laeuft.
   *
   * Jedes Feld dieses Formulars ist UNKONTROLLIERT (`defaultValue`), wie in jedem anderen Formular
   * des Moduls: React setzt sie nach einer abgeschlossenen Action selbst zurueck, und `values` aus
   * `personFormularGemeinsam` traegt bei einem Feldfehler jede Eingabe zurueck. Ein Treffer muss
   * `name`/`initialen` aber UEBERSCHREIBEN, und ein neuer `defaultValue` allein tut das nicht.
   *
   * Also ein Remount ueber den `key`. Die naheliegenden Alternativen sind in diesem Projekt beide
   * gesperrt: ein `useEffect`, der `setState` ruft, ist ein Lint-FEHLER
   * (`react-hooks/set-state-in-effect`) und blockiert die CI, ein Abgleich waehrend des Renderns
   * ebenfalls (`react-hooks/refs`) — dieselbe Lage, die `feedback/_ui/Zuordnung.tsx` ausfuehrlich
   * begruendet. Auf kontrollierte Felder umzustellen waere die groessere Aenderung und naehme
   * ausgerechnet das Zuruecksetzen nach der Action mit.
   *
   * DER ZAEHLER STEIGT BEIM ABSENDEN, nicht beim Ergebnis: sonst bliebe nach einer erfolgreichen
   * Anlage die eben gewaehlte Person im Formular stehen, und die naechste Anlage waere aus Versehen
   * dieselbe. Bei einem Feldfehler uebernimmt danach wieder `feldWert(state, …)`.
   */
  const [treffer, setTreffer] = useState<DirectoryPerson | null>(null);
  const [absendeZaehler, setAbsendeZaehler] = useState(0);
  const absenden = (daten: FormData) => {
    setTreffer(null);
    setAbsendeZaehler((n) => n + 1);
    formAction(daten);
  };
  const sucheAktiv = verzeichnisAktiv && !person;
  // `undefined` heisst „kein Remount" — in jedem Zweig ohne Suche bleibt das Formular exakt das,
  // was es vor dem Autofill war.
  const vorbelegungsKey = sucheAktiv ? `${absendeZaehler}:${treffer?.userId ?? ""}` : undefined;

  const nameFehler = feldFehler(state, "name");
  const initialenFehler = feldFehler(state, "initialen");
  const rolleFehler = feldFehler(state, "rolle");
  const sollMinutenFehler = feldFehler(state, "sollMinutenTag");
  const aktivVonFehler = feldFehler(state, "aktivVon");
  const aktivBisFehler = feldFehler(state, "aktivBis");
  const subFehler = feldFehler(state, "sub");

  return (
    <form
      action={absenden}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      {person ? <input type="hidden" name="personId" value={person.id} /> : null}

      {!person ? (
        <div>
          <label htmlFor="pf-sub" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Pocket-ID-Kennung
          </label>
          {sucheAktiv ? (
            <Verzeichnisfeld
              /*
               * ZWEI TEILE, UND BEIDE WERDEN GEBRAUCHT (Vorbild `feedback/_ui/Zuordnung.tsx`).
               * Das Suchfeld ist KONTROLLIERT (nur so kann eine Auswahl den `sub` setzen), und
               * kontrollierte Felder setzt React nach einer Action nicht zurueck — also ein
               * Remount ueber den `key`, und der muss BEIDE Wechsel sehen:
               *
               *   - Der ZAEHLER faengt den Erfolgsfall: `FORM_START` und ein erfolgreiches
               *     Ergebnis sind beide `{ ok: true }` und liefern beide `""`. Ein `key` allein
               *     aus dem Serverwert aenderte sich nicht, und die eben angelegte Kennung bliebe
               *     im Feld stehen.
               *   - Der SERVERWERT faengt den Feldfehlerfall: er trifft ERST ein, wenn die Action
               *     zurueck ist, also NACH dem Zaehler. Ohne ihn im `key` bliebe das Feld auf dem
               *     leeren Stand des Absendens stehen, und die getippte Kennung waere weg — genau
               *     die Eingabe, die der Feldfehler zurueckbringen soll.
               */
              key={`${absendeZaehler}:${feldWert(state, "sub", "")}`}
              startWert={feldWert(state, "sub", "")}
              fehler={subFehler}
              sucheVerzoegerungMs={sucheVerzoegerungMs}
              onTreffer={setTreffer}
            />
          ) : (
            <Input
              id="pf-sub"
              name="sub"
              defaultValue={feldWert(state, "sub", "")}
              status={subFehler ? "error" : undefined}
              aria-invalid={subFehler ? true : undefined}
              aria-describedby={subFehler ? "pf-sub-err" : "pf-sub-hinweis"}
            />
          )}
          {/*
           * DER AUSGANG AUS `NichtEingetragenSeite.tsx` (Brief: "kein Feld, das die Koordination
           * raten laesst"). Die betroffene Person sieht ihren eigenen `sub` dort und gibt ihn
           * weiter — dieser Text erklaert, woher der Wert kommt, statt ihn erraten zu lassen.
           *
           * MIT VERZEICHNIS STEHT DIESELBE AUSKUNFT ALS ZWEITER SATZ DA, nicht als Ersatz: der Weg
           * ueber die Hinweisseite bleibt der Rueckfall, wenn das Verzeichnis niemanden findet oder
           * gerade nicht antwortet (Kopfkommentar, Stufe b).
           */}
          <p id="pf-sub-hinweis" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {sucheAktiv
              ? "Namen eintippen und die Person aus der Liste wählen — die Kennung unter jedem Vorschlag ist das, was gespeichert wird. Findet die Suche niemanden, geht auch eine getippte Kennung: die betroffene Person sieht sie auf der Hinweisseite, die sie nach dem Anmelden bekommt („Du bist noch nicht im Modul eingetragen.“)."
              : "Die betroffene Person findet ihre eigene Kennung auf der Hinweisseite, die sie nach dem Anmelden sieht („Du bist noch nicht im Modul eingetragen.“) — sie gibt sie dir weiter."}
          </p>
          {subFehler ? (
            <p id="pf-sub-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {subFehler}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <span style={{ display: "block", marginBlockEnd: SPACE.xs }}>Pocket-ID-Kennung</span>
          {/*
           * READ-ONLY, NICHT ALS FORMULARFELD (Kopfkommentar): ein `sub` ist nach dem Anlegen
           * unveraenderlich, damit keine Geschichte still umgehaengt wird.
           */}
          <p style={{ margin: 0 }}>
            <code>{person.sub}</code>
          </p>
        </div>
      )}

      <div>
        <label htmlFor="pf-name" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Name
        </label>
        <Input
          id="pf-name"
          name="name"
          key={vorbelegungsKey}
          defaultValue={treffer?.name ?? feldWert(state, "name", person?.name ?? "")}
          status={nameFehler ? "error" : undefined}
          aria-invalid={nameFehler ? true : undefined}
          aria-describedby={nameFehler ? "pf-name-err" : undefined}
        />
        {nameFehler ? (
          <p id="pf-name-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {nameFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-initialen" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Initialen
        </label>
        <Input
          id="pf-initialen"
          name="initialen"
          key={vorbelegungsKey}
          /*
           * DIESELBE ABLEITUNG WIE DIE JIT-ZEILE DER KOORDINATION (`_lib/anzeige.ts`s
           * `initialenAus`, gerufen aus `_lib/zugang.ts`s `legeKoordinationAn`) — eine zweite
           * Fassung hier ergaebe fuer dieselbe Person je nach Weg andere Initialen. Ein Treffer
           * OHNE Namen (`name: null` ist im Verzeichnis moeglich) belegt nichts vor: `??` faellt
           * dann auf den bisherigen Wert zurueck, statt "??" in die Zelle zu schreiben.
           */
          defaultValue={
            treffer?.name
              ? initialenAus(treffer.name)
              : feldWert(state, "initialen", person?.initialen ?? "")
          }
          status={initialenFehler ? "error" : undefined}
          aria-invalid={initialenFehler ? true : undefined}
          aria-describedby={initialenFehler ? "pf-initialen-err" : undefined}
        />
        {initialenFehler ? (
          <p id="pf-initialen-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {initialenFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-rolle" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Rolle
        </label>
        <select
          id="pf-rolle"
          name="rolle"
          defaultValue={feldWert(state, "rolle", person?.rolle ?? ROLLEN[0])}
          aria-invalid={rolleFehler ? true : undefined}
          aria-describedby={rolleFehler ? "pf-rolle-err" : undefined}
        >
          {ROLLEN.map((rolle) => (
            <option key={rolle} value={rolle}>
              {ROLLE_TEXT[rolle]}
            </option>
          ))}
        </select>
        {rolleFehler ? (
          <p id="pf-rolle-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {rolleFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-soll" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Soll-Minuten pro Tag
        </label>
        <Input
          id="pf-soll"
          name="sollMinutenTag"
          type="number"
          min={1}
          defaultValue={feldWert(state, "sollMinutenTag", (person?.sollMinutenTag ?? 468).toString())}
          status={sollMinutenFehler ? "error" : undefined}
          aria-invalid={sollMinutenFehler ? true : undefined}
          aria-describedby={sollMinutenFehler ? "pf-soll-err" : undefined}
        />
        {sollMinutenFehler ? (
          <p id="pf-soll-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {sollMinutenFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-aktiv-von" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Aktiv von
        </label>
        <Input
          id="pf-aktiv-von"
          name="aktivVon"
          type="date"
          defaultValue={feldWert(state, "aktivVon", person?.aktivVon ?? "")}
          status={aktivVonFehler ? "error" : undefined}
          aria-invalid={aktivVonFehler ? true : undefined}
          aria-describedby={aktivVonFehler ? "pf-aktiv-von-err" : undefined}
        />
        {aktivVonFehler ? (
          <p id="pf-aktiv-von-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {aktivVonFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-aktiv-bis" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Aktiv bis (leer = unbefristet)
        </label>
        <Input
          id="pf-aktiv-bis"
          name="aktivBis"
          type="date"
          defaultValue={feldWert(state, "aktivBis", person?.aktivBis ?? "")}
          status={aktivBisFehler ? "error" : undefined}
          aria-invalid={aktivBisFehler ? true : undefined}
          aria-describedby={aktivBisFehler ? "pf-aktiv-bis-err" : undefined}
        />
        {aktivBisFehler ? (
          <p id="pf-aktiv-bis-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {aktivBisFehler}
          </p>
        ) : null}
      </div>

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        {person ? "Speichern" : "Person anlegen"}
      </Button>
    </form>
  );
}

/**
 * DAS SUCHFELD UEBER DAS PERSONENVERZEICHNIS.
 *
 * EIN EINZIGER WERT, ABSICHTLICH: was im sichtbaren Feld steht, IST der abgeschickte `sub` — beim
 * Tippen wie beim Waehlen (ein Vorschlag traegt den `sub` als `value`). Damit gibt es hier keine
 * Zuordnung „Anzeigetext → Kennung", die verlorengehen koennte, und der Rueckfallweg aus dem
 * Kopfkommentar (Stufe b) ist kein Sonderpfad, sondern der Normalfall des Feldes.
 *
 * DAS VERSTECKTE FELD TRAEGT DEN `name="sub"`, weil antds `AutoComplete` sein inneres `<input>`
 * nicht benennt. Genau EIN Feld dieses Formulars heisst `sub`.
 *
 * KEIN `.trim()`, KEIN `.toLowerCase()` HIER: Pocket-ID-`sub`-Werte sind gross-/kleinschreibungs-
 * sensitiv, und `personFormularGemeinsam` (`actions.ts`) schneidet die Randleerzeichen selbst ab —
 * eine zweite Normalisierung an dieser Stelle koennte still von der serverseitigen abweichen.
 *
 * LAUFENDE NUMMER GEGEN ANTWORTEN IN FALSCHER REIHENFOLGE (`lauf`), Verzoegerung gegen einen Abruf
 * je Tastendruck — beides woertlich wie in `feedback/_ui/Zuordnung.tsx`.
 */
function Verzeichnisfeld({
  startWert,
  fehler,
  sucheVerzoegerungMs = SUCHE_VERZOEGERUNG_MS,
  onTreffer,
}: {
  /** Der Stand, den der Server kennt: leer am Anfang, die Eingabe nach einem Feldfehler. */
  startWert: string;
  fehler: string | undefined;
  sucheVerzoegerungMs?: number;
  onTreffer: (person: DirectoryPerson) => void;
}) {
  const [wert, setWert] = useState(startWert);
  const [vorschlaege, setVorschlaege] = useState<DirectoryPerson[]>([]);
  const [sucht, setSucht] = useState(false);
  const [status, setStatus] = useState<DirectoryStatus>("ok");

  /** Jeder je gesehene Vorschlag — daran erkennt `aendern`, dass GEWAEHLT und nicht getippt wurde. */
  const gesehen = useRef(new Map<string, DirectoryPerson>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lauf = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const aendern = (roh: string) => {
    setWert(roh);
    if (timer.current) clearTimeout(timer.current);

    const gewaehlt = gesehen.current.get(roh);
    if (gewaehlt) {
      // Aus der Liste gewaehlt: Name und Initialen vorbelegen, nicht weitersuchen.
      onTreffer(gewaehlt);
      setSucht(false);
      setVorschlaege([]);
      return;
    }

    const q = roh.trim();
    if (q.length < PERSONEN_SUCHE_MIN_ZEICHEN) {
      setSucht(false);
      setVorschlaege([]);
      return;
    }

    setSucht(true);
    const meine = (lauf.current += 1);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const ergebnis = await personenSucheAction(q);
          if (meine !== lauf.current) return;
          for (const p of ergebnis.people) gesehen.current.set(p.userId, p);
          setStatus(ergebnis.status);
          setVorschlaege(ergebnis.people);
        } catch {
          // Die Suche ist Komfort. Faellt sie aus, bleibt das Feld ein Feld — eine getippte
          // Kennung geht weiterhin durch.
          if (meine === lauf.current) {
            setStatus("error");
            setVorschlaege([]);
          }
        } finally {
          if (meine === lauf.current) setSucht(false);
        }
      })();
    }, sucheVerzoegerungMs);
  };

  return (
    <>
      <input type="hidden" name="sub" value={wert} data-testid="pf-sub-wert" />
      <AutoComplete
        id="pf-sub"
        data-testid="pf-sub-suche"
        value={wert}
        onChange={aendern}
        options={vorschlaege.map((p) => ({
          value: p.userId,
          label: <Vorschlagszeile person={p} />,
        }))}
        /* jsdom kennt keine Elementhoehen; mit Virtualisierung rendert die Liste in Tests nie.
           Der Verzicht kostet bei hoechstens 20 Eintraegen nichts. */
        virtual={false}
        style={{ width: "100%" }}
        /* Falle 4: `size` gar nicht setzen — `controlHeight` kommt aus dem Thema. */
        status={fehler ? "error" : undefined}
        placeholder="Name, E-Mail oder Kennung"
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? "pf-sub-err" : "pf-sub-hinweis"}
        notFoundContent={
          sucht ? (
            <span>Suche läuft …</span>
          ) : wert.trim().length < PERSONEN_SUCHE_MIN_ZEICHEN ? null : status === "ok" ? (
            <span>Niemand gefunden — eine getippte Kennung lässt sich trotzdem eintragen.</span>
          ) : (
            /*
             * DER UNTERSCHIED ZWISCHEN „KENNT NIEMANDEN" UND „ANTWORTET NICHT" GEHOERT AUF DEN
             * SCHIRM (`personenSucheAction` reicht den `status` deshalb mit durch): der erste Satz
             * schickt die Koordination auf die Suche nach einem Tippfehler, den es beim zweiten
             * gar nicht gibt.
             */
            <span>Das Verzeichnis antwortet gerade nicht — die Kennung lässt sich eintragen.</span>
          )
        }
      />
    </>
  );
}

/**
 * Ein Vorschlag: Name oben, darunter die E-Mail, darunter die KENNUNG.
 *
 * DIE KENNUNG STEHT IMMER — die Lehre aus `feedback/_ui/Zuordnung.tsx` (dort am 2026-07-28 gemessen:
 * dreimal dieselbe E-Mail auf drei verschiedene `sub`s). Sie ist im Verzeichnis weder Pflichtfeld
 * noch eindeutig; die Kennung ist das einzige Merkmal, das beides ist — und hier ist sie zusaetzlich
 * der Wert, der ins Feld wandert.
 */
function Vorschlagszeile({ person }: { person: DirectoryPerson }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
      <span>{person.name ?? "Ohne Namen"}</span>
      {person.email ? <span>{person.email}</span> : null}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{person.userId}</span>
    </div>
  );
}
