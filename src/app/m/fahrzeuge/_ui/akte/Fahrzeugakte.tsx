"use client";

import { useState } from "react";
import { Button, Card, Tag } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Statuschip } from "@/core/status/Statuschip";
import { Kartentabelle, Zeilenaktionen } from "@/core/tabelle";
import { pruefungEntfernenAction, reifensatzEntfernenAction } from "../../_actions/akte";
import { abstandText, cmAlsMeter, dotAlterJahre, jahreText, kgText } from "../../_lib/akte/anzeige";
import { datum, kmText, REIFEN_GELB_JAHRE, REIFEN_ROT_JAHRE, REIFEN_ROT_JAHRE_TEMPO_100 } from "../../_lib/akte/regeln";
import { TEMPO_100, type AkteMitStand, type PruefStand, type PruefungDTO, type ReifensatzDTO, type TechnikDTO } from "../../_lib/akte/typen";
import type { AkteVerweis, AkteVerweise } from "../../_lib/akte/verweise";
import { ErledigtDialog, KilometerDialog, PruefungDialog, ReifensatzDialog, ReifenwechselDialog } from "./Dialoge";
import { TechnikFlyin } from "./TechnikFlyin";
import { StufenChip } from "./teile";
import { useAktion } from "./useAktion";
import s from "./akte.module.css";

type Offen =
  | { was: "erledigt"; pruefung: PruefungDTO }
  | { was: "pruefung"; pruefung: PruefungDTO | null }
  | { was: "satz"; satz: ReifensatzDTO | null }
  | { was: "km" | "technik" | "wechsel" }
  | null;

const NICHT_ERFASST = <span className={s.neben}>nicht erfasst</span>;

function technikLeer(t: TechnikDTO): boolean {
  return [t.modell, t.baujahr, t.laengeCm, t.breiteCm, t.hoeheCm, t.zggKg, t.leerKg, t.staerke, t.sitze, t.tragen, t.fuehrerschein].every((v) => v === null)
    && t.besonderheiten.length === 0;
}

function masseText(t: TechnikDTO): string | null {
  const teile = [t.laengeCm, t.breiteCm, t.hoeheCm];
  if (teile.every((v) => v === null)) return null;
  return `${teile.map((v) => (v === null ? "—" : cmAlsMeter(v))).join(" × ")} m`;
}

/**
 * Die Akte eines Fahrzeugs (IDA-299): Prüf- und Servicetermine, Reifen, technische Daten, Kilometerstand
 * und zwei Verweise in die Nachbar-Apps. Client-Insel mit serialisierbaren Props; die Server Actions sind
 * direkt importiert (Falle 9). Nach jedem Speichern kommt die Akte über die Props neu (`revalidatePath`).
 *
 * Lesen darf jede Person mit Zugang zum Modul. Alles, was ändert, steht nur mit `darfVerwalten` da —
 * dasselbe Prädikat (`darfFahrzeugeVerwalten`) riegelt auf dem Server jede Action.
 */
