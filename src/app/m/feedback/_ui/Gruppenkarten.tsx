"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Col, Input, Modal, Row } from "antd";
import { createGroupAction } from "../actions";
import { Notenpille } from "./Noten";
import { T } from "./typo";

/**
 * DIE GRUPPENKARTEN DES EINSTIEGS (Entwurf §3.1).
 *
 * Vorher stand hier eine `Table` mit einer Spalte nackter Links: kein Zustand,
 * keine Note, kein Rücklauf — man musste jede Gruppe anklicken, um zu erfahren, ob
 * dort etwas läuft. Der Zustand steht jetzt AUF der Karte.
 *
 * WARUM CLIENT (§4.13): das Suchfeld ab acht Gruppen (`Input.Search`, ein
 * Compound-Zugriff) und das `Modal` für „+ Neue Gruppe" brauchen Zustand. Die
 * Karten selbst wären server-fest — sie liegen hier, weil das Suchfeld sie filtert
 * und ein zweiter Kartensatz zwei Wahrheiten wären.
 *
 * DIE KARTE IST DER LINK, nicht ein Link IN der Karte: eine anklickbare Fläche
 * gehört in ein `<a>` und nicht auf ein `div` mit `onClick` (§4.14, Tastatur). Der
 * Fokusring kommt aus `fb-fokus`.
 *
 * `data-testid="group-row"` sitzt auf dem `<Link>` — dem Knoten, der den `href`
 * trägt. Die Zusage von §3.1/§4.16 ist „der Hook UND `href=/m/feedback/groups/
 * {id}` am selben Knoten", denn der IDOR-E2E liest die ID per Regex aus genau
 * diesem `href`. Auf der `<Card>` DARIN wäre der Hook gebrochen: dort gibt es
 * keinen `href`, und unter ihr liegt kein zweites `<a>`. Der Name des Hooks ist
 * historisch („row" — früher eine Tabellenzeile), die Zusage ist die ID.
 */

export type Gruppenkarte = {
  id: number;
  name: string;
  /**
   * Die laufende Umfrage der Gruppe, fertig formatiert. `null` heißt „nichts
   * aktiv" — die Karte erfindet keinen Zustand und keinen Nenner (§2.3): ohne
   * Teilnehmerzahl steht dort „3 Rückmeldungen", kein „von".
   */
  laufend: { zaehler: string; frist: string | null } | null;
  /** „12.03." des jüngsten Dienstabends — `null`, wenn die Gruppe keinen hat. */
  letzterAbend: string | null;
  /** `avgSchulnote` des letzten AUSGEWERTETEN Abends (§4.12), sonst `null`. */
  note: number | null;
};

/** Ab hier lohnt ein Suchfeld (§3.1). Darunter ist es ein Bedienelement ohne Not. */
const SUCHE_AB = 8;

const KARTE = { body: { padding: "var(--fb-kartenpolster)" } };

export function Gruppenkarten({
  gruppen,
  istAdmin,
}: {
  gruppen: Gruppenkarte[];
  istAdmin: boolean;
}) {
  const [suche, setSuche] = useState("");
  const [anlegen, setAnlegen] = useState(false);

  const gefiltert =
    suche.trim() === ""
      ? gruppen
      : gruppen.filter((g) => g.name.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {gruppen.length >= SUCHE_AB && (
        /* Kein `Segmented`: Nicht-Admins sehen ohnehin nur ihre eigenen Gruppen,
           Admins alle — es gibt also keine zwei Mengen zum Umschalten (§3.1). */
        <Input.Search
          type="search"
          allowClear
          placeholder="Gruppe suchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {gefiltert.map((g) => (
          <Col key={g.id} xs={24} sm={12} xl={8}>
            <Link
              href={`/m/feedback/groups/${g.id}`}
              className="fb-fokus"
              data-testid="group-row"
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <Card variant="outlined" hoverable className="fb-gruppenkarte" styles={KARTE}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ ...T.lead, margin: 0 }}>{g.name}</h2>
                    <p
                      style={{
                        ...T.body,
                        margin: "4px 0 0",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {g.laufend ? (
                        <>
                          {/* Vier Kanäle für „läuft" (§4.14): Wort, Punkt,
                              Anwesenheit des Zählers, Bewegung — nie Farbe allein. */}
                          <span
                            className="fb-puls"
                            aria-hidden="true"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "var(--fb-ink)",
                              flex: "0 0 auto",
                            }}
                          />
                          <span>läuft · {g.laufend.zaehler}</span>
                        </>
                      ) : (
                        <span>
                          nichts aktiv ·{" "}
                          {g.letzterAbend
                            ? `letzter Abend ${g.letzterAbend}`
                            : "noch kein Dienstabend"}
                        </span>
                      )}
                    </p>
                    {g.laufend?.frist && (
                      <p style={{ ...T.meta, margin: "4px 0 0" }}>schließt {g.laufend.frist}</p>
                    )}
                  </div>
                  {/*
                   * Notenpille MIT Wort (die Komponente trägt es selbst): auf
                   * dieser Seite gibt es keine Legende, also muss Ziffer plus Wort
                   * allein tragen (§3.1). Ohne Note steht „—" und keine leere
                   * Pille — eine leere Pille sieht aus wie eine Note (§4.3).
                   */}
                  <div style={{ flex: "0 0 auto" }}>
                    <Notenpille note={g.note} />
                  </div>
                </div>
              </Card>
            </Link>
          </Col>
        ))}

        {istAdmin && (
          <Col xs={24} sm={12} xl={8}>
            {/* Gestrichelt und ohne Note: die Karte ist ein Handgriff, keine
                Gruppe. „Neue Gruppe" öffnet ein `Modal` und KEINE Route — ein
                Formular mit drei Feldern braucht keinen eigenen Ort (§3.1). */}
            <Card variant="outlined" styles={KARTE} style={{ borderStyle: "dashed" }}>
              <Button type="text" onClick={() => setAnlegen(true)}>
                + Neue Gruppe
              </Button>
            </Card>
          </Col>
        )}
      </Row>

      <Modal
        open={anlegen}
        onCancel={() => setAnlegen(false)}
        footer={null}
        title="Neue Gruppe"
        destroyOnHidden
      >
        {/*
         * Kein `Form`/`Form.Item` (§4.13): das Formular postet an
         * `createGroupAction`. Die Felder behalten Reihenfolge und Platzhalter der
         * alten Oberfläche — der E2E-Ablauf klickt künftig erst „+ Neue Gruppe"
         * und tippt dann in dieselben Felder (§4.16).
         */}
        <form action={createGroupAction} className="fb-form">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={T.kicker}>
              NAME
              <Input name="name" placeholder="Name" required />
            </label>
            <label style={T.kicker}>
              SLUG
              <Input name="slug" placeholder="slug" required />
            </label>
            <label style={T.kicker}>
              FRIST (STUNDEN)
              <Input name="closeAfterHours" placeholder="Frist (h)" type="number" />
            </label>
            <div>
              <Button htmlType="submit" type="primary">
                Gruppe anlegen
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
