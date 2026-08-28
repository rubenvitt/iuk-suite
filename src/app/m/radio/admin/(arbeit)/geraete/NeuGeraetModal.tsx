"use client";

// src/app/m/radio/admin/(arbeit)/geraete/NeuGeraetModal.tsx
import { useState } from "react";
import { Input, Modal } from "antd";
import { geraetAnlegenAction } from "../../actions";
import s from "../../../_ui/verwaltung.module.css";

/**
 * DER ANLEGEN-DIALOG — Nachfolger von `DeviceFormModal.tsx`.
 *
 * ⛔ KIND VON INSEL 1 (E-V6): er haengt am `createOpen`-Zustand der Werkzeugleiste
 * (`DeviceList.tsx:40`, `:232`).
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, NICHT ALS PROP DURCHGEREICHT
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`; Vorbild
 * `src/app/m/aufgaben/_ui/RoutinenTabelle.tsx:4`). Eine Server Action als Prop ist
 * `Error: Functions cannot be passed directly to Client Components`.
 *
 * ⛔ EINZIGES PFLICHTFELD IST DIE ISSI — 1:1 aus `DeviceFields.tsx:64` („ISSI ist
 * erforderlich"). ⛔ UND KEINE MAXIMALLAENGE: der Bestand fuehrt auf KEINEM Textfeld eine
 * serverseitige Grenze (`radio-admin/shared/src/schemas.ts:50-99`, gezaehlt: `issi` plus 19
 * `nullable().optional()`), und die Spalten sind `text(...)` ohne Laengenbegrenzung
 * (`_db/schema.ts:19-65`). Eine hier erfundene Grenze waere eine Regel, die der Bestand nicht
 * hat.
 *
 * ⬜ DIE UEBRIGEN NEUNZEHN FELDER FEHLEN HIER — BENANNTE LEERSTELLE, KEINE AUSLASSUNG.
 * `DeviceFormModal.tsx:97-99` rendert `DeviceFields` (194 Zeilen, **21 gerenderte
 * `Form.Item`, davon 20 benannte**); dieser Feldsatz ist der Pruefgegenstand von Aufgabe
 * **V14** (`GeraetFormular.tsx`, Insel 6, `Spec:4508`), und `Spec:4834-4836` legt ihn
 * ausdruecklich in EINE Datei („aus 14 Dateien … werden sieben"). Ihn hier vorwegzunehmen
 * hiesse, ihn zweimal zu fuehren — und die zweite Kopie ist die, die still veraltet.
 * ⛔ Der Weg bleibt vollstaendig: anlegen mit der ISSI, dann auf der Geraeteakte
 * `/admin/geraete/<id>` weiterpflegen — dieselbe Haltung wie V14s Umgang mit dem Link auf
 * die Ereignisseite („⛔ Ein Link auf eine 404 ist schlimmer als kein Link — der Link
 * entsteht in V15, nicht hier", `.superpowers/sdd/planteil4/briefs/V14.md:33-36`).
 * ⚠️ EIGENTUEMER IST NICHT V14: dessen Files-Zeile fuehrt diese Datei NICHT
 * (`.superpowers/sdd/planteil4/briefs/V14.md:3-5`). Der Posten steht im Bericht zu V13.
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul zweimal ausgeschrieben
 * (`_ui/RueckgabeDialog.tsx:311-315`, `_ui/AusleihVorgang.tsx:443-446`): in `src/app` gibt es
 * keinen Aufruf von `message.*` oder `App.useApp()`. ⚠️ Damit entfaellt auch das
 * „Gerät angelegt" aus `DeviceFormModal.tsx:73` — benannte Abweichung. Der FEHLER steht
 * dafuer am Ort der Aktion, und sein Text kommt aus der Action selbst
 * (`admin/actions.ts:131-132`), nicht aus einer zweiten Liste hier.
 */

/**
 * ⛔ ER WIRD NUR IM OFFENEN ZUSTAND GERENDERT — `GeraeteTabelle.tsx` haengt ihn erst beim
 * Oeffnen ein. Das ist die Suite-Form von `destroyOnHidden` (`DeviceFormModal.tsx:95`):
 * jedes Oeffnen bekommt einen frischen Zustand, ohne dass ein Effekt ihn zuruecksetzen muss.
 * ⛔ EIN `useEffect`, DER `setState` RUFT, IST HIER EIN LINT-FEHLER
 * (`react-hooks/set-state-in-effect`) — und die Regel hat recht: der Umweg ueber einen
 * Effekt rendert zweimal und laesst den alten Wert einen Frame lang stehen.
 */
export type NeuGeraetModalProps = {
  aufSchliessen: () => void;
};

export function NeuGeraetModal({ aufSchliessen }: NeuGeraetModalProps) {
  const [issi, setIssi] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const anlegen = async () => {
    const sauber = issi.trim();
    if (!sauber) {
      // 1:1 aus `DeviceFields.tsx:64` — der Text der Pflichtfeldregel des Bestands.
      setFehler("ISSI ist erforderlich");
      return;
    }
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await geraetAnlegenAction({ issi: sauber });
    setLaeuft(false);
    if (ergebnis.ok) {
      aufSchliessen();
      return;
    }
    setFehler(ergebnis.fehler);
  };

  return (
    <Modal
      title="Gerät anlegen"
      open
      onOk={anlegen}
      onCancel={aufSchliessen}
      confirmLoading={laeuft}
      okText="Anlegen"
      cancelText="Abbrechen"
    >
      <div className={s.filterFeld}>
        <label htmlFor="radio-neu-issi" className={s.filterEtikett}>
          ISSI
        </label>
        <Input
          id="radio-neu-issi"
          value={issi}
          onChange={(e) => setIssi(e.target.value)}
          data-rolle="radio-neu-issi"
        />
      </div>
      {fehler !== null && (
        /*
          ⛔ KEIN `Alert type="error"` UND KEIN ROTTON: `colorError === colorPrimary`
          (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die
          Primaeraktion (Falle 3). Dieselbe Form wie `_ui/RueckgabeDialog.tsx:320-322`.
        */
        <p className={s.dialogFehler} role="alert" data-rolle="radio-neu-fehler">
          {fehler}
        </p>
      )}
    </Modal>
  );
}
