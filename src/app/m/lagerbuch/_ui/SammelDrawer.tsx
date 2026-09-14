"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Flex, Input, Select, Space, Table } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { sammelAendereArtikel } from "../_actions/artikel";
import {
  SAMMEL_FELDNAMEN,
  sammelAenderungBauen,
  sammelVorschau,
  sammelWertText,
  type SammelAenderung,
  type SammelVorschau,
  type SammelVorschauZeile,
  type SammelZeile,
} from "../_lib/sammelAenderung";
import { SCHRIFT } from "../_lib/schrift";
import { Chip } from "./Chip";
import { KategorieEingabe } from "./KategorieEingabe";
import styles from "./verwaltung.module.css";

/** Fester Satz statt `e.message` — in Produktion waere das Framework-Englisch. */
const SPEICHERFEHLER =
  "Die Änderung konnte nicht gespeichert werden – bitte erneut versuchen.";

type SammelDrawerProps = {
  /** Die ausgewaehlten Artikel, in der Reihenfolge, in der sie stehen sollen. */
  zeilen: readonly SammelZeile[];
  /** Vergebene Kategorien als Vorschlaege (`kategorieOptionen`). */
  kategorien: readonly string[];
  onSchliessen: () => void;
  /** Nach erfolgreichem Speichern, mit der Zahl der erreichten Artikel. */
  onFertig: (betroffen: number) => void;
};

/**
 * DRK-293 — DIESELBE AENDERUNG AUF MEHRERE ARTIKEL, mit Vorschau.
 *
 * DREI DINGE ENTSCHEIDEN DIE FORM DIESER SCHUBLADE, und keines ist Geschmack:
 *
 * 1. JEDES FELD HAT EINEN EIGENEN HAKEN. Ein Formular, das alle drei Felder
 *    immer schickt, legt beim Speichern auch die Werte fest, die niemand
 *    angefasst hat — ein leer gelassenes Kategoriefeld hiesse dann still
 *    „ohne Kategorie" fuer die ganze Auswahl. Der Haken ist der Unterschied
 *    zwischen „nicht gesendet" und „auf leer gesetzt"; die Action liest ihn
 *    genauso (`undefined` gegen `null`).
 *
 * 2. DIE VORSCHAU ZAEHLT JE ARTIKEL, nicht ueber die Auswahl. Das
 *    Akzeptanzkriterium lautet „vor dem Speichern ist erkennbar, welche Artikel
 *    und Felder geaendert werden" — „15 Artikel ausgewaehlt" beantwortet das
 *    nicht, wenn drei davon den Wert schon tragen.
 *
 * 3. DIE KNOEPFE STEHEN IM `footer`, nicht unter der Liste. Die Vorschau kann
 *    Hunderte Zeilen lang sein; ein Knopf am Ende des Inhalts laege dann weit
 *    unter der Kante, und niemand meldet das als Fehler — es meldet sich als
 *    „geht nicht" (CLAUDE.md, Falle 13). Die Liste bekommt deshalb zusaetzlich
 *    eine eigene Hoehe und scrollt in sich.
 *
 * Breite ueber `flyinBreite` (nie eine nackte Zahl, nie `size="large"`): 640
 * traegt das Formular und die zweispaltige Vorschau nebeneinander, und der
 * Deckel haelt die Schublade auf einem schmalen Geraet im Bild.
 */
