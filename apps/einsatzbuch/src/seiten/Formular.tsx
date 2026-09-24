/**
 * Erfassung eines Einsatzes, nach `Einsatzbuch v2.dc.html` (Abschnitt `istForm`). Die Seite hält
 * nur Suche und Filter selbst; der Entwurf gehört der App, jede Änderung geht über
 * `beiAenderung` hinaus (und wird dort verzögert gespeichert). Rechnungen und Texte kommen aus
 * `logik/formular.ts`.
 *
 * Kein `<form>`: Enter in einem Textfeld soll nie einen Einsatz absenden.
 */
import { useState, type KeyboardEvent } from "react";

import { Feld } from "../bausteine/Feld";
import { Hinweis } from "../bausteine/Hinweis";
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";
import { Zeichen } from "../bausteine/Symbol";
import {
  bereitText,
  dauerHinweis,
  fahrzeugFilter,
  fahrzeugTreffer,
  fehlendeAngaben,
  fristSatz,
  personFilter,
  personTreffer,
  schalteFahrzeug,
  schaltePerson,
  setzeZaehler,
  waehleErstenTreffer,
} from "../logik/formular";
import type { Entwurf, Stammdatenpaket } from "../typen";

interface FormularProps {
  entwurf: Entwurf;
  paket: Stammdatenpaket;
  bearbeiten: boolean;
  restText: string;
  beiAenderung: (e: Entwurf) => void;
  beiZurueck: () => void;
  beiVerwerfen: () => void;
  beiAbsenden: () => void;
}

type Textfeld = "beginnDatum" | "beginnZeit" | "endeDatum" | "endeZeit" | "strasse" | "ort" | "objekt" | "notizen";
type Zaehler = "vorOrt" | "transport";

const ZAEHLER: { feld: Zaehler; titel: string; hilfe: string; minus: string; plus: string }[] = [
  { feld: "vorOrt", titel: "Vor Ort behandelt", hilfe: "ohne Transport", minus: "Vor Ort behandelt: weniger", plus: "Vor Ort behandelt: mehr" },
  {
    feld: "transport",
    titel: "Behandelt mit Transport",
    hilfe: "ins Krankenhaus oder zum Arzt",
    minus: "Mit Transport: weniger",
    plus: "Mit Transport: mehr",
  },
];

/** Der Dauer-Hinweis rechnet mit Wanduhrzeiten; ein halb getipptes Feld darf die Seite nicht umwerfen. */
function sichererDauerHinweis(e: Entwurf, zeitzone: string): string {
  try {
    return dauerHinweis(e, zeitzone);
  } catch {
    return "";
  }
}

