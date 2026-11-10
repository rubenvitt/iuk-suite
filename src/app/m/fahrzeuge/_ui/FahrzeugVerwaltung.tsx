"use client";

import { useState } from "react";
import { App, Button, Drawer } from "antd";
import { Statuschip } from "@/core/status/Statuschip";
import { Kartentabelle, filterAktiv, nachText, trifftWert, werteAlsFilter, zustandsFilter, type FilterZustand } from "@/core/tabelle";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { aktivSetzenAction } from "../_actions/verwaltung";
import type { FahrzeugDTO } from "../_lib/daten";
import { ARTEN } from "../_lib/eingabe";
import { FahrzeugFormular } from "./FahrzeugFormular";

/**
 * Die Folge in den anderen Apps, in einem Satz (IDA-384). Belegt an den Empfängern von
 * `bereitgestellteFahrzeuge`: Schichtplanung, Lagemonitor und Gerätewartung filtern auf `aktiv`, die drei
 * anderen führen eigene Zeilen und deaktivieren sie in ihrem Abgleich.
 */
const FOLGE_AUSSER_DIENST =
  "Schichtplanung, Lagemonitor und Gerätewartung bieten es nicht mehr an; Einsatztagebuch, Lagerbuch und Funkgeräte übernehmen das beim nächsten Abgleich.";

const ART_TEXT = Object.fromEntries(ARTEN.map((a) => [a.wert, a.text])) as Record<FahrzeugDTO["art"], string>;

/**
 * Die Client-Insel der Fahrzeugliste: Seitenkopf mit „Fahrzeug anlegen“, Kartentabelle und die
 * Formular-Schublade (Vorbild `einsatzbuch/_ui/stammdaten/Stammdaten.tsx`). Nur serialisierbare Props,
 * die Actions direkt importiert (Falle 9). Die Liste kommt nach jedem Speichern über die Props neu, weil
 * die Actions `revalidatePath` rufen; gemerkt wird hier nur der Filterzustand (Falle 15).
 *
 * Ohne Verwaltungsrecht fehlen Anlegen, Bearbeiten und Aktivieren — dasselbe Prädikat
 * (`darfFahrzeugeVerwalten`) riegelt auf dem Server jede Action.
 */
export function FahrzeugVerwaltung({ liste, darfVerwalten }: { liste: FahrzeugDTO[]; darfVerwalten: boolean }) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [formular, setFormular] = useState<{ eintrag: FahrzeugDTO | null } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const status = zustandsFilter<FahrzeugDTO>([
    { wert: "aktiv", text: "im Dienst", trifft: (f) => f.aktiv },
    { wert: "inaktiv", text: "außer Dienst", trifft: (f) => !f.aktiv },
  ]);

  /**
   * Ohne Rückfrage (rückholbar), aber mit Meldung: außer Dienst nennt die Folge und bietet „Rückgängig“.
   * Ein Schlüssel je Fahrzeug, damit „Rückgängig“ die eigene Meldung ersetzt statt eine zweite zu stapeln.
   */
  function umschalten(f: Pick<FahrzeugDTO, "id" | "funkrufname">, aktiv: boolean): void {
    setLaeuft(f.id);
    const key = `dienst-${f.id}`;
    void aktivSetzenAction(f.id, aktiv)
      .then((ergebnis) => {
        if (!ergebnis.ok) {
          void message.warning(ergebnis.fehler);
          return;
        }
        if (aktiv) {
          void message.success({ key, content: `${f.funkrufname} ist wieder im Dienst.` });
          return;
        }
        void message.info({
          key,
          duration: 10,
          content: (
            <span data-testid="ausser-dienst-meldung">
              {f.funkrufname} ist außer Dienst. {FOLGE_AUSSER_DIENST}{" "}
              <Button type="link" style={{ paddingInline: 0, height: "auto" }} onClick={() => { message.destroy(key); umschalten(f, true); }}>
                Rückgängig
              </Button>
            </span>
          ),
        });
      })
      .catch(() => void message.warning("Der Status ließ sich nicht ändern. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  const aktiv = liste.filter((f) => f.aktiv).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Fahrzeuge"
        beschreibung={`${aktiv} im Dienst`}
        aktionen={darfVerwalten ? <Button type="primary" onClick={() => setFormular({ eintrag: null })}>Fahrzeug anlegen</Button> : undefined}
      />

      <Kartentabelle<FahrzeugDTO>
        rowKey="id"
        aria-label="Fahrzeuge"
        dataSource={liste}
        filter={filter}
        onFilter={setFilter}
        leer={{
          nichts: "Noch keine Fahrzeuge",
          figur: "fahrzeuge",
          gefiltert: "Kein Fahrzeug passt zum Filter.",
          aktiv: liste.length > 0 && filterAktiv(filter),
        }}
        columns={[
          { title: "Funkrufname", key: "funkrufname", sorter: nachText<FahrzeugDTO>((f) => f.funkrufname), render: (_: unknown, f: FahrzeugDTO) => f.funkrufname },
          { title: "Funkkenner", key: "funkkenner", sorter: nachText<FahrzeugDTO>((f) => f.funkkenner ?? ""), render: (_: unknown, f: FahrzeugDTO) => f.funkkenner ?? "—" },
          {
            title: "Typ",
            key: "typ",
            filters: werteAlsFilter(liste, (f) => f.typ),
            onFilter: trifftWert<FahrzeugDTO>((f) => f.typ),
            render: (_: unknown, f: FahrzeugDTO) => (f.art === "anhaenger" ? `${f.typ} (Anhänger)` : f.typ),
          },
          { title: "Kennzeichen", key: "kennzeichen", render: (_: unknown, f: FahrzeugDTO) => f.kennzeichen ?? "—" },
          {
            title: "Standort",
            key: "standort",
            filters: werteAlsFilter(liste, (f) => f.standort),
            onFilter: trifftWert<FahrzeugDTO>((f) => f.standort),
            render: (_: unknown, f: FahrzeugDTO) => f.standort,
          },
          {
            title: "Status",
            key: "status",
            ...status,
            render: (_: unknown, f: FahrzeugDTO) => <Statuschip ton={f.aktiv ? "ok" : "neutral"}>{f.aktiv ? "im Dienst" : "außer Dienst"}</Statuschip>,
          },
          ...(darfVerwalten
            ? [{
                title: "Aktionen",
                key: "aktionen",
                render: (_: unknown, f: FahrzeugDTO) => (
                  <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                    <Button onClick={() => setFormular({ eintrag: f })}>Bearbeiten</Button>
                    <Button onClick={() => umschalten(f, !f.aktiv)} loading={laeuft === f.id} disabled={laeuft !== null && laeuft !== f.id}>
                      {f.aktiv ? "Außer Dienst stellen" : "In Dienst stellen"}
                    </Button>
                  </div>
                ),
              }]
            : []),
        ]}
      />

      <Drawer
        open={formular !== null}
        onClose={() => setFormular(null)}
        title={formular?.eintrag ? `${ART_TEXT[formular.eintrag.art]} bearbeiten` : "Fahrzeug anlegen"}
        size={flyinBreite(480)}
        destroyOnHidden
      >
        {formular ? <FahrzeugFormular eintrag={formular.eintrag} onFertig={() => setFormular(null)} /> : null}
      </Drawer>
    </div>
  );
}