export function SammelDrawer({
  zeilen, kategorien, onSchliessen, onFertig,
}: SammelDrawerProps) {
  const [kategorieAn, setKategorieAn] = useState(false);
  const [kategorieWert, setKategorieWert] = useState("");
  const [fachAn, setFachAn] = useState(false);
  const [fachWert, setFachWert] = useState("");
  const [aktivAn, setAktivAn] = useState(false);
  const [aktivWert, setAktivWert] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const aenderung = useMemo(
    () => sammelAenderungBauen({
      kategorie: { an: kategorieAn, wert: kategorieWert },
      fach: { an: fachAn, wert: fachWert },
      aktiv: { an: aktivAn, wert: aktivWert },
    }),
    [kategorieAn, kategorieWert, fachAn, fachWert, aktivAn, aktivWert],
  );

  const vorschau = useMemo(() => sammelVorschau(zeilen, aenderung), [zeilen, aenderung]);

  // Das Fach ist das einzige Pflichtfeld dieser Maske: leer waere es kein
  // „unveraendert", sondern ein Artikel ohne Lagerplatz — die Action weist es
  // ohnehin ab, aber erst nach dem Klick.
  const fachLeer = fachAn && fachWert.trim() === "";
  const speicherbar = vorschau.felder.length > 0 && vorschau.betroffen > 0 && !fachLeer;

  async function speichern(): Promise<void> {
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await sammelAendereArtikel({
        ids: zeilen.map((zeile) => zeile.id),
        aenderung,
      });
      setBusy(false);
      if (!ergebnis.ok) {
        setFehler(ergebnis.fehler);
        return;
      }
      onFertig(ergebnis.wert.betroffen);
    } catch {
      setBusy(false);
      setFehler(SPEICHERFEHLER);
    }
  }

  return (
    <Drawer
      open
      onClose={onSchliessen}
      title={`${zeilen.length} Artikel bearbeiten`}
      size={flyinBreite(640)}
      rootClassName={styles.modul}
      destroyOnHidden
      footer={(
        <Flex gap={SPACE.sm} justify="flex-end">
          <Button onClick={onSchliessen} disabled={busy}>Abbrechen</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!speicherbar}
            onClick={() => { void speichern(); }}
            data-testid="sammel-speichern"
          >
            {vorschau.betroffen > 0
              ? `${vorschau.betroffen} Artikel ändern`
              : "Ändern"}
          </Button>
        </Flex>
      )}
    >
      <div style={{ display: "grid", gap: SPACE.xl }}>
        {fehler ? (
          // `type="warning"`, nicht `"error"`: Rot traegt in diesem Modul
          // fachliche Bedeutung (CLAUDE.md, Falle 3).
          <Alert type="warning" showIcon={false} title={fehler} />
        ) : null}

        <section>
          <h3 style={{ ...SCHRIFT.abschnitt, marginBlock: "0 12px" }}>
            Was soll sich ändern?
          </h3>
          <div style={{ display: "grid", gap: SPACE.md }}>
            <FeldZeile
              an={kategorieAn}
              onAn={setKategorieAn}
              beschriftung={SAMMEL_FELDNAMEN.kategorie}
            >
              <KategorieEingabe
                kategorien={kategorien}
                value={kategorieWert}
                onChange={setKategorieWert}
                aria-label="Kategorie für alle ausgewählten Artikel"
              />
              <div style={SCHRIFT.neben}>
                Leer lassen heißt „ohne Kategorie“.
              </div>
            </FeldZeile>

            <FeldZeile an={fachAn} onAn={setFachAn} beschriftung={SAMMEL_FELDNAMEN.fach}>
              <Input
                value={fachWert}
                onChange={(ereignis) => setFachWert(ereignis.target.value.toUpperCase())}
                aria-label="Fach für alle ausgewählten Artikel"
                autoComplete="off"
                status={fachLeer ? "error" : undefined}
              />
              {fachLeer ? (
                <div style={SCHRIFT.neben}>Fach darf nicht leer sein.</div>
              ) : null}
            </FeldZeile>

            <FeldZeile an={aktivAn} onAn={setAktivAn} beschriftung={SAMMEL_FELDNAMEN.aktiv}>
              {/* Zeichenketten statt `true`/`false`: antds Option traegt
                  `string | number | null`, ein `boolean` faellt am Typ durch. */}
              <Select<"aktiv" | "inaktiv">
                value={aktivWert ? "aktiv" : "inaktiv"}
                onChange={(wert) => setAktivWert(wert === "aktiv")}
                options={[
                  { value: "aktiv", label: "aktiv" },
                  { value: "inaktiv", label: "inaktiv" },
                ]}
                aria-label="Status für alle ausgewählten Artikel"
                virtual={false}
                style={{ width: "100%" }}
              />
            </FeldZeile>
          </div>
          <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.md }}>
            Name, Einheit und Mindestbestand gehören zum einzelnen Artikel und
            werden in seiner Schublade geändert.
          </div>
        </section>

        <section>
          <h3 style={{ ...SCHRIFT.abschnitt, marginBlock: "0 12px" }}>Vorschau</h3>
          <Zusammenfassung vorschau={vorschau} aenderung={aenderung} />
          <Table<SammelVorschauZeile>
            aria-label="Artikel dieser Sammeländerung"
            rowKey="id"
            dataSource={[...vorschau.zeilen]}
            pagination={false}
            // Eigene Hoehe: eine lange Auswahl schiebt sonst alles unter die
            // Kante, und im `footer` stehende Knoepfe helfen nur der Aktion,
            // nicht dem Lesen.
            scroll={{ y: 320, x: "max-content" }}
            style={{ marginBlockStart: SPACE.md }}
            locale={{ emptyText: "Kein Artikel ausgewählt." }}
            columns={[
              {
                title: <span style={SCHRIFT.feldname}>Artikel</span>,
                dataIndex: "name",
              },
              {
                title: <span style={SCHRIFT.feldname}>Ändert sich</span>,
                key: "felder",
                render: (_wert: unknown, zeile) => (
                  zeile.felder.length === 0
                    ? <span style={SCHRIFT.neben}>unverändert</span>
                    : (
                      <Space wrap size={6}>
                        {zeile.felder.map((feld) => (
                          <Chip key={feld} ton="grau">
                            {SAMMEL_FELDNAMEN[feld]} → {sammelWertText(feld, aenderung)}
                          </Chip>
                        ))}
                      </Space>
                    )
                ),
              },
            ]}
          />
        </section>
      </div>
    </Drawer>
  );
}