export function Formular({ entwurf: e, paket, bearbeiten, restText, beiAenderung, beiZurueck, beiVerwerfen, beiAbsenden }: FormularProps) {
  const { fahrzeuge, personal, stichworte } = paket.stammdaten;
  const [fzSuche, setFzSuche] = useState("");
  const [fzFilter, setFzFilter] = useState("Alle");
  const [peSuche, setPeSuche] = useState("");
  const [peFilter, setPeFilter] = useState("Alle");

  const setze = (feld: Textfeld) => (wert: string) => beiAenderung({ ...e, [feld]: wert });
  const unvollstaendig = fehlendeAngaben(e).length > 0;

  const fzMap = new Map(fahrzeuge.map((f) => [f.id, f]));
  const peMap = new Map(personal.map((p) => [p.id, p]));
  const fzTreffer = fahrzeugTreffer(fahrzeuge, fzSuche, fzFilter);
  const peTreffer = personTreffer(personal, peSuche, peFilter);
  const fzAuswahl = e.fahrzeuge.flatMap((id) => fzMap.get(id) ?? []);
  const peAuswahl = e.personal.flatMap((a) => {
    const p = peMap.get(a.id);
    return p ? [{ ...p, fahrzeugId: a.fahrzeugId }] : [];
  });

  const fzEnter = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key !== "Enter") return;
    const neu = waehleErstenTreffer(fzTreffer, e.fahrzeuge);
    if (neu === null) return;
    ev.preventDefault();
    if (neu !== e.fahrzeuge) beiAenderung({ ...e, fahrzeuge: neu });
    setFzSuche("");
  };
  const peEnter = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key !== "Enter") return;
    const erster = peTreffer[0];
    if (!erster) return;
    ev.preventDefault();
    if (!e.personal.some((p) => p.id === erster.id)) beiAenderung(schaltePerson(e, erster.id));
    setPeSuche("");
  };
  const setzeBesatzung = (personId: string, fahrzeugId: string) =>
    beiAenderung({ ...e, personal: e.personal.map((p) => (p.id === personId ? { ...p, fahrzeugId: fahrzeugId || null } : p)) });

  const anzPe = peAuswahl.length;

  return (
    <>
      <main className="seite seite-form" data-screen-label="Erfassung">
        <div className="seitenkopf">
          <div className="zurueck">
            <Knopf variante="text" zeichen="pfeil-links" onClick={beiZurueck}>
              {bearbeiten ? "Zurück zur Frist" : "Zurück"}
            </Knopf>
          </div>
          <div className="kicker">Einsatz erfassen · ohne Anmeldung</div>
          <h1 className="titel">{bearbeiten ? "Angaben ändern" : "Neuer Einsatz"}</h1>
          <div className="meta">
            <span className="meta-eintrag">
              <Zeichen name="schluessel" />
              Wird verschlüsselt gespeichert
            </span>
            <span className="meta-eintrag">
              <Zeichen name="verketten" />
              Wird an die Einsatzkette angehängt
            </span>
            <span className="meta-eintrag">
              <Zeichen name="info" />
              {fristSatz(paket.fristMinuten)}
            </span>
          </div>
        </div>

        {bearbeiten ? (
          <Hinweis ton="info" rolle="note">
            Noch <strong>{restText}</strong> zum Ändern. Übernimm deine Änderungen rechtzeitig — sonst wird der zuletzt abgesendete Stand versiegelt.
          </Hinweis>
        ) : null}

        <Karte titel="Alarmstichwort">
          <div className="stapel stapel-16">
            {stichworte.map((g) => (
              <div key={g.name} className="stichwort-gruppe">
                <div className="stichwort-gruppenname">{g.name}</div>
                <div className="reihe-umbruch">
                  {g.items.map((sw) => {
                    const an = e.stichwort === sw;
                    return (
                      <button
                        key={sw}
                        type="button"
                        className="stichwort"
                        aria-pressed={an}
                        onClick={() => beiAenderung({ ...e, stichwort: an ? "" : sw })}
                      >
                        {sw}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Karte>

        <Karte titel="Zeit und Einsatzort">
          <div className="stapel stapel-16">
            <div className="raster raster-180">
              <Feld label="Beginn · Datum" type="date" wert={e.beginnDatum} beiAenderung={setze("beginnDatum")} />
              <Feld label="Beginn · Uhrzeit" type="time" wert={e.beginnZeit} beiAenderung={setze("beginnZeit")} />
              <Feld label="Ende · Datum" type="date" wert={e.endeDatum} beiAenderung={setze("endeDatum")} />
              <Feld label="Ende · Uhrzeit" type="time" wert={e.endeZeit} beiAenderung={setze("endeZeit")} />
            </div>
            <div className="neben zahlen">{sichererDauerHinweis(e, paket.zeitzone)}</div>
            <div className="raster raster-260">
              <Feld label="Straße, Hausnummer" wert={e.strasse} beiAenderung={setze("strasse")} placeholder="z. B. Bahnhofstraße 12" />
              <Feld label="PLZ, Ort" wert={e.ort} beiAenderung={setze("ort")} placeholder="z. B. 29525 Uelzen" />
            </div>
            <Feld label="Objekt, Lage vor Ort" wert={e.objekt} beiAenderung={setze("objekt")} placeholder="z. B. Sporthalle, Zufahrt über Hof" />
          </div>
        </Karte>

        <Karte titel="Beteiligte Fahrzeuge" extra={`${fzAuswahl.length} ausgewählt`}>
          <div className="stapel stapel-12">
            {fzAuswahl.length > 0 ? (
              <div className="reihe-umbruch">
                {fzAuswahl.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="auswahl-chip"
                    aria-label={`${f.typ} ${f.kennung} entfernen`}
                    onClick={() => beiAenderung(schalteFahrzeug(e, f.id))}
                  >
                    <span className="auswahl-chip-typ">{f.typ}</span>
                    <span className="auswahl-chip-kennung">{f.kennung}</span>
                    <Zeichen name="kreuz" groesse={14} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="leer">Noch kein Fahrzeug ausgewählt. Such nach Typ, Funkrufname oder Standort.</div>
            )}
            <Feld
              wert={fzSuche}
              beiAenderung={setFzSuche}
              onKeyDown={fzEnter}
              placeholder="Fahrzeug suchen — z. B. „RTW“, „83-1“ oder „Ebstorf“"
              aria-label="Fahrzeug suchen"
            />
            <div className="reihe-umbruch reihe-6">
              {fahrzeugFilter(fahrzeuge).map((o) => (
                <button key={o} type="button" className="filter-chip" aria-pressed={o === fzFilter} onClick={() => setFzFilter(o)}>
                  {o}
                </button>
              ))}
            </div>
            <div className="trefferliste trefferliste-fz">
              {fzTreffer.map((f) => {
                const an = e.fahrzeuge.includes(f.id);
                return (
                  <button key={f.id} type="button" className="treffer treffer-fz" aria-pressed={an} onClick={() => beiAenderung(schalteFahrzeug(e, f.id))}>
                    <span className="kaestchen">{an ? <Zeichen name="haken" groesse={14} /> : null}</span>
                    <span className="treffer-typ">{f.typ}</span>
                    <span className="treffer-ruf">{f.ruf}</span>
                    <span className="treffer-neben">{f.standort}</span>
                  </button>
                );
              })}
              {fzTreffer.length === 0 ? <div className="treffer-leer">Kein Fahrzeug gefunden für „{fzSuche}“.</div> : null}
            </div>
            <div className="neben">
              {fzTreffer.length} von {fahrzeuge.length} Fahrzeugen · Enter wählt den ersten Treffer
            </div>
          </div>
        </Karte>

        <Karte titel="Eingesetztes Personal" extra={`${anzPe} ${anzPe === 1 ? "Kraft" : "Kräfte"}`}>
          <div className="stapel stapel-12">
            {anzPe > 0 && !paket.besatzung ? (
              <div className="reihe-umbruch">
                {peAuswahl.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="auswahl-chip auswahl-chip-person"
                    aria-label={`${p.name} entfernen`}
                    onClick={() => beiAenderung(schaltePerson(e, p.id))}
                  >
                    {p.name}
                    <span className="auswahl-chip-quali">{p.quali}</span>
                    <Zeichen name="kreuz" groesse={14} />
                  </button>
                ))}
              </div>
            ) : null}
            {anzPe > 0 && paket.besatzung ? (
              <div className="besatzung">
                {peAuswahl.map((p) => (
                  <div key={p.id} className="besatzung-zeile">
                    <span className="besatzung-name">{p.name}</span>
                    <span className="quali">{p.quali}</span>
                    <select
                      className="besatzung-wahl"
                      value={p.fahrzeugId ?? ""}
                      onChange={(ev) => setzeBesatzung(p.id, ev.target.value)}
                      aria-label={`Fahrzeug für ${p.name}`}
                    >
                      <option value="">Ohne Fahrzeug</option>
                      {fzAuswahl.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.typ} · {f.kennung}
                        </option>
                      ))}
                    </select>
                    <Knopf variante="text" zeichen="kreuz" aria-label={`${p.name} entfernen`} onClick={() => beiAenderung(schaltePerson(e, p.id))} />
                  </div>
                ))}
              </div>
            ) : null}
            {anzPe === 0 ? <div className="leer">Noch niemand ausgewählt. Such nach Name oder Qualifikation.</div> : null}
            <Feld
              wert={peSuche}
              beiAenderung={setPeSuche}
              onKeyDown={peEnter}
              placeholder="Person suchen — Nachname, Vorname oder Qualifikation"
              aria-label="Person suchen"
            />
            <div className="reihe-umbruch reihe-6">
              {personFilter(personal).map((o) => (
                <button key={o} type="button" className="filter-chip" aria-pressed={o === peFilter} onClick={() => setPeFilter(o)}>
                  {o}
                </button>
              ))}
            </div>
            <div className="trefferliste trefferliste-pe">
              {peTreffer.map((p) => {
                const an = e.personal.some((a) => a.id === p.id);
                return (
                  <button key={p.id} type="button" className="treffer treffer-pe" aria-pressed={an} onClick={() => beiAenderung(schaltePerson(e, p.id))}>
                    <span className="kaestchen">{an ? <Zeichen name="haken" groesse={14} /> : null}</span>
                    <span className="treffer-name">{p.name}</span>
                    <span className="quali">{p.quali}</span>
                    <span className="treffer-neben">{p.ov}</span>
                  </button>
                );
              })}
              {peTreffer.length === 0 ? <div className="treffer-leer">Niemand gefunden für „{peSuche}“.</div> : null}
            </div>
            <div className="neben">
              {peTreffer.length} von {personal.length} Personen · Enter wählt den ersten Treffer
            </div>
          </div>
        </Karte>

        <div className="raster raster-320 raster-24">
          <Karte titel="Patienten">
            <div className="stapel">
              {ZAEHLER.map((z) => (
                <div key={z.feld} className="zaehler">
                  <div className="zaehler-text">
                    <div className="zaehler-titel">{z.titel}</div>
                    <div className="neben">{z.hilfe}</div>
                  </div>
                  <Knopf zeichen="minus-kraeftig" aria-label={z.minus} onClick={() => beiAenderung({ ...e, [z.feld]: Math.max(0, e[z.feld] - 1) })} />
                  <input
                    className="zaehler-wert"
                    value={e[z.feld]}
                    onChange={(ev) => beiAenderung({ ...e, [z.feld]: setzeZaehler(ev.target.value) })}
                    inputMode="numeric"
                    aria-label={z.titel}
                  />
                  <Knopf zeichen="plus-kraeftig" aria-label={z.plus} onClick={() => beiAenderung({ ...e, [z.feld]: Math.min(999, e[z.feld] + 1) })} />
                </div>
              ))}
              <div className="gesamt">
                <div className="gesamt-label">Gesamt</div>
                <div className="gesamt-zahl">{e.vorOrt + e.transport}</div>
              </div>
            </div>
          </Karte>
          <Karte titel="Notizen">
            <div className="stapel stapel-8">
              <textarea
                className="notizen"
                value={e.notizen}
                onChange={(ev) => setze("notizen")(ev.target.value)}
                placeholder="Lage, Übergaben, Besonderheiten …"
                aria-label="Notizen"
              />
              <div className="neben">Keine Namen oder Diagnosen von Patienten eintragen.</div>
            </div>
          </Karte>
        </div>
      </main>

      <div className="fussleiste">
        <div className="fussleiste-innen">
          <div className={unvollstaendig ? "bereit bereit-offen" : "bereit"}>{bereitText(e)}</div>
          {bearbeiten ? <Knopf onClick={beiVerwerfen}>Änderungen verwerfen</Knopf> : null}
          <Knopf variante="primaer" zeichen="pfeil-rechts" className="knopf-breit" disabled={unvollstaendig} onClick={beiAbsenden}>
            {bearbeiten ? "Änderungen übernehmen" : "Einsatz absenden"}
          </Knopf>
        </div>
      </div>
    </>
  );
}
