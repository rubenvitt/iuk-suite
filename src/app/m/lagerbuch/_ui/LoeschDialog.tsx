"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  return (
    <Modal
      open={offen}
      title={`${typLabel} löschen`}
      onCancel={onSchliessen}
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
          onSchliessen={onSchliessen}
          onFertig={onFertig}
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

function LoeschInhalt({
  name,
  typLabel,
  deaktivierenLabel = "Deaktivieren",
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  onSchliessen,
  onFertig,
}: Omit<LoeschDialogProps, "offen">) {
  const [status, setStatus] = useState<Loeschbarkeit | null>(null);
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const laufendRef = useRef(false);
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
    };
  }, []);

  async function ausfuehren(aktion: () => Promise<void>, misslungen: string): Promise<void> {
    if (laufendRef.current) return;

    laufendRef.current = true;
    setLaeuft(true);
    setFehler(null);
    try {
      await aktion();
      onFertig?.();
      onSchliessen();
    } catch {
      setFehler(misslungen);
    } finally {
      laufendRef.current = false;
      setLaeuft(false);
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
            message={status.grund}
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

      {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
    </div>
  );
}
