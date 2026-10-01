"use client";

import { useId } from "react";
import { Alert, Button, ConfigProvider, Segmented, type ThemeConfig } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { zeitFormat } from "@/core/zeit";
import { TYP_NAME, tagZuMs, type Planangaben } from "../../_lib/angaben";
import type { EditorAnsicht } from "../../_lib/editorAnsicht";
import { kalendertag } from "../../_lib/rahmen";
import type { SpeicherZustand } from "./speicherer";

/**
 * Rückgängig/Wiederholen nehmen dem Titelfeld der Gliederung beim Zeigerdruck nicht den Fokus: sonst
 * verwürfe dessen Verlassen eine eben angelegte, unberührte Zeile, und der Klick nähme danach noch einen
 * Schritt zurück (Review Phase 3). Safari fokussiert Knöpfe beim Klick ohnehin nicht; `data-verlauf`
 * erkennt die Gliederung, wo der Fokus trotzdem hierher wandert.
 */
export const VERLAUFSKNOPF = { "data-verlauf": "", onMouseDown: (e: { preventDefault(): void }) => e.preventDefault() } as const;
/**
 * Der Umschalter ist am Telefon der einzige Weg ins Diagramm: antd zieht vom `controlHeight` je 2 px
 * Spurrand ab, die Segmente wären 40 px hoch. 48 ergibt 44 px je Segment (WCAG 2.5.5, Falle 4) — per
 * Token, nicht per CSS (Falle 5; Review Phase 3).
 */
const UMSCHALTER_DICHTE: ThemeConfig = { components: { Segmented: { controlHeight: 48 } } };
// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Der Speicherstatus in Worten (docs/design/README.md: Bedeutung nie allein über Farbe) — KURZ und in
 * einem Platz fester Mindestbreite (Entscheidung 19): wechselnd lange Texte im Sekundentakt ließen
 * die umbrechende Werkzeugleiste und damit die Fläche springen. Die lange Fehlermeldung steht im
 * Hinweis in der Fläche.
 */
export function statusText(z: SpeicherZustand): string {
  switch (z.status) {
    case "gespeichert": return z.zuletztGespeichert === null ? "Gespeichert" : `Gespeichert ${UHR.format(z.zuletztGespeichert)}`;
    case "ungespeichert": return "Ungespeichert";
    case "speichert": return "Speichert …";
    case "fehler": return "Nicht gespeichert";
    case "konflikt": return "Konflikt";
  }
}

/**
 * KOPFLEISTE (Spec §6.2): Titel, Umschalter Diagramm | Gliederung (ohne Wahl in der Adresse zwei
 * Umschalter, CSS zeigt je Breakpoint einen — Phase 3, Entscheidung 1), Rückgängig/Wiederholen, „Plan und Verbindungen",
 * „Drucken (A4 quer)" (derselbe Name wie im Betrachter, Entscheidung 20), Speicherstatus (`aria-live`
 * genau hier, docs/design/feedback-admin.md 4.14). `Seitenkopf` trägt weder eine Client-Direktive
 * noch Server-Abhängigkeiten und darf deshalb auch hier rendern. Der Konflikthinweis bleibt im
 * Fluss: er ist ein Zustand, der eine Entscheidung verlangt, kein vorübergehender Hinweis.
 */
export function Kopfleiste({ angaben, zustand, standSeit, kannRueck, kannWieder, ansicht, onAnsicht, onRueck, onWieder, onPlan, onDrucken, onNeuLaden, onBehalten }: {
  angaben: Planangaben; zustand: SpeicherZustand; standSeit: number; kannRueck: boolean; kannWieder: boolean;
  /** Ausdrücklich gewählte Ansicht; `null` = ohne Wahl (CSS am Breakpoint). */
  ansicht: EditorAnsicht | null; onAnsicht: (a: EditorAnsicht) => void;
  onRueck: () => void; onWieder: () => void; onPlan: () => void; onDrucken: () => void;
  onNeuLaden: () => void; onBehalten: () => void;
}) {
  // Eigener Name je Umschalter: antds Vorgabe (`useId` von rc-util) ist unter NODE_ENV=test für alle gleich,
  // und zwei Radiogruppen gleichen Namens teilten sich ein „checked" (Automodus: zwei Umschalter im DOM).
  const basis = useId();
  const umschalter = (wert: EditorAnsicht, klasse?: string) => (
    <ConfigProvider theme={UMSCHALTER_DICHTE}>
      <Segmented<EditorAnsicht> className={klasse} name={`${basis}-${klasse ?? "ansicht"}`} aria-label="Ansicht" value={wert} onChange={onAnsicht}
        options={[{ value: "diagramm", label: "Diagramm" }, { value: "gliederung", label: "Gliederung" }]} />
    </ConfigProvider>
  );
  const stand = zustand.zuletztGespeichert ?? standSeit;
  const beschreibung = [TYP_NAME[angaben.typ], angaben.anlass, angaben.datum ? kalendertag(tagZuMs(angaben.datum)) : null, `Stand ${STAND.format(stand)}`]
    .filter(Boolean).join(" · ");
  return (
    <>
      <Seitenkopf titel={angaben.titel} zurueck={{ titel: "Alle Pläne", href: "/" }} beschreibung={beschreibung}
        aktionen={
          <div className="kp-kopfwerkzeuge" role="toolbar" aria-label="Plan bearbeiten">
            {ansicht === null
              ? <>{umschalter("diagramm", "kp-nur-breit")}{umschalter("gliederung", "kp-nur-schmal")}</>
              : umschalter(ansicht)}
            {/* Am Telefon steht „Rückgängig“ samt Status in der klebenden Verlaufsleiste des Editors (Review Phase 3). */}
            <Button {...VERLAUFSKNOPF} className="kp-nur-breit" onClick={onRueck} disabled={!kannRueck}>Rückgängig</Button>
            <Button {...VERLAUFSKNOPF} onClick={onWieder} disabled={!kannWieder}>Wiederholen</Button>
            <Button onClick={onPlan}>Plan und Verbindungen</Button>
            <Button onClick={onDrucken}>Drucken (A4 quer)</Button>
            <span className="kp-speicherstatus kp-nur-breit" role="status" aria-live="polite" data-status={zustand.status}>{statusText(zustand)}</span>
          </div>
        } />
      {zustand.konflikt ? (
        <Alert type="warning" showIcon className="kp-hinweis" title="Jemand anderes hat diesen Plan inzwischen geändert."
          // Knöpfe UNTER dem Text, nicht als `action` daneben: am Telefon blieb dem Text sonst eine Spalte von
          // rund 80 px (Review Phase 2); `kp-formular-knoepfe` stellt sie schmal untereinander, breit nebeneinander.
          description={<>
            <p className="kp-konflikt-text">{`Gespeichert um ${UHR.format(zustand.konflikt.aktualisiertAm)} von ${zustand.konflikt.aktualisiertVon}. Deine letzten Änderungen am Diagramm sind noch nicht gespeichert. „Meine Fassung behalten“ überschreibt das Diagramm; die Planangaben der anderen Fassung bleiben.`}</p>
            <div className="kp-formular-knoepfe"><Button onClick={onNeuLaden}>Neu laden</Button><Button type="primary" onClick={onBehalten}>Meine Fassung behalten</Button></div>
          </>} />
      ) : null}
    </>
  );
}
