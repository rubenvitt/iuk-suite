"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { Button, Card, Dropdown, Input, Modal, Popconfirm, Select, Tag } from "antd";
import { SPACE, TAP } from "@/core/theme/tokens";
import { absagenAction, freigebenAction, planEveningsAction } from "../actions";
import { RHYTHMEN, SERIE_MAX_TERMINE, serienTermine, type Rhythmus } from "../_lib/serie";
import { AbendBearbeiten } from "./AbendBearbeiten";
import { formatDatumLang, formatWochentag, tagAusEingabe, tagInZone } from "./datum";
import { T } from "./typo";

/**
 * ZONE „KOMMENDE ABENDE" (DRK-426).
 *
 * Die einzige Liste dieser Seite, die NACH VORN schaut. Alles andere — Lagekarte,
 * Verlauf, letzter Abend — beantwortet „was war", diese hier „was kommt".
 * Deshalb steht sie zwischen beiden und sortiert AUFSTEIGEND: der nächste Abend
 * gehört nach oben, nicht der entfernteste.
 *
 * SIE IST EINE EIGENE INSEL UND NICHT TEIL DER LAGEKARTE, obwohl sie fachlich
 * daneben gehört. Der Grund ist die Bauform: `Lagekarte` ist eine SERVER
 * Component und hält das mit drei Quelltext-Zusicherungen fest (kein
 * `"use client"`, kein Compound-Zugriff auf antd, keine Funktions-Props —
 * `Lagekarte.test.tsx`). „Freigeben" und „Absagen" brauchen beides: einen
 * Ladezustand und eine Bestätigung, also `useTransition` und `Popconfirm`. Wäre
 * das in die Karte gewandert, hätte entweder die Karte ihre Zusicherungen
 * verloren oder die Knöpfe ihre Rückmeldung.
 *
 * ⚠️ DIE VORSCHAU IM PLANUNGSDIALOG IST KEIN SCHMUCK, sondern der Ersatz für
 * eine Rückmeldung nach dem Absenden. `planEveningsAction` kommt ohne
 * Formularzustand aus (§4.4 nennt genau drei Formulare mit Feldfehlern, dieses
 * ist keins davon) — eine Meldung „12 angelegt, 2 übersprungen" gäbe es also
 * erst nach dem Klick, wenn die Entscheidung gefallen ist. Stattdessen rechnet
 * der Dialog dieselbe Liste mit DERSELBEN Funktion (`serienTermine`) vorher aus
 * und markiert die Termine, an denen schon ein Abend steht. Eine zweite,
 * nachgebaute Rechnung im Client wäre die eine Stelle, an der Vorschau und
 * Ergebnis auseinanderlaufen könnten.
 */

const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: "var(--fb-kartenpolster)" },
} satisfies Record<string, CSSProperties>;

const ZEILE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
  flexWrap: "wrap",
  paddingBlock: 10,
  borderTop: "1px solid var(--fb-split)",
};

const FELD: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.xs };

/** Ein geplanter Abend, so wie die Seite ihn herüberreicht — reine Werte. */
export type GeplanterAbend = {
  eveningId: number;
  /** Mitternacht UTC, wie `evenings.date` es speichert. */
  datum: Date;
  thema: string | null;
  notizen?: string | null;
};

export type KommendeAbendeProps = {
  groupId: number;
  /** Aufsteigend, nächster zuerst — sortiert hat `_lib/cockpit.ts`. */
  abende: GeplanterAbend[];
  /**
   * Alle belegten Kalendertage der Gruppe als `YYYY-MM-DD`, auch die
   * vergangenen. Nur dafür da, die Vorschau ehrlich zu machen.
   */
  belegteTage: string[];
  /** `YYYY-MM-DD` in Europe/Berlin, von der Seite gerechnet (§4.5). */
  heute: string;
  /**
   * Thema der gerade laufenden Umfrage, sonst `null`. Die Bestätigung beim
   * Freigeben muss sagen, WAS sie beendet — „die laufende Umfrage wird
   * geschlossen" ohne Namen ist eine Warnung, die niemand prüfen kann.
   */
  laufendesThema: string | null;
};

