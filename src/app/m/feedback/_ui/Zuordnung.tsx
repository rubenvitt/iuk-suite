"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { AutoComplete, Button, Input, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { addGroupLeaderAction, removeGroupLeaderAction, suchePersonenAction } from "../actions";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SUCHE_MIN_ZEICHEN, vorschlagOptionen, type VorschlagOption } from "../_lib/personen";
import { T } from "./typo";

/**
 * DIE ZUORDNUNG DER LEITUNG (Entwurf §2.6 Punkt 2, §4.4).
 *
 * Warum sie ueberhaupt existiert: `user_groups` war ausschliesslich per
 * Datenbankeingriff fuellbar — in Produktion sah damit kein Gruppenleiter seine
 * Gruppe, und eine Fehlzuordnung war nur mit `sqlite3` korrigierbar.
 *
 * DAS AUTOFILL UND WAS ES BEHEBT. Bis hierher kam die Auswahl aus `known_users`,
 * und diese Tabelle fuellt sich erst, wenn jemand das Modul BETRETEN hat
 * (`upsertKnownUser` in `requireFeedbackAccess.ts`, hinter dem Auth-Riegel). Wer
 * nie da war, war nicht zuordenbar — am Cutover-Tag also niemand. Die Suche
 * fragt jetzt das Personenverzeichnis des Identitaetsanbieters
 * (`core/directory`), ergaenzt um `known_users`.
 *
 * „NOCH NIE IN DER VERWALTUNG" IST KEIN FEHLER, sondern der Normalfall, den
 * dieses Feature erst moeglich macht. Der Hinweis steht in `T.meta`, ohne Farbe,
 * ohne Warnzeichen — Rot ist hier ohnehin verboten (§4.9: `colorError ===
 * colorPrimary === #c8000f`). Bis 2026-07-28 hiess er „noch nie angemeldet";
 * das war unwahr, siehe den Kommentar an `ZuordnungPerson.angemeldet`.
 *
 * DIE E-MAIL IST KEIN MERKMAL, AN DEM SICH JEMAND ERKENNEN LAESST. Sie ist im
 * Verzeichnis optional und muss nicht eindeutig sein — gemessen am 2026-07-28
 * dreimal dieselbe Adresse fuer drei verschiedene `sub`s. Unterschieden wird
 * deshalb an der Kennung, und die steht unter JEDEM Vorschlag.
 *
 * GESPEICHERT WIRD IMMER DER `sub`. Im Eingabefeld steht ein lesbarer Wert; die
 * Zuordnung Wert → `sub` haelt diese Komponente in einer Map und schickt den
 * `sub` in einem versteckten Feld. Eine UUID im sichtbaren Feld waere nicht
 * pruefbar, und ein Name im versteckten Feld waere eine Zuordnung, die nie wirkt.
 *
 * KEIN VERZEICHNIS, KEINE COMBOBOX. Ist die API nicht konfiguriert oder nicht
 * erreichbar, rendert das alte, schlichte Eingabefeld — eine Combobox, die nie
 * Vorschlaege zeigt, ist eine Zusage, die die Oberflaeche nicht halten kann.
 * Der Rueckfall auf `known_users` passiert dahinter, in der Action.
 *
 * Client-Insel aus drei Gruenden: `useActionState` fuer „Person hinzufuegen"
 * (der Feldfehler muss ohne Seitenwechsel ans Feld, §4.4), die Entfernen-Aktion
 * in `columns[].render` — eine Funktion, die eine Server Component nicht
 * uebergeben kann — und die Suche selbst.
 *
 * KEIN EIGENER GUARD HIER: die Zone wird nur fuer `isFeedbackAdmin` gerendert,
 * und die Actions pruefen die Admin-Rolle SERVERSEITIG selbst — auch
 * `suchePersonenAction`, und zwar VOR dem ersten Abruf. Ein verstecktes Feld ist
 * keine Berechtigung.
 */

