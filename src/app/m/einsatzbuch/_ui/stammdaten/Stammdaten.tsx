"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Tabs } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import type { FahrzeugDTO, PersonDTO, QualifikationDTO, Reiter, Stammdatenart, StichwortDTO } from "../../_lib/stammdaten/typen";
import { StammdatenTabelle, type Stammeintrag } from "./StammdatenTabelle";
import { StammdatenFormular } from "./StammdatenFormular";
import { CsvImport } from "./CsvImport";
import { HelferAbgleich } from "./HelferAbgleich";
import { StammfahrzeugAbgleich } from "./StammfahrzeugAbgleich";
import { QualifikationenTabelle, type QualifikationZeile } from "./QualifikationenTabelle";
import { QualifikationFormular } from "./QualifikationFormular";

const EINZAHL: Record<Reiter, string> = { fahrzeuge: "Fahrzeug", personal: "Person", stichworte: "Stichwort", qualifikationen: "Qualifikation" };

/**
 * Die Client-Insel der Stammdatenseite: Reiter, Tabelle, Formular- und Import-Schublade.
 *
 * Der `Seitenkopf` steht hier und nicht in `page.tsx`, weil sein Knopf „… anlegen“ vom
 * gewählten Reiter abhängt und die Schublade öffnet (dieselbe Bauform wie
 * `uav/_ui/admin/KatalogTabelle.tsx`). `Tabs` ist ein Client-Bauteil und darf deshalb nur hier
 * stehen (Falle 1). Die Listen kommen nach jedem Speichern über die Props neu, weil die
 * Actions `revalidatePath` rufen; kopiert wird hier nichts.
 *
 * Äußerer Container mit `minmax(0, 1fr)`: ein Gitterkind schrumpft sonst nicht unter die
 * Inhaltsbreite der Tabelle, und die Seite liefe auf dem Telefon waagerecht über (Begründung
 * in `uav/_ui/admin/KatalogTabelle.tsx`).
 */
