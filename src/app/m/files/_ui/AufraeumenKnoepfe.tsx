"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Col, Modal, Row } from "antd";

import {
  aufraeumenAction,
  aufraeumVorschauAction,
  type AufraeumVorschau,
} from "../(verwaltung)/ablage-actions";

/**
 * DIE ZWEI KNOEPFE DER ABLAGE-KACHEL (T46, IDA-388).
 *
 * „Jetzt aufräumen" loeschte vorher sofort, direkt neben der Vorschau. Jetzt
 * holt der Knopf erst die Zahlen des Trockenlaufs und fragt mit ihnen nach
 * („Löscht 2 abgelaufene Freigaben, 3 Dateien (14,0 MiB) …"). Die Zahlen
 * kommen frisch beim Klick, nicht beim Rendern der Seite: die Planung liest
 * Datenbank und Ablageverzeichnisse, und die Rueckfrage soll den Stand des
 * Augenblicks nennen, nicht den beim Laden.
 *
 * Eine Client-Insel, weil Rueckfrage und Ladezustand Zustand tragen; die
 * Kachel selbst bleibt Server Component. Die Actions werden direkt importiert,
 * nie als Prop gereicht (Falle 9).
 */
export function AufraeumenKnoepfe() {
  const [vorschau, setVorschau] = useState<AufraeumVorschau | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [holt, starteHolen] = useTransition();
  const [raeumt, starteRaeumen] = useTransition();

  const frage = () => {
    setFehler(null);
    starteHolen(async () => {
      try {
        setVorschau(await aufraeumVorschauAction());
      } catch {
        setFehler("Die Vorschau konnte nicht berechnet werden. Es wurde nichts gelöscht.");
      }
    });
  };

  const raeumeAuf = () => {
    const daten = new FormData();
    daten.set("modus", "echt");
    setFehler(null);
    starteRaeumen(async () => {
      try {
        await aufraeumenAction(daten);
      } catch {
        setFehler("Das Aufräumen ist fehlgeschlagen. Bitte den Stand prüfen.");
      }
      setVorschau(null);
    });
  };

  const nichtsZuLoeschen = vorschau !== null && vorschau.satz === null;

  return (
    <>
      <form action={aufraeumenAction}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={8}>
            <Button block htmlType="submit" name="modus" value="vorschau">
              Vorschau (Trockenlauf)
            </Button>
          </Col>
          <Col xs={24} md={8}>
            {/* `danger` OHNE `type="primary"`: `colorError === colorPrimary`,
                ein roter Vollknopf waere pixelgleich mit einer Primaeraktion. */}
            <Button
              block
              danger
              loading={holt}
              onClick={frage}
              data-testid="files-ablage-aufraeumen"
            >
              Jetzt aufräumen
            </Button>
          </Col>
        </Row>
      </form>

      {fehler !== null && (
        <Alert type="warning" showIcon title={fehler} data-testid="files-ablage-aufraeumen-fehler" />
      )}

      <Modal
        open={vorschau !== null}
        title={nichtsZuLoeschen ? "Nichts zu löschen" : "Jetzt aufräumen?"}
        onCancel={() => setVorschau(null)}
        data-testid="files-ablage-rueckfrage"
        footer={
          nichtsZuLoeschen ? (
            <Button onClick={() => setVorschau(null)}>Schließen</Button>
          ) : (
            <>
              <Button onClick={() => setVorschau(null)}>Abbrechen</Button>
              <Button
                danger
                loading={raeumt}
                onClick={raeumeAuf}
                data-testid="files-ablage-aufraeumen-bestaetigen"
              >
                Aufräumen
              </Button>
            </>
          )
        }
      >
        <p data-testid="files-ablage-rueckfrage-satz">
          {vorschau?.satz ?? "Es gibt gerade nichts, was gelöscht würde."}
        </p>
        {vorschau?.trockenlaufErzwungen && !nichtsZuLoeschen && (
          <p>Der Trockenlauf ist fest eingeschaltet: auch dieser Lauf löscht nichts.</p>
        )}
      </Modal>
    </>
  );
}