export function KommendeAbende({
  groupId,
  abende,
  belegteTage,
  heute,
  laufendesThema,
}: KommendeAbendeProps) {
  const [planen, setPlanen] = useState(false);

  return (
    <section aria-label="Kommende Dienstabende" data-testid="kommende-abende">
      <Card
        variant="outlined"
        title="KOMMENDE ABENDE"
        styles={KARTE}
        extra={
          <Button type="text" onClick={() => setPlanen(true)}>
            Dienstabende planen
          </Button>
        }
      >
        {abende.length === 0 ? (
          <p style={{ ...T.meta, margin: 0 }}>
            Noch nichts geplant. Du kannst die Abende eines ganzen Jahres im Voraus eintragen —
            das Feedback gibst du dann an jedem Abend einzeln frei.
          </p>
        ) : (
          <div>
            {abende.map((abend) => (
              <AbendZeile
                key={abend.eveningId}
                abend={abend}
                heute={heute}
                laufendesThema={laufendesThema}
              />
            ))}
          </div>
        )}
      </Card>

      <PlanenDialog
        groupId={groupId}
        heute={heute}
        belegteTage={belegteTage}
        offen={planen}
        schliessen={() => setPlanen(false)}
      />
    </section>
  );
}

/**
 * Eine Zeile je geplantem Abend. KEINE Tabelle, und das ist dieselbe
 * Entscheidung wie in der Schmalvariante des Verlaufs: drei bis zwölf Zeilen mit
 * zwei Angaben und zwei Aktionen brauchen keine Spaltenköpfe, keine Sortierung
 * und keine Blätterung — sie brauchen eine Zeile, die auch auf 390px lesbar
 * bleibt. `flexWrap` bricht die Knöpfe dort unter den Text, statt sie zu
 * quetschen.
 */