export type ZuordnungPerson = {
  /** `sub` aus Pocket ID — das ist, was in `user_groups` steht. */
  userId: string;
  /** Anzeigename aus einem der beiden Verzeichnisse; `null`, wenn keins ihn kennt. */
  name: string | null;
  email: string | null;
  /**
   * Steht die Person in `known_users`? `undefined` heisst „nicht ermittelt"
   * (kein Verzeichnis geladen) und wird nicht angezeigt — eine behauptete
   * Aussage waere hier schlechter als keine.
   *
   * DER NAME IST ENGER ALS DIE FRAGE, DIE ER ZU BEANTWORTEN SCHEINT.
   * `known_users` fuellt `requireFeedbackAccess`, und zwar NACH `notFound()`:
   * eingetragen wird nur, wer die Verwaltung dieses Moduls mit ZUGANG geoeffnet
   * hat. Wer sich taeglich an der Suite anmeldet, aber in keiner
   * Feedback-Gruppe steht, ist hier `false` — seit dem Entzug der
   * Suite-Admin-Abkuerzung (`_lib/access.ts`) auch der Betreiber. Deshalb sagt
   * die Oberflaeche „noch nie in der Verwaltung" und nicht „noch nie
   * angemeldet": das Zweite waere schlicht unwahr.
   */
  angemeldet?: boolean;
};

/**
 * Die eine Formulierung fuer diesen Zustand — in der Trefferliste und in der
 * Leitungstabelle dieselbe. Zwei Texte fuer denselben Sachverhalt lesen sich wie
 * zwei verschiedene Sachverhalte.
 */
const NIE_IN_DER_VERWALTUNG = "noch nie in der Verwaltung";

export type ZuordnungProps = {
  groupId: number;
  personen: ZuordnungPerson[];
  /**
   * Steht das Personenverzeichnis zur Verfuegung? Ein einzelnes Boolean, KEINE
   * Liste: die Nutzerliste der Organisation gehoert nicht in die Client-Nutzlast
   * jeder Cockpit-Seite. Gesucht wird pro Anschlag, serverseitig.
   */
  verzeichnisAktiv?: boolean;
  /** Nur fuer Tests herabsetzbar. */
  sucheVerzoegerungMs?: number;
};

/** Kennungen sind zum Vergleichen da, nicht zum Lesen: mono 13 (§2.6). */
const KENNUNG: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
};

/**
 * Ohne Verzoegerung liefe pro Tastendruck eine Server-Action — auf einer
 * 20-Zeichen-Adresse also zwanzig Abrufe fuer ein Ergebnis.
 */
const SUCHE_VERZOEGERUNG_MS = 250;

