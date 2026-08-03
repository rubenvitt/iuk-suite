"use client";

import { useTransition } from "react";
import { Button, Popconfirm } from "antd";
import { beendeFeedbackAction } from "../actions";

/**
 * „FEEDBACK JETZT BEENDEN" (Entwurf §2.3, §4.5, §4.6).
 *
 * Der Knopf ist ausdrücklich KEIN `danger`-Knopf. Zwei Gründe, und der zweite
 * ist der wichtigere:
 *
 * 1. Fachlich ist Beenden der geplante Schluss-Schritt eines Dienstabends, nicht
 *    der Notausgang. Ein roter Knopf lehrt „hier passiert etwas Schlimmes" und
 *    genau das hält Ehrenamtliche davon ab, den Abend abzuschließen.
 * 2. `theme.ts` setzt `colorError === colorPrimary === #c8000f`. `danger` wäre
 *    also Suite-Rot auf einer Datenfläche — die Farb-Klausel (§4.9) verbietet das
 *    im ganzen Modul, weil Rot hier für „Note 6" reserviert ist.
 *
 * Die Bestätigung liegt im `Popconfirm` und nennt die Folge wörtlich, statt zu
 * fragen „Sind Sie sicher?": Sicherheit hilft nur, wer weiß, worüber.
 *
 * `useTransition` statt `useActionState`: es gibt keine Eingabe, also keinen
 * Feldfehler — nur einen Ladezustand am Bestätigungsknopf (§4.5).
 */
export type BeendenKnopfProps = {
  surveyId: number;
  /** Abweichende Beschriftung für die Zeile „eine weitere Umfrage ist aktiv" (§2.2). */
  beschriftung?: string;
  /** `text` für dieselbe Zeile — dort ist Beenden eine Nebenaktion. */
  darstellung?: "default" | "text";
};

export function BeendenKnopf({
  surveyId,
  beschriftung = "Feedback jetzt beenden",
  darstellung = "default",
}: BeendenKnopfProps) {
  const [laeuft, starte] = useTransition();

  const beenden = () => {
    starte(async () => {
      const daten = new FormData();
      daten.set("surveyId", String(surveyId));
      await beendeFeedbackAction(daten);
    });
  };

  return (
    <Popconfirm
      title="Feedback beenden?"
      description="Danach kann niemand mehr antworten. Die Auswertung bleibt erhalten."
      okText="Beenden"
      cancelText="Abbrechen"
      okButtonProps={{ loading: laeuft }}
      onConfirm={beenden}
    >
      <Button
        type={darstellung}
        loading={laeuft}
        className={darstellung === "default" ? "fb-block-mobil" : undefined}
      >
        {beschriftung}
      </Button>
    </Popconfirm>
  );
}