export function Fahrzeugakte({ eintrag, darfVerwalten, heute, verweise }: { eintrag: AkteMitStand; darfVerwalten: boolean; heute: string; verweise: AkteVerweise }) {
  const { akte, stand } = eintrag;
  const f = akte.fahrzeug;
  const t = akte.technik;
  const anhaenger = f.art === "anhaenger";
  const [offen, setOffen] = useState<Offen>(null);
  const { laeuft, fuehreAus } = useAktion();
  const zu = () => setOffen(null);

  const tempo100 = t.besonderheiten.includes(TEMPO_100);
  const zuladung = t.zggKg !== null && t.leerKg !== null ? t.zggKg - t.leerKg : null;
  const kopfzeile = [
    f.typ,
    [t.modell, t.baujahr !== null ? `Baujahr ${t.baujahr}` : null].filter(Boolean).join(", ") || null,
    f.kennzeichen,
    `Standort ${f.standort}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className={s.seite}>
      <Seitenkopf
        zurueck={{ titel: "Fahrzeugtafel", href: "/tafel" }}
        titel={f.funkrufname}
        beschreibung={
          <span className={s.reihe}>
            {f.aktiv ? null : <Statuschip ton="neutral">außer Dienst</Statuschip>}
            <span>{kopfzeile}</span>
          </span>
        }
        aktionen={darfVerwalten ? (
          <>
            {!anhaenger && <Button type="primary" onClick={() => setOffen({ was: "km" })}>Kilometerstand eintragen</Button>}
            <Button onClick={() => setOffen({ was: "technik" })}>Technische Daten bearbeiten</Button>
          </>
        ) : undefined}
      />

      <div className={s.akte}>
        <div className={s.spalte}>
          <Card title="Prüf- und Servicetermine" extra={stand.pruefungen.length > 0 ? <StufenChip stufe={stand.stufe} /> : undefined} data-karte="pruefungen">
            {stand.pruefungen.length === 0 ? (
              <div className={s.leer}>
                <p>Noch keine Prüfungen erfasst.{darfVerwalten ? " Fang mit der HU an, dann UVV und Service." : ""}</p>
                {darfVerwalten && <Button onClick={() => setOffen({ was: "pruefung", pruefung: null })}>Prüfung hinzufügen</Button>}
              </div>
            ) : (
              <>
                <Kartentabelle<PruefStand>
                  rowKey={(x) => x.pruefung.id}
                  aria-label="Prüf- und Servicetermine"
                  dataSource={stand.pruefungen}
                  leer={{ nichts: "Noch keine Prüfungen erfasst." }}
                  karte={{ titel: "name", kennzeichen: ["stand"] }}
                  columns={[
                    {
                      title: "Prüfung", key: "name",
                      render: (_: unknown, x: PruefStand) => (
                        <div className={s.zelle}>
                          <span style={{ fontWeight: 600 }}>{x.pruefung.name}</span>
                          <span className={s.unter}>{abstandText(x.pruefung.monate, x.pruefung.kmAbstand !== null ? kmText(x.pruefung.kmAbstand) : null)}</span>
                        </div>
                      ),
                    },
                    // Der Stand steht direkt hinter der Spalte, die die Zeile benennt (`docs/design/README.md`, IDA-393).
                    { title: "Stand", key: "stand", render: (_: unknown, x: PruefStand) => <StufenChip stufe={x.stufe}>{x.text}</StufenChip> },
                    {
                      title: "Zuletzt", key: "zuletzt",
                      render: (_: unknown, x: PruefStand) => (
                        <div className={s.zelle}>
                          <span className={s.ziffern}>{x.pruefung.zuletzt ? datum(x.pruefung.zuletzt) : "—"}</span>
                          {x.pruefung.zuletztKm !== null ? <span className={s.unter}>bei {kmText(x.pruefung.zuletztKm)}</span> : null}
                          {x.pruefung.bemerkung ? <span className={s.unter}>{x.pruefung.bemerkung}</span> : null}
                        </div>
                      ),
                    },
                    {
                      title: "Nächste fällig", key: "naechste",
                      render: (_: unknown, x: PruefStand) => (
                        <div className={s.zelle}>
                          <span className={s.reihe}>
                            <span className={s.ziffern}>{x.faelligAm ? datum(x.faelligAm) : "—"}</span>
                            {x.pruefung.vonHand ? <Statuschip ton="neutral" title="Von Hand gesetzt statt berechnet">von Hand</Statuschip> : null}
                          </span>
                          {x.kmGrenze !== null ? <span className={s.unter}>oder bei {kmText(x.kmGrenze)}</span> : null}
                        </div>
                      ),
                    },
                    ...(darfVerwalten
                      ? [{
                          title: "Aktionen", key: "aktionen",
                          render: (_: unknown, x: PruefStand) => (
                            <Zeilenaktionen
                              name={x.pruefung.name}
                              laeuft={laeuft}
                              haupt={{ key: "erledigt", label: "Erledigt", onClick: () => setOffen({ was: "erledigt", pruefung: x.pruefung }) }}
                              aktionen={[
                                { key: "bearbeiten", label: "Bearbeiten", ikone: "pencil", onClick: () => setOffen({ was: "pruefung", pruefung: x.pruefung }) },
                                {
                                  key: "entfernen", label: "Entfernen", ikone: "trash", danger: true,
                                  bestaetigen: { titel: `${x.pruefung.name} entfernen?`, text: "Die Prüfung fällt aus Akte und Fahrzeugtafel, ihr letzter Termin geht verloren.", ok: "Entfernen" },
                                  onClick: () => fuehreAus(() => pruefungEntfernenAction(x.pruefung.id), `${x.pruefung.name} entfernt.`),
                                },
                              ]}
                            />
                          ),
                        }]
                      : []),
                  ]}
                />
                {darfVerwalten && (
                  <div className={s.kartenfuss}>
                    <Button onClick={() => setOffen({ was: "pruefung", pruefung: null })}>Prüfung hinzufügen</Button>
                    <span className={s.neben}>zum Beispiel Feuerlöscher, Stromerzeuger oder Ladebordwand</span>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card
            title="Reifen"
            data-karte="reifen"
            extra={darfVerwalten && akte.reifensaetze.length > 0 ? <Button onClick={() => setOffen({ was: "wechsel" })}>Reifenwechsel eintragen</Button> : undefined}
          >
            {akte.reifensaetze.length === 0 ? (
              <div className={s.leer}>
                <p>Noch kein Reifensatz erfasst.{darfVerwalten ? " Trag den Satz ein, der gerade drauf ist, mit seiner DOT-Nummer." : ""}</p>
                {darfVerwalten && <Button onClick={() => setOffen({ was: "satz", satz: null })}>Reifensatz hinzufügen</Button>}
              </div>
            ) : (
              <>
                <div className={s.reihe} style={{ marginBottom: 12 }}>
                  {stand.reifen ? (
                    <>
                      <StufenChip stufe={stand.reifen.saison.stufe}>{stand.reifen.saison.text}</StufenChip>
                      <StufenChip stufe={stand.reifen.alter.stufe}>{stand.reifen.alter.text}</StufenChip>
                    </>
                  ) : (
                    <span className={s.neben}>Noch nicht erfasst, welcher Satz drauf ist.{darfVerwalten ? " Trag es über „Reifenwechsel eintragen“ ein." : ""}</span>
                  )}
                </div>
                <div className={s.reifen}>
                  {akte.reifensaetze.map((satz) => {
                    const drauf = stand.reifen?.satz.id === satz.id;
                    const alter = drauf && stand.reifen ? stand.reifen.alterJahre : dotAlterJahre(satz.dot, heute);
                    return (
                      <div key={satz.id} className={`${s.reifensatz}${drauf ? ` ${s.drauf}` : ""}`} data-satz={satz.id}>
                        <div className={s.satzkopf}>
                          <div>
                            <div className={s.kicker}>{drauf ? "Aufgezogen" : "Eingelagert"}</div>
                            <b>{satz.art}reifen</b>
                          </div>
                          {darfVerwalten && (
                            <Zeilenaktionen
                              name={`${satz.art}reifen`}
                              laeuft={laeuft}
                              aktionen={[
                                { key: "bearbeiten", label: "Bearbeiten", ikone: "pencil", onClick: () => setOffen({ was: "satz", satz }) },
                                {
                                  key: "entfernen", label: "Entfernen", ikone: "trash", danger: true,
                                  bestaetigen: { titel: `${satz.art}reifen entfernen?`, text: "Der Satz mit DOT-Nummer und Lagerort ist danach aus der Akte weg.", ok: "Entfernen" },
                                  onClick: () => fuehreAus(() => reifensatzEntfernenAction(satz.id), `${satz.art}reifen entfernt.`),
                                },
                              ]}
                            />
                          )}
                        </div>
                        <span className={s.ziffern}>DOT {satz.dot}{alter !== null ? ` · ${jahreText(alter)}` : ""}</span>
                        {satz.lager ? <span className={s.unter}>{satz.lager}</span> : null}
                      </div>
                    );
                  })}
                </div>
                <p className={s.neben} style={{ margin: "12px 0 0" }}>
                  Winterreifen von Oktober bis März. Im ersten Monat der Saison wird es gelb, danach rot. Reifen ab {REIFEN_GELB_JAHRE} Jahren gelb,
                  ab {REIFEN_ROT_JAHRE} Jahren rot{tempo100 ? `; mit Tempo-100-Zulassung schon ab ${REIFEN_ROT_JAHRE_TEMPO_100} Jahren rot` : ""}.
                </p>
                {darfVerwalten && (
                  <div className={s.kartenfuss}>
                    <Button onClick={() => setOffen({ was: "satz", satz: null })}>Reifensatz hinzufügen</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className={s.spalte}>
          <Card title="Technische Daten" data-karte="technik">
            {technikLeer(t) ? (
              <div className={s.leer}>
                <p>Noch keine technischen Daten erfasst.</p>
                {darfVerwalten && <Button onClick={() => setOffen({ was: "technik" })}>Technische Daten eintragen</Button>}
              </div>
            ) : (
              <dl className={s.datenliste}>
                <dt>Modell</dt><dd>{t.modell ?? NICHT_ERFASST}</dd>
                <dt>Baujahr</dt><dd>{t.baujahr ?? NICHT_ERFASST}</dd>
                <dt>Maße (L × B × H)</dt><dd>{masseText(t) ?? NICHT_ERFASST}</dd>
                <dt>Zul. Gesamtgewicht</dt><dd>{t.zggKg !== null ? kgText(t.zggKg) : NICHT_ERFASST}</dd>
                <dt>Leergewicht</dt><dd>{t.leerKg !== null ? kgText(t.leerKg) : NICHT_ERFASST}</dd>
                <dt>Zuladung</dt>
                <dd>{zuladung !== null ? <>{kgText(zuladung)} <span className={`${s.neben} ${s.klein}`}>berechnet</span></> : NICHT_ERFASST}</dd>
                <dt>Führerschein</dt><dd>{t.fuehrerschein ? `Klasse ${t.fuehrerschein}` : NICHT_ERFASST}</dd>
                {!anhaenger && (
                  <>
                    <dt>Standardstärke</dt>
                    <dd>
                      {t.staerke ? (
                        <span className={s.staerke}>
                          <b>{t.staerke.join(" / ")} / {t.staerke.reduce((summe, n) => summe + n, 0)}</b>
                          <span className={s.unter}>Führer / Unterführer / Mannschaft / Gesamt</span>
                        </span>
                      ) : NICHT_ERFASST}
                    </dd>
                  </>
                )}
                <dt>Sitzplätze</dt><dd>{t.sitze ?? NICHT_ERFASST}</dd>
                {t.tragen ? <><dt>Tragen</dt><dd>{t.tragen}</dd></> : null}
                <dt>Besonderheiten</dt>
                <dd>{t.besonderheiten.length > 0 ? <div className={s.merkmale}>{t.besonderheiten.map((b) => <Tag key={b} style={{ marginInlineEnd: 0 }}>{b}</Tag>)}</div> : "—"}</dd>
              </dl>
            )}
          </Card>

          {!anhaenger && (
            <Card title="Kilometerstand" data-karte="km">
              {akte.km === null ? (
                <div className={s.leer}>
                  <p>Noch kein Kilometerstand abgelesen.</p>
                  {darfVerwalten && <Button onClick={() => setOffen({ was: "km" })}>Kilometerstand eintragen</Button>}
                </div>
              ) : (
                <>
                  <div className={s.kmZahl}>{kmText(akte.km)}</div>
                  <p className={s.neben} style={{ margin: "4px 0 0" }}>
                    {akte.kmAm ? `abgelesen am ${datum(akte.kmAm)}. ` : ""}Daraus rechnet die Akte die Servicegrenze nach Kilometern.
                  </p>
                </>
              )}
            </Card>
          )}

          <VerweisKarte
            titel="Beladung laut Lagerbuch"
            text="Was auf dem Fahrzeug liegt, führt das Lagerbuch: Fächer, Artikel und Verfall."
            herkunft="kommt aus dem Lagerbuch"
            verweis={verweise.lagerbuch}
            genau="Im Lagerbuch öffnen"
            allgemein="Zum Lagerbuch"
          />
          <VerweisKarte
            titel="Funkgeräte"
            text="Welche Funkgeräte im Fahrzeug stecken, steht bei den Funkgeräten."
            herkunft="kommt aus Funkgeräte"
            verweis={verweise.funk}
            genau="In Funkgeräte öffnen"
            allgemein="Zu den Funkgeräten"
          />
        </div>
      </div>

      {offen?.was === "erledigt" && <ErledigtDialog akte={akte} pruefung={offen.pruefung} heute={heute} schliessen={zu} />}
      {offen?.was === "pruefung" && <PruefungDialog akte={akte} pruefung={offen.pruefung} heute={heute} schliessen={zu} />}
      {offen?.was === "km" && <KilometerDialog akte={akte} schliessen={zu} />}
      {offen?.was === "satz" && <ReifensatzDialog akte={akte} satz={offen.satz} schliessen={zu} />}
      {offen?.was === "wechsel" && <ReifenwechselDialog akte={akte} schliessen={zu} />}
      {offen?.was === "technik" && <TechnikFlyin akte={akte} schliessen={zu} />}
    </div>
  );
}

/**
 * Beladung und Funkgeräte stehen nicht in der Akte, sondern in ihrer App. Die Karte sagt das und zeigt
 * dorthin — ohne Zahlen, denn die Akte liest dort nichts. Ein voller Seitenwechsel (`<a>`): die App liegt
 * auf einem anderen Host. Ohne Adresse (App in dieser Umgebung nicht erreichbar) bleibt nur der Satz.
 */
function VerweisKarte({ titel, text, herkunft, verweis, genau, allgemein }: { titel: string; text: string; herkunft: string; verweis: AkteVerweis | null; genau: string; allgemein: string }) {
  return (
    <Card title={titel} data-karte="verweis">
      <div className={s.verweis}>
        <p>{text}</p>
        <div className={s.verweisZeile}>
          <span className={`${s.neben} ${s.klein}`}>{herkunft}</span>
          {verweis ? (
            <a className={s.verweisLink} href={verweis.href}>
              {verweis.genau ? genau : allgemein}
              <Icons8Ikone name="chevron-right" groesse={16} />
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