function AbendZeile({
  abend,
  heute,
  laufendesThema,
}: {
  abend: GeplanterAbend;
  heute: string;
  laufendesThema: string | null;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [absagen, setAbsagen] = useState(false);
  const [laeuft, starte] = useTransition();

  const istHeute = tagInZone(abend.datum) === heute;
  // Ein geplanter Abend, dessen Tag vorbei ist, faltet auf nichts (`EveningStatus`
  // in `_lib/lifecycle.ts`) — er bleibt stehen und wartet auf eine Entscheidung.
  // Sichtbar muss das trotzdem sein, sonst sucht niemand nach ihm.
  const ueberfaellig = tagInZone(abend.datum) < heute;

  const ruf = (aktion: (daten: FormData) => Promise<void>) => () => {
    starte(async () => {
      const daten = new FormData();
      daten.set("eveningId", String(abend.eveningId));
      await aktion(daten);
    });
  };

  return (
    <div style={ZEILE} data-testid="kommender-abend">
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ ...T.body, fontWeight: 600 }}>
          {formatWochentag(abend.datum)}, {formatDatumLang(abend.datum)}
          {istHeute && (
            <Tag style={{ marginInlineStart: SPACE.sm }} data-testid="abend-heute">
              heute
            </Tag>
          )}
          {ueberfaellig && (
            <Tag style={{ marginInlineStart: SPACE.sm }} data-testid="abend-ueberfaellig">
              Termin vorbei
            </Tag>
          )}
        </div>
        <div style={T.meta}>{abend.thema ?? "Ohne Thema"}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <Popconfirm
          title="Feedback jetzt freigeben?"
          description={
            laufendesThema === null
              ? "Ab sofort kann über den QR-Code der Gruppe geantwortet werden."
              : `Ab sofort kann über den QR-Code der Gruppe geantwortet werden. Das laufende Feedback zu „${laufendesThema}“ wird dabei beendet — es gibt je Gruppe nur einen QR-Code.`
          }
          okText="Freigeben"
          cancelText="Abbrechen"
          okButtonProps={{ loading: laeuft }}
          onConfirm={ruf(freigebenAction)}
        >
          <Button type="primary" loading={laeuft}>
            Feedback freigeben
          </Button>
        </Popconfirm>

        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "bearbeiten", label: "Bearbeiten" },
              { key: "absagen", label: "Abend absagen" },
            ],
            onClick: ({ key }) => {
              if (key === "bearbeiten") setBearbeiten(true);
              // NICHT direkt absagen: ein Fehlklick in einem Dropdown ist billig,
              // und die Rücknahme liegt in einer ANDEREN Zone (im Verlauf, unter
              // „Doch wieder ansetzen") — wer sie sucht, muss erst begreifen,
              // wohin der Abend verschwunden ist. Der `Popconfirm` haengt
              // deshalb NEBEN dem Menue und nicht am Menuepunkt: antd schliesst
              // das Menue beim Klick, und ein Bestaetigungsdialog darin ginge
              // mit unter (dasselbe Muster wie `AbendMenue` in `_ui/Verlauf.tsx`).
              if (key === "absagen") setAbsagen(true);
            },
          }}
        >
          {/*
           * `minWidth: TAP` mit derselben Begründung wie am Auslöser im Verlauf
           * (`_ui/Verlauf.tsx`, `AbendMenue`): ein Auslassungszeichen ist
           * schmal, seine Trefferfläche darf es nicht sein. `size` bleibt
           * ungesetzt (CLAUDE.md, Falle 4).
           */}
          <Button
            type="text"
            style={{ minWidth: TAP }}
            aria-label={`Weitere Aktionen für den ${formatDatumLang(abend.datum)}`}
          >
            …
          </Button>
        </Dropdown>
      </div>

      {/*
       * Der Wirt des Bestaetigungsdialogs. `open` gesteuert, der Anker ist ein
       * leeres `<span>` — der Dialog gehoert zum Menuepunkt, aber der existiert
       * im geschlossenen Menue nicht mehr.
       */}
      <Popconfirm
        open={absagen}
        title="Abend absagen?"
        description="Der Abend bleibt im Verlauf stehen und ist dort wieder ansetzbar."
        okText="Absagen"
        cancelText="Abbrechen"
        okButtonProps={{ loading: laeuft }}
        onConfirm={() => {
          setAbsagen(false);
          ruf(absagenAction)();
        }}
        onCancel={() => setAbsagen(false)}
      >
        <span />
      </Popconfirm>

      <AbendBearbeiten
        // `lage` blendet die Teilnehmerzahl aus. Ein blosses `teilnehmer: null`
        // taete das NICHT — das Feld rendert unabhaengig vom Wert, und eine im
        // Voraus eingetragene Zahl waere nach der Freigabe der Nenner der
        // Ruecklaufquote (Begruendung bei `AbendBearbeiten`).
        lage="planned"
        abend={{
          eveningId: abend.eveningId,
          datum: abend.datum,
          thema: abend.thema,
          teilnehmer: null,
          notizen: abend.notizen ?? null,
        }}
        offen={bearbeiten}
        schliessen={() => setBearbeiten(false)}
      />
    </div>
  );
}

/**
 * Der Planungsdialog. Vier Eingaben, kein `useActionState` — dieselbe Begründung
 * wie beim `NachtragenDialog` (§4.4): beide Daten sind `<input type="date">`,
 * der Takt ist eine Auswahl mit festen Werten.
 *
 * GESCHLOSSEN WIRD NACH DER ACTION, nicht im `onSubmit`: `destroyOnHidden` baut
 * das Formular sonst mitten im Absenden aus.
 */
