"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Tabs } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "../../_lib/stammdaten/typen";
import { StammdatenTabelle, type Stammeintrag } from "./StammdatenTabelle";
import { StammdatenFormular } from "./StammdatenFormular";
import { CsvImport } from "./CsvImport";

const EINZAHL: Record<Stammdatenart, string> = { fahrzeuge: "Fahrzeug", personal: "Person", stichworte: "Stichwort" };

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
}: {
  reiter: Stammdatenart;
  fahrzeuge: FahrzeugDTO[];
  personal: PersonDTO[];
  stichworte: StichwortDTO[];
}) {
  const router = useRouter();
  const [reiter, setReiter] = useState<Stammdatenart>(start);
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

  function wechsle(key: string): void {
    const art = key as Stammdatenart;
    setReiter(art);
    /*
     * RELATIV, NICHT ÜBER `usePathname()`. Unter dem Host-Rewrite des Proxys kann der Pfad in
     * der inneren Form `/m/einsatzbuch/stammdaten` ankommen (deshalb löst `SuiteNav` per
     * Suffix auf); ein daraus gebautes Ziel ergäbe auf dem Modulhost
     * `/m/einsatzbuch/m/einsatzbuch/…` und damit 404. `?reiter=` ersetzt nur die Suche.
     */
    router.replace(`?reiter=${art}`, { scroll: false });
  }

  const bearbeiten = (art: Stammdatenart) => (eintrag: Stammeintrag) => setFormular({ art, eintrag });
  const formularTitel = formular ? `${EINZAHL[formular.art]} ${formular.eintrag ? "bearbeiten" : "anlegen"}` : undefined;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Stammdaten"
        beschreibung="Fahrzeuge, Personal und Alarmstichworte, aus denen der Einsatzbuch-Rechner auswählt. Deaktivierte Einträge verschwinden dort aus der Auswahl; versiegelte Einsätze behalten ihren Stand."
        aktionen={
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Button type="primary" onClick={() => setFormular({ art: reiter, eintrag: null })}>
              {EINZAHL[reiter]} anlegen
            </Button>
            <Button onClick={() => setImportOffen(true)}>CSV importieren</Button>
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
        ]}
      />

      <Drawer open={formular !== null} onClose={() => setFormular(null)} title={formularTitel} size={flyinBreite(480)} destroyOnHidden>
        {formular ? (
          <StammdatenFormular
            art={formular.art}
            eintrag={formular.eintrag}
            onGespeichert={() => setFormular(null)}
            onAbbrechen={() => setFormular(null)}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={importOffen}
        onClose={() => setImportOffen(false)}
        title={`${reiter === "fahrzeuge" ? "Fahrzeuge" : reiter === "personal" ? "Personal" : "Stichworte"} aus CSV importieren`}
        size={flyinBreite(720)}
        destroyOnHidden
      >
        {importOffen ? <CsvImport art={reiter} onFertig={() => setImportOffen(false)} /> : null}
      </Drawer>
    </div>
  );
}
