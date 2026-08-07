"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Input, Modal } from "antd";
import type { Loeschbarkeit } from "../_lib/loeschen";
import { SCHRIFT } from "../_lib/schrift";
import styles from "./verwaltung.module.css";

/**
 * Dialog fuer das Loeschen eines Stammdatensatzes.
 *
 * `Modal` liefert nur die Huelle. Vorpruefung, exakte Namensbestaetigung und
 * der zweite Ausgang bleiben eigene fachliche Zusagen. Die Actions kommen als
 * Props, weil beispielsweise Vorlagen nicht ueber die generische Loesch-
 * Action entfernt werden.
 */
export function LoeschDialog({
  offen,
  name,
  typLabel,
  deaktivierenLabel,
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  onSchliessen,
  onFertig,
}: LoeschDialogProps) {
  // Guard und Loading gehoeren zum dauerhaften Dialog-Owner, nicht zum
  // bedingt gemounteten Inhalt: eine kontrollierte Close/Reopen-Folge darf
  // eine noch laufende Action nicht vergessen.
  const [laeuft, setLaeuft] = useState(false);
  const laufendRef = useRef(false);
  const oeffnungsGenerationRef = useRef(0);
  const montiertRef = useRef(true);

  // Cleanup UND Setup invalidieren die vorige Oeffnung synchron im Commit.
  // Damit kann eine Promise-Mikrotask zwischen Close und passivem Effect keine
  // veralteten Callbacks mehr in eine spaetere Oeffnung tragen.
  useLayoutEffect(() => {
    oeffnungsGenerationRef.current += 1;
    return () => {
      oeffnungsGenerationRef.current += 1;
    };
  }, [offen]);

  useLayoutEffect(() => {
    montiertRef.current = true;
    return () => {
      montiertRef.current = false;
    };
  }, []);

  async function actionAusfuehren(
    aktion: () => Promise<void>,
  ): Promise<AktionsErgebnis> {
    if (laufendRef.current) return "laeuft";

    const generation = oeffnungsGenerationRef.current;
    laufendRef.current = true;
    setLaeuft(true);

    let fehlgeschlagen = false;
    try {
      await aktion();
    } catch {
      fehlgeschlagen = true;
    }

    laufendRef.current = false;
    if (montiertRef.current) setLaeuft(false);

    if (
      !montiertRef.current ||
      generation !== oeffnungsGenerationRef.current
    ) {
      return "veraltet";
    }
    if (fehlgeschlagen) return "fehlgeschlagen";

    try {
      onFertig?.();
      onSchliessen();
      return "erfolg";
    } catch {
      return "fehlgeschlagen";
    }
  }

  function modalSchliessen(): void {
    if (laufendRef.current) return;
    onSchliessen();
  }

  return (
    <Modal
      open={offen}
      title={`${typLabel} löschen`}
      onCancel={modalSchliessen}
      keyboard={!laeuft}
      closable={!laeuft}
      mask={{ closable: !laeuft }}
      footer={null}
      destroyOnHidden
    >
      {offen ? (
        <LoeschInhalt
          name={name}
          typLabel={typLabel}
          deaktivierenLabel={deaktivierenLabel}
          hinweis={hinweis}
          pruefen={pruefen}
          onLoeschen={onLoeschen}
          onDeaktivieren={onDeaktivieren}
          laeuft={laeuft}
          actionAusfuehren={actionAusfuehren}
        />
      ) : null}
    </Modal>
  );
}

type LoeschDialogProps = {
  offen: boolean;
  name: string;
  typLabel: string;
  deaktivierenLabel?: string;
  hinweis?: ReactNode;
  pruefen: () => Promise<Loeschbarkeit>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
  onSchliessen: () => void;
  onFertig?: () => void;
};

type AktionsErgebnis = "erfolg" | "fehlgeschlagen" | "veraltet" | "laeuft";

type LoeschInhaltProps = Omit<
  LoeschDialogProps,
  "offen" | "onSchliessen" | "onFertig"
> & {
  laeuft: boolean;
  actionAusfuehren: (aktion: () => Promise<void>) => Promise<AktionsErgebnis>;
};

function LoeschInhalt({
  name,
  typLabel,
  deaktivierenLabel = "Deaktivieren",
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  laeuft,
  actionAusfuehren,
}: LoeschInhaltProps) {
  const [status, setStatus] = useState<Loeschbarkeit | null>(null);
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const sichtbarRef = useRef(true);
  const pruefenBeimOeffnen = useRef(pruefen);

  useEffect(() => {
    let verworfen = false;

    void pruefenBeimOeffnen.current().then(
      (ergebnis) => {
        if (!verworfen) setStatus(ergebnis);
      },
      () => {
        if (!verworfen) {
          setFehler("Die Prüfung ist fehlgeschlagen — bitte erneut versuchen.");
        }
      },
    );

    return () => {
      verworfen = true;
      sichtbarRef.current = false;
    };
  }, []);

  async function ausfuehren(aktion: () => Promise<void>, misslungen: string): Promise<void> {
    setFehler(null);
    const ergebnis = await actionAusfuehren(aktion);
    if (sichtbarRef.current && ergebnis === "fehlgeschlagen") {
      setFehler(misslungen);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {hinweis ? <div style={SCHRIFT.text}>{hinweis}</div> : null}

      {status === null && !fehler ? <div style={SCHRIFT.neben}>Wird geprüft …</div> : null}

      {status && !status.loeschbar ? (
        <>
          <Alert
            data-rolle="fachwarnung"
            className={styles.warnbox}
            type="warning"
            showIcon={false}
            title={status.grund}
          />
          {status.kannDeaktivieren && onDeaktivieren ? (
            <Button
              data-rolle="deaktivieren"
              loading={laeuft}
              disabled={laeuft}
              onClick={() => {
                void ausfuehren(
                  onDeaktivieren,
                  `${typLabel} konnte nicht deaktiviert werden.`,
                );
              }}
            >
              {deaktivierenLabel}
            </Button>
          ) : null}
        </>
      ) : null}

      {status?.loeschbar ? (
        <>
          <div style={SCHRIFT.text}>
            Das löscht <strong>{name}</strong> endgültig. Tippe den Namen zur Bestätigung ab.
          </div>
          <Input
            value={eingabe}
            onChange={(ereignis) => setEingabe(ereignis.target.value)}
            placeholder={name}
            aria-label="Namen zur Bestätigung eingeben"
            autoComplete="off"
          />
          <Button
            data-rolle="loeschen"
            danger
            type="primary"
            disabled={eingabe !== name || laeuft}
            loading={laeuft}
            onClick={() => {
              void ausfuehren(onLoeschen, `${typLabel} konnte nicht gelöscht werden.`);
            }}
          >
            Endgültig löschen
          </Button>
        </>
      ) : null}

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}