function PlanenDialog({
  groupId,
  heute,
  belegteTage,
  offen,
  schliessen,
}: {
  groupId: number;
  heute: string;
  belegteTage: string[];
  offen: boolean;
  schliessen: () => void;
}) {
  const [start, setStart] = useState(heute);
  const [bis, setBis] = useState("");
  const [rhythmus, setRhythmus] = useState<Rhythmus>("zweiwochen");

  const belegt = useMemo(() => new Set(belegteTage), [belegteTage]);
  const vorschau = useMemo(() => {
    const ab = tagAusEingabe(start);
    if (ab === null) return [];
    return serienTermine(ab, tagAusEingabe(bis), rhythmus).map((termin) => {
      const iso = tagInZone(termin);
      return { termin, iso, schonDa: belegt.has(iso) };
    });
  }, [start, bis, rhythmus, belegt]);

  const neue = vorschau.filter((v) => !v.schonDa).length;
  const gedeckelt = vorschau.length === SERIE_MAX_TERMINE;

  return (
    <Modal
      open={offen}
      onCancel={schliessen}
      title="Dienstabende planen"
      footer={null}
      destroyOnHidden
    >
      <form
        data-testid="abende-planen"
        action={async (daten: FormData) => {
          await planEveningsAction(daten);
          schliessen();
        }}
        className="fb-form"
        style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <p style={{ ...T.meta, margin: 0 }}>
          Die Abende werden nur eingetragen. Das Feedback gibst du an jedem Abend einzeln frei —
          es kann immer nur eines laufen.
        </p>

        <label style={FELD}>
          <span style={T.kicker}>Erster Abend</span>
          <Input
            type="date"
            name="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </label>

        <label style={FELD}>
          <span style={T.kicker}>Rhythmus</span>
          {/*
           * `Select` statt `<select>`: die Suite gibt antd-Feldern ihre
           * Bediendichte über das Theme, ein nacktes Auswahlfeld stünde daneben.
           * Der Wert reist über ein verborgenes Feld ins FormData, weil antds
           * `Select` kein `name` an ein Formularelement hängt.
           */}
          <Select
            value={rhythmus}
            onChange={(wert: Rhythmus) => setRhythmus(wert)}
            options={RHYTHMEN.map((r) => ({ value: r.wert, label: r.text }))}
            aria-label="Rhythmus"
          />
          <input type="hidden" name="rhythmus" value={rhythmus} />
        </label>

        {rhythmus !== "einmalig" && (
          <label style={FELD}>
            <span style={T.kicker}>Bis einschließlich</span>
            <Input
              type="date"
              name="bis"
              value={bis}
              min={start}
              onChange={(e) => setBis(e.target.value)}
              required
            />
          </label>
        )}

        <label style={FELD}>
          <span style={T.kicker}>Thema</span>
          <Input name="topic" placeholder="optional, gilt für alle Termine" />
        </label>

        <div data-testid="planen-vorschau">
          <p style={{ ...T.meta, margin: 0 }}>
            {neue === 1 ? "1 Abend wird angelegt" : `${neue} Abende werden angelegt`}
            {vorschau.length > neue && ` · ${vorschau.length - neue} stehen schon`}
            {/*
             * „höchstens", nicht „mehr als … gehen nicht": an der Obergrenze ist
             * von aussen NICHT zu sehen, ob `serienTermine` etwas abgeschnitten
             * hat — eine Serie, die genau hineinpasst, sieht identisch aus. Der
             * Satz nennt deshalb die Regel und behauptet keinen Verlust.
             */}
            {gedeckelt && ` · höchstens ${SERIE_MAX_TERMINE} Termine in einem Zug`}
          </p>
          <ul style={{ ...T.meta, margin: `${SPACE.xs}px 0 0`, paddingInlineStart: 18 }}>
            {vorschau.map((v) => (
              <li key={v.iso} data-testid="vorschau-termin">
                {formatWochentag(v.termin)}, {formatDatumLang(v.termin)}
                {v.schonDa && " — steht schon"}
              </li>
            ))}
          </ul>
        </div>

        <Button type="primary" htmlType="submit" disabled={neue === 0}>
          {neue === 1 ? "Abend eintragen" : "Abende eintragen"}
        </Button>
      </form>
    </Modal>
  );
}