/**
 * Ein Haken und das Feld dahinter. Das Feld bleibt sichtbar und wird nur
 * gesperrt — ausgeblendet spraenge die Maske bei jedem Haken, und man saehe
 * nicht mehr, was ueberhaupt gemeinsam aenderbar ist.
 */
function FeldZeile({
  an, onAn, beschriftung, children,
}: {
  an: boolean;
  onAn: (an: boolean) => void;
  beschriftung: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Checkbox checked={an} onChange={(ereignis) => onAn(ereignis.target.checked)}>
        {beschriftung}
      </Checkbox>
      <div
        style={{ marginBlockStart: SPACE.xs, opacity: an ? 1 : 0.5 }}
        aria-hidden={!an}
        inert={!an}
      >
        {children}
      </div>
    </div>
  );
}

function Zusammenfassung({
  vorschau, aenderung,
}: {
  vorschau: SammelVorschau;
  aenderung: SammelAenderung;
}) {
  if (vorschau.felder.length === 0) {
    return (
      <div style={SCHRIFT.neben} data-testid="sammel-zusammenfassung">
        Noch kein Feld ausgewählt – es ändert sich nichts.
      </div>
    );
  }

  return (
    <div data-testid="sammel-zusammenfassung" style={{ display: "grid", gap: SPACE.sm }}>
      <div style={SCHRIFT.text}>
        {vorschau.betroffen === 0
          ? "Kein ausgewählter Artikel ändert sich – alle tragen die Werte bereits."
          : `${vorschau.betroffen} von ${vorschau.zeilen.length} Artikeln ändern sich`
            + (vorschau.unveraendert > 0
              ? ` – ${vorschau.unveraendert} tragen die Werte bereits.`
              : ".")}
      </div>
      <Space wrap size={6}>
        {vorschau.felder.map((feld) => (
          <Chip key={feld} ton="grau">
            {SAMMEL_FELDNAMEN[feld]} → {sammelWertText(feld, aenderung)}
          </Chip>
        ))}
      </Space>
    </div>
  );
}