export function Zuordnung({
  groupId,
  personen,
  verzeichnisAktiv = false,
  sucheVerzoegerungMs = SUCHE_VERZOEGERUNG_MS,
}: ZuordnungProps) {
  const [state, formAction, isPending] = useActionState(addGroupLeaderAction, FORM_START);
  const [laeuft, starte] = useTransition();
  const fehler = feldFehler(state, "kennung");
  const serverWert = feldWert(state, "kennung", "");

  /*
   * DER RUECKSETZER DES SUCHFELDES (§4.4).
   *
   * Nach einer Action muss das Feld auf dem Stand des Servers stehen: leer bei
   * Erfolg, mit der Eingabe bei einem Feldfehler. Fuer UNKONTROLLIERTE Felder
   * macht React das selbst (so arbeitet der Zweig ohne Verzeichnis, und so
   * arbeitet jedes andere Formular im Modul) — die Combobox muss aber
   * kontrolliert sein, damit die Auswahl den `sub` setzen kann, und
   * kontrollierte Felder setzt React nicht zurueck.
   *
   * Deshalb ein Remount ueber den `key`. Der Zaehler steigt beim ABSENDEN, nicht
   * beim Ergebnis, und das ist der Kern:
   *
   *   - Erfolg: `FORM_START` und ein erfolgreiches Ergebnis sind BEIDE
   *     `{ ok: true }` und liefern beide `""`. Ein `key` allein aus `serverWert`
   *     aendert sich also nicht — das Feld bliebe mit der eben gewaehlten Person
   *     stehen, samt geladenem `sub`, und die naechste Zuordnung waere aus
   *     Versehen dieselbe. Der Zaehler sieht diesen Fall.
   *   - Feldfehler: `serverWert` traegt die Eingabe zurueck und aendert den `key`
   *     ein zweites Mal — sie geht nicht verloren.
   *
   * Ein `useEffect`, der denselben Abgleich macht, ist in diesem Projekt ein
   * Lint-FEHLER (`react-hooks/set-state-in-effect`) und blockiert die CI; ein
   * Abgleich waehrend des Renderns ebenfalls (`react-hooks/refs`). Das Setzen im
   * Absende-Handler ist der Weg, der ohne Ausnahmeregel auskommt.
   */
  const [absendeZaehler, setAbsendeZaehler] = useState(0);
  const absenden = (daten: FormData) => {
    setAbsendeZaehler((n) => n + 1);
    formAction(daten);
  };

  const entfernen = (userId: string) =>
    starte(async () => {
      const daten = new FormData();
      daten.set("groupId", String(groupId));
      daten.set("userId", userId);
      await removeGroupLeaderAction(daten);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <span style={T.kicker}>LEITUNG</span>
      <Table<ZuordnungPerson>
        size="middle"
        rowKey="userId"
        pagination={false}
        dataSource={personen}
        /*
         * §4.3: leer ist ein Zustand, keine leere Tabelle.
         *
         * Der Satz sagt AUSDRUECKLICH nichts darueber, wer die Gruppe sehen kann,
         * denn diese Tabelle ist nur die eine von ZWEI Quellen:
         * `memberGroupIdsFor` (`queries.ts:38-55`) gewaehrt Zugang zusaetzlich
         * ueber das Fachgruppen-Attribut aus Pocket ID per Abgleich mit
         * `groups.slug` — im Projekt der uebliche Weg. Eine leere `user_groups`-
         * Liste ist also KEIN abgeschotteter Zustand, und ein Satz wie „bis dahin
         * sehen nur Admins diese Gruppe" waere die Falschaussage, die einen Admin
         * die Gruppe fuer dicht halten laesst. „Kann", nicht „hat": die Slugs sind
         * von hier aus nicht bekannt.
         *
         * Der Anbietername („Pocket ID") bleibt im Kommentar und NICHT im Satz:
         * er ist sonst die einzige gerenderte Nennung im ganzen Modul und
         * ueberlebt keinen Anbieterwechsel.
         */
        locale={{
          emptyText: (
            <span style={T.meta}>
              Niemand einzeln zugeordnet — Zugang kann zusätzlich über das
              Fachgruppen-Attribut der Anmeldung bestehen.
            </span>
          ),
        }}
        columns={[
          {
            title: "Person",
            key: "person",
            render: (_: unknown, p: ZuordnungPerson) => <PersonZelle person={p} />,
          },
          {
            title: "",
            key: "aktion",
            width: 110,
            align: "right",
            render: (_: unknown, p: ZuordnungPerson) => (
              /*
               * Kein `Popconfirm`: der Schaden trifft eine einzige Zuordnung und
               * ist mit demselben Formular eine Zeile weiter unten ruecknehmbar
               * (§4.6 verlangt eine Bestaetigung erst, wenn eine Gruppe oder alle
               * gedruckten Aushaenge betroffen sind).
               */
              <Button
                type="text"
                data-testid={`entfernen-${p.userId}`}
                loading={laeuft}
                onClick={() => entfernen(p.userId)}
              >
                Entfernen
              </Button>
            ),
          },
        ]}
      />

      <form
        action={absenden}
        className="fb-form"
        style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
          {verzeichnisAktiv ? (
            <Verzeichnisfeld
              key={`${absendeZaehler}:${serverWert}`}
              serverWert={serverWert}
              fehler={fehler}
              sucheVerzoegerungMs={sucheVerzoegerungMs}
            />
          ) : (
            <Input
              id="fb-kennung"
              name="kennung"
              style={{ flex: "1 1 220px" }}
              placeholder="Kennung oder E-Mail"
              defaultValue={serverWert}
              status={fehler ? "error" : undefined}
              aria-invalid={fehler ? true : undefined}
              aria-describedby={fehler ? "fb-kennung-err" : undefined}
            />
          )}
          <Button
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            className="fb-block-mobil"
          >
            {verzeichnisAktiv ? "Person hinzufügen" : "Kennung oder E-Mail hinzufügen"}
          </Button>
        </div>
        {fehler ? (
          /* §4.4: Text in `--fb-muted`, NICHT rot — `status="error"` am `Input`
             faerbt nur einen 1px-Rahmen und bleibt als vierter Kanal erlaubt. */
          <p id="fb-kennung-err" style={{ ...T.meta, margin: 0 }}>
            {fehler}
          </p>
        ) : (
          <p style={{ ...T.meta, margin: 0 }}>
            {verzeichnisAktiv
              ? "Name oder E-Mail eintippen und aus der Liste wählen — auch Personen, die hier noch nie waren. Die Kennung unter jedem Vorschlag ist das, was gespeichert wird."
              : "Die Person muss die Verwaltung einmal geöffnet haben, damit ihre E-Mail bekannt ist."}
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Eine Zeile der Leitungstabelle.
 *
 * Die KENNUNG bleibt sichtbar, auch wenn ein Name da ist: sie ist der Wert, der
 * wirklich gespeichert ist, und sie ist das Einzige, womit sich ein Verdacht
 * („ist das dieselbe Anna?") aufloesen laesst.
 */
function PersonZelle({ person }: { person: ZuordnungPerson }) {
  // NUR anzeigen, wenn ein Name da ist: ohne Namen sagt die Zeile darueber schon
  // dasselbe, und zweimal derselbe Hinweis liest sich wie ein Fehler.
  const nieDa = person.angemeldet === false && person.name !== null;
  const zusatz = [person.email, nieDa ? NIE_IN_DER_VERWALTUNG : null].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {person.name ? (
        <span style={T.body}>{person.name}</span>
      ) : (
        // Kein Name heisst: KEINE der beiden Quellen kennt einen. Woran das
        // liegt, weiss diese Zeile nicht — hier stand einmal „hat sich noch
        // nicht angemeldet", und das war eine Vermutung, die auch dann behauptet
        // wurde, wenn die Person laengst da war und nur das Verzeichnis schweigt.
        <span style={T.meta}>Name unbekannt</span>
      )}
      {zusatz !== "" && <span style={T.meta}>{zusatz}</span>}
      <span style={{ ...KENNUNG, color: "var(--fb-muted)" }}>{person.userId}</span>
    </div>
  );
}

/**
 * DAS SUCHFELD MIT AUTOFILL.
 *
 * Zwei Werte, absichtlich getrennt: `text` ist, was die Person sieht (lesbar),
 * `kennung` ist, was abgeschickt wird (der `sub`, sobald aus der Liste gewaehlt
 * wurde — sonst die rohe Eingabe, damit der alte Weg „Kennung oder E-Mail
 * eintippen" unveraendert funktioniert).
 *
 * `gewaehlt` sammelt die Zuordnung Anzeigewert → `sub` ueber ALLE bisherigen
 * Suchen hinweg. Waere die Map an die aktuelle Trefferliste gebunden, ginge der
 * `sub` verloren, sobald nach der Auswahl noch ein Zeichen fiel — und
 * abgeschickt wuerde der Anzeigetext.
 */
function Verzeichnisfeld({
  serverWert,
  fehler,
  sucheVerzoegerungMs,
}: {
  /**
   * Der Stand, den der Server kennt: leer nach Erfolg, die Eingabe nach einem
   * Feldfehler. Die Komponente wird bei jedem Absenden ueber ihren `key` neu
   * aufgesetzt (Begruendung an der Aufrufstelle) und startet auf diesem Wert.
   */
  serverWert: string;
  fehler: string | undefined;
  sucheVerzoegerungMs: number;
}) {
  const [text, setText] = useState(serverWert);
  const [kennung, setKennung] = useState(serverWert);
  const [optionen, setOptionen] = useState<VorschlagOption[]>([]);
  const [sucht, setSucht] = useState(false);

  const gewaehlt = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Laufende Nummer gegen Antworten, die in falscher Reihenfolge eintreffen. */
  const lauf = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const aendern = (roh: string) => {
    setText(roh);
    // Ein bekannter Anzeigewert heisst: aus der Liste gewaehlt → der `sub`.
    setKennung(gewaehlt.current.get(roh) ?? roh);
    if (timer.current) clearTimeout(timer.current);

    const q = roh.trim();
    if (gewaehlt.current.has(roh) || q.length < SUCHE_MIN_ZEICHEN) {
      setSucht(false);
      setOptionen([]);
      return;
    }

    setSucht(true);
    const meine = (lauf.current += 1);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const treffer = await suchePersonenAction(q);
          if (meine !== lauf.current) return;
          const neu = vorschlagOptionen(treffer);
          for (const o of neu) gewaehlt.current.set(o.wert, o.userId);
          setOptionen(neu);
        } catch {
          // Die Suche ist Komfort. Faellt sie aus, bleibt das Feld ein Feld —
          // eine getippte Kennung oder E-Mail geht weiterhin durch.
          if (meine === lauf.current) setOptionen([]);
        } finally {
          if (meine === lauf.current) setSucht(false);
        }
      })();
    }, sucheVerzoegerungMs);
  };

  return (
    <>
      {/* Der Traeger des `sub`. Genau EIN Feld heisst `kennung` — das sichtbare
          Suchfeld traegt bewusst keinen Namen, sonst kaeme der Anzeigetext mit. */}
      <input type="hidden" name="kennung" value={kennung} data-testid="fb-kennung-wert" />
      <AutoComplete
        id="fb-kennung"
        data-testid="fb-kennung-suche"
        value={text}
        onChange={aendern}
        options={optionen.map((o) => ({
          value: o.wert,
          label: <Vorschlagszeile option={o} />,
        }))}
        /* jsdom kennt keine Elementhoehen; mit Virtualisierung rendert die Liste
           in Tests nie. Der Verzicht kostet bei hoechstens 20 Eintraegen nichts. */
        virtual={false}
        style={{ flex: "1 1 320px" }}
        /* §4.14: `size` gar nicht setzen — `controlHeight` ist bereits 56. */
        status={fehler ? "error" : undefined}
        placeholder="Name, E-Mail oder Kennung"
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? "fb-kennung-err" : undefined}
        notFoundContent={
          sucht ? (
            <span style={T.meta}>Suche läuft …</span>
          ) : text.trim().length >= SUCHE_MIN_ZEICHEN ? (
            <span style={T.meta}>
              Keine Person gefunden — eine Kennung lässt sich trotzdem direkt eintragen.
            </span>
          ) : null
        }
      />
    </>
  );
}

