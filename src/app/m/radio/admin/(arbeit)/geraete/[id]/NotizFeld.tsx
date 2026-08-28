"use client";

// src/app/m/radio/admin/(arbeit)/geraete/[id]/NotizFeld.tsx
import { useState } from "react";
import { Button, Input, Space } from "antd";
import { notizAnfuegenAction } from "../../../actions";
import type { RadioRolle } from "../../../../_lib/rollen";
import s from "../../../../_ui/verwaltung.module.css";
import { VIkone } from "../../../../_ui/verwaltungIkonen";
import { gesperrtFuer } from "./GeraetFormular";

/**
 * DAS NOTIZFELD — Nachfolger von `UpdateNotePanel.tsx`, ⛔ APPEND-ONLY.
 *
 * ⛔ EIGENE INSEL NEBEN DEM FORMULAR, KEIN KIND (Entscheidung **E-V6**): sie teilt mit ihm
 * keinen Zustand und haengt an einer anderen Action (`notizAnfuegenAction`). ⛔ Die Action wird
 * DIREKT importiert, nicht als Prop gereicht (Bauform-Zulaessigkeitstafel Nr. 6,
 * `Spec:4495-4497`).
 *
 * ⛔ CLIENT WEGEN FALLE 1 UND WEGEN DES ZUSTANDS: `Space.Compact` (`UpdateNotePanel.tsx:37`) ist
 * ein Compound-Zugriff — in einer Server Component HTTP 500 —, und das Eingabefeld haelt seinen
 * Text selbst.
 *
 * ⛔ ANHAENGEN DARF JEDE STUFE (`Spec:4448`, Tafel `Spec:4444-4454`: „Notiz anfuegen | ja |
 * ja"). ⛔ DIE BISHERIGE ANMERKUNG SIEHT HIER ABER NUR DIE UPDATER-STUFE, und diese
 * Fallunterscheidung wandert 1:1 mit (`briefs/V14.md:92-96`): der Bestand zeigt das ganze Panel
 * nur Nicht-Admins (`DeviceDetailDrawer.tsx:109`), weil Admins die Anmerkung im Formularfeld
 * `updateNote` sehen (`DeviceFields.tsx:181-190`). ⛔ Wer sie hier bedingungslos zeigte, zeigte
 * sie fuer Admins DOPPELT — einmal als Text, einmal als Eingabefeld, und die zwei koennten
 * verschiedene Staende zeigen.
 *
 * ⛔ DIE BEDINGUNG WIRD NICHT NACHGEBAUT, SONDERN GELESEN: `gesperrtFuer` steht in
 * `GeraetFormular.tsx` und entscheidet dort, ob das Feld gerendert wird. Zwei Kopien derselben
 * Bedingung sind der Lehrbuchfall, in dem die Korrektur nur an einer ankommt.
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`): das „Anmerkung hinzugefügt" aus
 * `UpdateNotePanel.tsx:20` entfaellt als benannte Abweichung, der Fehlertext kommt aus der
 * Action (`admin/actions.ts`). Nach dem Erfolg schreibt die Action `revalidatePath` auf diese
 * Seite, und die angehaengte Zeile steht im naechsten Server-Rendering oben im Text.
 */

export type NotizFeldProps = {
  geraetId: string;
  /** Die gespeicherte, append-only Anmerkung (`_db/schema.ts:56-59`). */
  anmerkung: string | null;
  rolle: RadioRolle;
};

export function NotizFeld({ geraetId, anmerkung, rolle }: NotizFeldProps) {
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  /* Genau dann, wenn das Formularfeld `updateNote` fehlt — siehe Kopf. */
  const zeigtAnmerkung = gesperrtFuer(rolle)("updateNote");

  const anhaengen = async () => {
    /*
     * ⛔ 1:1 aus `UpdateNotePanel.tsx:17-19`: leerer Text laeuft gar nicht erst los, und
     * gesendet wird der GETRIMMTE. ⚠️ Die Wahrheit ist die serverseitige Pruefung in
     * `notizAnfuegenAction` — „eine Regel, die nur im Client steht, ist keine Regel"
     * (`Spec:3583-3585`). Diese hier spart den Rundlauf.
     */
    const sauber = text.trim();
    if (sauber === "") return;
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await notizAnfuegenAction(geraetId, sauber);
    setLaeuft(false);
    if (ergebnis.ok) {
      setText("");
      return;
    }
    setFehler(ergebnis.fehler);
  };

  return (
    /*
      ⛔ EIN `div` STATT `Space direction="vertical" size={8}` (`UpdateNotePanel.tsx:28`): der
      Abstand steht im Stylesheet, weil `size=` auf einem antd-Bauteil modulweit verboten ist
      (Falle 4, durchgesetzt von `_ui/AusleihRahmen.test.tsx:196-215` ueber JEDE `.tsx` des
      Moduls — gemessen rot, als hier noch `size={8}` stand).
    */
    <div className={s.notizFeld}>
      <strong>Update-Anmerkung</strong>
      {zeigtAnmerkung && (
        /*
          ⛔ `whiteSpace: "pre-wrap"` 1:1 aus `UpdateNotePanel.tsx:31`: die Anmerkung ist eine
          ZEILENWEISE Historie (`[YYYY-MM-DD · Autor] Text`, `_lib/notiz.ts`), und ohne den
          Umbruchserhalt liefe sie zu einem Absatz zusammen.
        */
        <p className={s.notizText} data-rolle="radio-notiz-bisher">
          {anmerkung ?? "Keine Anmerkung."}
        </p>
      )}
      <Space.Compact className={s.notizZeile}>
        <Input
          placeholder="Anmerkung anhängen (z. B. ISSI weicht ab)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={anhaengen}
          data-rolle="radio-notiz-eingabe"
        />
        <Button
          onClick={anhaengen}
          loading={laeuft}
          icon={<VIkone name="plus" />}
          data-rolle="radio-notiz-anhaengen"
        >
          Hinzufügen
        </Button>
      </Space.Compact>
      {fehler !== null && (
        <p className={s.dialogFehler} role="alert" data-rolle="radio-notiz-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}
