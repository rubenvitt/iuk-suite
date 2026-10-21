"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button, Card, Select, Switch, Tag } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { setzeRechtAction } from "./actions";

export type RechtePerson = { id: string; name: string; email: string | null; gruppenIds: string[]; gesperrt: boolean };
export type RechteRolle = { gruppeId: string; anzeige: string; name: string; beschreibung: string; ldap: boolean };
export type RechteAbschnitt = { schluessel: string; titel: string; rollen: RechteRolle[] };

/**
 * Die Arbeitsfläche der Seite „Rechte" (IDA-253): oben eine Person wählen, darunter ihre Rechte als Schalter,
 * gruppiert nach Modul. Ein Schalter schreibt sofort (keine Speichern-Taste, die man vergessen kann); der
 * Zustand kommt aus der Antwort der Action, nicht aus dem Klick.
 *
 * Die Action wird direkt importiert, nicht als Prop gereicht (Falle 9, `CLAUDE.md`).
 */
export function RechteVerwaltung({
  personen: anfang,
  abschnitte,
  betriebGruppeId,
  selbstId,
  startPersonId,
}: {
  personen: RechtePerson[];
  abschnitte: RechteAbschnitt[];
  betriebGruppeId: string | null;
  selbstId: string;
  startPersonId: string | null;
}) {
  const [personen, setPersonen] = useState(anfang);
  const [gewaehlt, setGewaehlt] = useState<string | null>(
    startPersonId && anfang.some((p) => p.id === startPersonId) ? startPersonId : null,
  );
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<{ gruppeId: string; text: string } | null>(null);
  const [, starte] = useTransition();
  const bearbeitung = useRef<HTMLDivElement>(null);

  const anzeige = useMemo(
    () => new Map(abschnitte.flatMap((a) => a.rollen.map((r) => [r.gruppeId, r.anzeige] as const))),
    [abschnitte],
  );
  const person = personen.find((p) => p.id === gewaehlt) ?? null;

  function waehle(id: string) {
    setGewaehlt(id);
    setFehler(null);
    // Nach dem Rendern: auf schmalen Schirmen steht die Bearbeitung unter der Liste.
    requestAnimationFrame(() => bearbeitung.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }

  function schalte(p: RechtePerson, gruppeId: string, mitglied: boolean) {
    setLaeuft(gruppeId);
    setFehler(null);
    starte(async () => {
      const antwort = await setzeRechtAction({ personId: p.id, gruppeId, mitglied });
      setLaeuft(null);
      if (!antwort.ok) {
        setFehler({ gruppeId, text: antwort.fehler });
        return;
      }
      setPersonen((alle) =>
        alle.map((x) =>
          x.id !== p.id
            ? x
            : {
                ...x,
                gruppenIds: mitglied
                  ? [...new Set([...x.gruppenIds, gruppeId])]
                  : x.gruppenIds.filter((g) => g !== gruppeId),
              },
        ),
      );
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl }}>
      <section aria-labelledby="rechte-person">
        <h2 id="rechte-person" style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.md}px` }}>
          Person wählen
        </h2>
        <Select
          showSearch
          allowClear
          style={{ width: "100%", maxWidth: 480 }}
          placeholder="Name oder E-Mail eintippen"
          aria-label="Person"
          value={gewaehlt ?? undefined}
          onChange={(wert) => (wert ? waehle(wert) : setGewaehlt(null))}
          optionFilterProp="suche"
          options={personen.map((p) => ({
            value: p.id,
            label: p.email ? `${p.name} · ${p.email}` : p.name,
            suche: `${p.name} ${p.email ?? ""}`,
          }))}
          data-testid="rechte-person"
        />
      </section>

      <div ref={bearbeitung} style={{ scrollMarginTop: SPACE.xl }}>
        {person ? (
          <section aria-labelledby="rechte-bearbeitung" data-testid="rechte-bearbeitung">
            <h2 id="rechte-bearbeitung" style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.xs}px` }}>
              Rechte von {person.name}
            </h2>
            <p style={{ marginBlock: `0 ${SPACE.lg}px`, color: "var(--iuk-gedaempft)" }}>
              {person.email ?? "Keine E-Mail hinterlegt"}
              {person.gesperrt ? " · in Pocket ID gesperrt" : ""}
            </p>
            <div
              style={{
                display: "grid",
                gap: SPACE.lg,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              }}
            >
              {abschnitte.map((abschnitt) => (
                <Card key={abschnitt.schluessel} title={abschnitt.titel}>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.md }}>
                    {abschnitt.rollen.map((rolle) => {
                      const an = person.gruppenIds.includes(rolle.gruppeId);
                      const eigeneBetriebsgruppe =
                        an && person.id === selbstId && rolle.gruppeId === betriebGruppeId;
                      const gesperrt = rolle.ldap || eigeneBetriebsgruppe;
                      const feldId = `recht-${abschnitt.schluessel}-${rolle.gruppeId}`;
                      return (
                        <li key={rolle.gruppeId} style={{ display: "flex", gap: SPACE.md, alignItems: "flex-start" }}>
                          <Switch
                            id={feldId}
                            checked={an}
                            loading={laeuft === rolle.gruppeId}
                            disabled={gesperrt || (laeuft !== null && laeuft !== rolle.gruppeId)}
                            onChange={(wert) => schalte(person, rolle.gruppeId, wert)}
                            aria-describedby={`${feldId}-text`}
                          />
                          <div>
                            <label htmlFor={feldId} style={{ fontWeight: 600 }}>
                              {rolle.anzeige}
                            </label>
                            <div id={`${feldId}-text`} style={{ color: "var(--iuk-gedaempft)" }}>
                              {rolle.beschreibung}
                              {rolle.ldap ? " · kommt aus LDAP" : ""}
                              {eigeneBetriebsgruppe ? " · deine eigene Betriebsgruppe bleibt" : ""}
                              {" · "}
                              <code>{rolle.name}</code>
                            </div>
                            {fehler?.gruppeId === rolle.gruppeId && (
                              // Kein Rot (Falle 3): die Meldung trägt Text und Gewicht, die Rolle kündigt sie an.
                              <div role="alert" style={{ fontWeight: 600, marginBlockStart: SPACE.xs }}>
                                Nicht geändert: {fehler.text}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
            <p style={{ marginBlock: `${SPACE.lg}px 0`, color: "var(--iuk-gedaempft)" }}>
              Eine Änderung gilt sofort in Pocket ID. Bei der Person wirkt sie nach einer neuen Anmeldung,
              spätestens nach etwa einer Stunde.
            </p>
          </section>
        ) : (
          <p style={{ margin: 0, color: "var(--iuk-gedaempft)" }}>
            Wähle oben eine Person oder unten in der Liste „Rechte ändern“.
          </p>
        )}
      </div>

      <section aria-labelledby="rechte-uebersicht">
        <h2 id="rechte-uebersicht" style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.md}px` }}>
          Alle Personen
        </h2>
        <div data-testid="rechte-tabelle">
          <Kartentabelle<RechtePerson>
            rowKey="id"
            aria-label="Personen und ihre Rechte"
            dataSource={personen}
            size="small"
            leer={{ nichts: "In Pocket ID ist noch niemand angelegt." }}
            columns={[
              { title: "Name", dataIndex: "name", sorter: nachText<RechtePerson>((p) => p.name) },
              { title: "E-Mail", dataIndex: "email", sorter: nachText<RechtePerson>((p) => p.email ?? "") },
              {
                title: "Rechte",
                key: "rechte",
                render: (_, p) => {
                  const namen = p.gruppenIds.map((g) => anzeige.get(g)).filter((n): n is string => Boolean(n));
                  return namen.length === 0 ? (
                    "keine"
                  ) : (
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: SPACE.xs }}>
                      {namen.map((n) => (
                        <Tag key={n} style={{ marginInlineEnd: 0 }}>
                          {n}
                        </Tag>
                      ))}
                    </span>
                  );
                },
              },
              {
                title: "",
                key: "aktionen",
                align: "right",
                render: (_, p) => <Button onClick={() => waehle(p.id)}>Rechte ändern</Button>,
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
