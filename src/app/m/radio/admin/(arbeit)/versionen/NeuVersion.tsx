"use client";

// src/app/m/radio/admin/(arbeit)/versionen/NeuVersion.tsx
import { useState } from "react";
import { Button, Input, Space } from "antd";
import { versionAnlegenAction } from "../../actions";
import s from "../../../_ui/verwaltung.module.css";

/**
 * DAS ANLEGEFELD DER SOFTWAREVERSIONEN — 1:1 aus `SoftwareVersionsPage.tsx:188-199`.
 *
 * ⛔ CLIENT WEGEN FALLE 1 UND WEGEN DES ZUSTANDS: `Space.Compact` (`:188`) ist ein
 * Compound-Zugriff — in einer Server Component HTTP 500 (Bauform-Zulaessigkeitstafel Nr. 3,
 * `CLAUDE.md`) —, und das Eingabefeld haelt seinen Text selbst (`:23`, `:191-192`).
 *
 * ⛔ EIGENE DATEI NEBEN DER TABELLE, KEIN KIND (Entscheidung **E-V6**, und der Vorabscan hat
 * es namentlich vermerkt: `.superpowers/sdd/planteil4/VORABSCAN.md:520-537`, Fund **F22**):
 * sie teilt mit `VersionenTabelle` KEINEN Zustand und haengt an einer anderen Action. Die
 * Spec zaehlt beide dennoch als Insel 3 (`Spec:4505`) — deshalb steht die Datei hier und
 * nicht als neunte Insel. ⛔ Ihre Faelle stehen mit in `VersionenTabelle.test.tsx`, damit F22
 * seinen Waechter bekommt.
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, nicht als Prop gereicht
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`; Vorbild
 * `aufgaben/_ui/RoutinenTabelle.tsx:4`).
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul mehrfach ausgeschrieben
 * (`_ui/RueckgabeDialog.tsx:311-315`, `geraete/NeuGeraetModal.tsx:40-45`,
 * `geraete/[id]/GeraetLoeschen.tsx:46-49`). ⚠️ Damit entfaellt das „Version angelegt" aus
 * `SoftwareVersionsPage.tsx:33` als BENANNTE Abweichung; der Auftragsbrief fuehrt es unter
 * den drei Meldungen dieser Flaeche (`.superpowers/sdd/planteil4/briefs/V19.md:31-33`), und
 * das Haus hat gegen den Toast entschieden. Sichtbar bleibt der Erfolg trotzdem: die Action
 * schreibt `revalidatePath` auf diese Seite (`admin/actions.ts`), die neue Zeile steht danach
 * OBEN in der Tabelle, und das Feld ist leer.
 *
 * ⛔ DIE ZWEI FEHLERTEXTE STEHEN NICHT HIER, SONDERN IN DER ACTION („Diese Version existiert
 * bereits" `admin/actions.ts:136` woertlich `SoftwareVersionsPage.tsx:37`; „Version konnte
 * nicht angelegt werden" `:137` woertlich `:38`). Zwei Fassungen desselben Satzes ohne
 * Waechter laufen beim ersten Umbau auseinander — die Flaeche zeigt, was der Server sagt.
 */

export function NeuVersion() {
  const [wert, setWert] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const anlegen = async () => {
    /*
     * ⛔ 1:1 `SoftwareVersionsPage.tsx:28-29`: getrimmt, und ein leerer Wert laeuft gar nicht
     * erst los. ⚠️ Die WAHRHEIT ist die serverseitige Pruefung in `versionAnlegenAction`
     * (`admin/actions.ts`) — „eine Regel, die nur im Client steht, ist keine Regel"
     * (`Spec:3583-3585`). Diese hier spart den Rundlauf.
     */
    const sauber = wert.trim();
    if (sauber === "") return;
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await versionAnlegenAction(sauber);
    setLaeuft(false);
    if (ergebnis.ok) {
      /* ⛔ NUR DER ERFOLGSFALL LEERT (1:1 `:32`) — sonst tippt der Bedienende seine Korrektur neu. */
      setWert("");
      return;
    }
    setFehler(ergebnis.fehler);
  };

  return (
    <div className={s.werkzeugleiste} data-rolle="radio-neuversion">
      {/* ⛔ OHNE `style={{ maxWidth: 420 }}` (`:188`): Masse dieses Moduls stehen im
          Stylesheet (`_ui/verwaltung.module.css`, `.suchfeld`), nicht im Markup. */}
      <Space.Compact className={s.suchfeld}>
        <Input
          /* ⛔ Beschriftung und Platzhalter woertlich `:190` und `:194`. */
          placeholder="Neue Version, z. B. FW 12.3"
          aria-label="Neue Version"
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          onPressEnter={anlegen}
          data-rolle="radio-neuversion-eingabe"
        />
        {/* ⚠️ BENANNTE ABWEICHUNG: KEIN `<FiPlus />` (`:196`). `_ui/ikonen.tsx` ist die EINE
            Zeichenquelle des Moduls (Entscheidung E-V7, NS-A8b) und auf ZWOELF Namen
            festgenagelt (`_ui/ikonen.tsx:55-67`, gehalten von `_ui/ikonen.test.tsx:108`); ein
            Pluszeichen ist dort nicht dabei, und ein `react-icons`-Import waere Falle 7. Die
            Beschriftung traegt die Aussage — dieselbe Wahl wie in `geraete/GeraeteTabelle.tsx`
            und `software/UpdateSuche.tsx`. */}
        <Button
          type="primary"
          loading={laeuft}
          onClick={anlegen}
          data-rolle="radio-neuversion-anlegen"
        >
          Anlegen
        </Button>
      </Space.Compact>
      {fehler !== null && (
        /*
          ⛔ KEIN `Alert type="error"` UND KEIN ROTTON: `colorError === colorPrimary`
          (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die
          Primaeraktion (Falle 3). Dieselbe Form wie `geraete/NeuGeraetModal.tsx`.
        */
        <p className={s.dialogFehler} role="alert" data-rolle="radio-neuversion-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}