/**
 * Ein Vorschlag: Name oben, darunter die E-Mail, darunter die KENNUNG.
 *
 * DIE KENNUNG STEHT IMMER — und das ist eine Korrektur, keine Verzierung. Hier
 * stand `p.email ?? p.userId`, die Adresse VERDRAENGTE also die Kennung. Zwei
 * Fehler in einer Zeile:
 *
 * 1. Die E-Mail ist im Verzeichnis ein OPTIONALES Feld (`DirectoryPerson.email`
 *    ist `string | null`). Woran eine Zeile sich unterscheiden laesst, hing
 *    damit davon ab, ob das Feld gepflegt ist.
 * 2. Sie ist auch dort, wo sie steht, nicht eindeutig. Gemessen am 2026-07-28:
 *    dreimal derselbe Name mit derselben Adresse, drei verschiedene `sub`s — und
 *    fuer den Admin drei identische Zeilen. Wer davon die falsche waehlt,
 *    schreibt eine `user_groups`-Zeile, die nie jemand einloest: die Person
 *    meldet sich mit einem anderen `sub` an und sieht „Dir ist noch keine Gruppe
 *    zugeordnet".
 *
 * Die Kennung ist das einzige Merkmal, das weder optional noch mehrdeutig ist —
 * sie IST der gespeicherte Wert. `PersonZelle` unten macht es seit jeher so
 * („das Einzige, womit sich ein Verdacht aufloesen laesst"); diese Zeile wich
 * davon ab, ausgerechnet an der Stelle, an der die Wahl getroffen wird.
 *
 * Dass drei `sub`s zu einer Person gehoeren, ist damit NICHT behoben — es wird
 * nur sichtbar statt unsichtbar. Der Befund ist gemeldet.
 */
function Vorschlagszeile({ option }: { option: VorschlagOption }) {
  const p = option.person;
  const zusatz = [p.email, p.angemeldet ? null : NIE_IN_DER_VERWALTUNG]
    .filter(Boolean)
    .join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
      <span style={T.body}>{p.name ?? "Ohne Namen"}</span>
      {zusatz !== "" && <span style={T.meta}>{zusatz}</span>}
      <span style={{ ...KENNUNG, color: "var(--fb-muted)" }}>{p.userId}</span>
    </div>
  );
}