export function Stammdaten({
  reiter: start,
  fahrzeuge,
  personal,
  stichworte,
  qualifikationen,
}: {
  reiter: Reiter;
  fahrzeuge: FahrzeugDTO[];
  personal: PersonDTO[];
  stichworte: StichwortDTO[];
  /** In Rangfolge, höchste zuerst. */
  qualifikationen: QualifikationDTO[];
}) {
  const router = useRouter();
  const [reiter, setReiter] = useState<Reiter>(start);
  /*
   * DIE URL BLEIBT DIE QUELLE. Ändert sich nur `?reiter=` (Seitenleiste „Stammdaten“, Zurück im
   * Browser), rendert der App Router dieselbe Insel mit neuem Prop, und `useState` hielte den
   * alten Reiter fest. Abgleich während des Renderns statt `useEffect` (React-Muster
   * „Zustand bei Prop-Wechsel anpassen“), damit kein Bild mit dem falschen Reiter entsteht.
   */
  const [vorherStart, setVorherStart] = useState(start);
  if (start !== vorherStart) {
    setVorherStart(start);
    setReiter(start);
  }
  const [formular, setFormular] = useState<{ art: Stammdatenart; eintrag: Stammeintrag | null } | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const [helferOffen, setHelferOffen] = useState(false);
  const [fahrzeugeOffen, setFahrzeugeOffen] = useState(false);
  const [qualiFormular, setQualiFormular] = useState<{ eintrag: QualifikationZeile | null } | null>(null);

  const traeger = new Map<string, number>();
  for (const p of personal) traeger.set(p.quali, (traeger.get(p.quali) ?? 0) + 1);
  const qualiZeilen: QualifikationZeile[] = qualifikationen.map((q) => ({ ...q, anzahl: traeger.get(q.kurz) ?? 0 }));

  function wechsle(key: string): void {
    const art = key as Reiter;
    setReiter(art);
    /*
     * RELATIV, NICHT ÜBER `usePathname()`. Unter dem Host-Rewrite des Proxys kann der Pfad in
     * der inneren Form `/m/einsatzbuch/stammdaten` ankommen (deshalb löst `SuiteNav` per
     * Suffix auf); ein daraus gebautes Ziel ergäbe auf dem Modulhost
     * `/m/einsatzbuch/m/einsatzbuch/…` und damit 404. `?reiter=` ersetzt nur die Suche.
     */
    router.replace(`?reiter=${art}`, { scroll: false });
  }

  function anlegen(): void {
    if (reiter === "qualifikationen") setQualiFormular({ eintrag: null });
    else setFormular({ art: reiter, eintrag: null });
  }

  const bearbeiten = (art: Stammdatenart) => (eintrag: Stammeintrag) => setFormular({ art, eintrag });
  const formularTitel = formular ? `${EINZAHL[formular.art]} ${formular.eintrag ? "bearbeiten" : "anlegen"}` : undefined;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Stammdaten"
        beschreibung="Fahrzeuge, Personal, Alarmstichworte und die Qualifikationen des Personals, aus denen der Einsatzbuch-Rechner auswählt. Deaktivierte Einträge verschwinden dort aus der Auswahl; versiegelte Einsätze behalten ihren Stand."
        aktionen={
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Button type="primary" onClick={anlegen}>
              {EINZAHL[reiter]} anlegen
            </Button>
            {reiter !== "qualifikationen" ? <Button onClick={() => setImportOffen(true)}>CSV importieren</Button> : null}
            {reiter === "personal" ? <Button onClick={() => setHelferOffen(true)}>Aus Helferverzeichnis abgleichen</Button> : null}
            {reiter === "fahrzeuge" ? <Button onClick={() => setFahrzeugeOffen(true)}>Aus Fahrzeugverwaltung abgleichen</Button> : null}
          </div>
        }
      />

      <Tabs
        activeKey={reiter}
        onChange={wechsle}
        items={[
          {
            key: "fahrzeuge",
            label: `Fahrzeuge · ${fahrzeuge.length}`,
            children: <StammdatenTabelle art="fahrzeuge" liste={fahrzeuge} onBearbeiten={bearbeiten("fahrzeuge")} />,
          },
          {
            key: "personal",
            label: `Personal · ${personal.length}`,
            children: <StammdatenTabelle art="personal" liste={personal} onBearbeiten={bearbeiten("personal")} />,
          },
          {
            key: "stichworte",
            label: `Stichworte · ${stichworte.length}`,
            children: <StammdatenTabelle art="stichworte" liste={stichworte} onBearbeiten={bearbeiten("stichworte")} />,
          },
          {
            key: "qualifikationen",
            label: `Qualifikationen · ${qualifikationen.length}`,
            children: <QualifikationenTabelle liste={qualiZeilen} onBearbeiten={(q) => setQualiFormular({ eintrag: q })} />,
          },
        ]}
      />

      <Drawer open={formular !== null} onClose={() => setFormular(null)} title={formularTitel} size={flyinBreite(480)} destroyOnHidden>
        {formular ? (
          <StammdatenFormular
            art={formular.art}
            eintrag={formular.eintrag}
            qualifikationen={qualifikationen}
            onGespeichert={() => setFormular(null)}
            onAbbrechen={() => setFormular(null)}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={qualiFormular !== null}
        onClose={() => setQualiFormular(null)}
        title={`Qualifikation ${qualiFormular?.eintrag ? "bearbeiten" : "anlegen"}`}
        size={flyinBreite(480)}
        destroyOnHidden
      >
        {qualiFormular ? (
          <QualifikationFormular
            eintrag={qualiFormular.eintrag}
            anzahl={qualiFormular.eintrag?.anzahl ?? 0}
            vorschlagRang={Math.min(99, Math.max(0, ...qualifikationen.map((q) => q.rang)) + 1)}
            onGespeichert={() => setQualiFormular(null)}
            onAbbrechen={() => setQualiFormular(null)}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={importOffen && reiter !== "qualifikationen"}
        onClose={() => setImportOffen(false)}
        title={`${reiter === "fahrzeuge" ? "Fahrzeuge" : reiter === "personal" ? "Personal" : "Stichworte"} aus CSV importieren`}
        size={flyinBreite(720)}
        destroyOnHidden
      >
        {importOffen && reiter !== "qualifikationen" ? <CsvImport art={reiter} onFertig={() => setImportOffen(false)} /> : null}
      </Drawer>

      <Drawer open={helferOffen} onClose={() => setHelferOffen(false)} title="Personal aus dem Helferverzeichnis" size={flyinBreite(720)} destroyOnHidden>
        {helferOffen ? <HelferAbgleich onFertig={() => setHelferOffen(false)} /> : null}
      </Drawer>

      <Drawer open={fahrzeugeOffen} onClose={() => setFahrzeugeOffen(false)} title="Fahrzeuge aus der Fahrzeugverwaltung" size={flyinBreite(720)} destroyOnHidden>
        {fahrzeugeOffen ? <StammfahrzeugAbgleich onFertig={() => setFahrzeugeOffen(false)} /> : null}
      </Drawer>
    </div>
  );
}
