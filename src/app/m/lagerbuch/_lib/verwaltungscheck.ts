/**
 * DIE REINE LOGIK DER ZÄHLSEITE (Verwaltungscheck) — Spec 6.3, 6.4, 6.12.
 *
 * KEIN "use client", kein antd, kein Icon: die Insel `VerwaltungsZaehlung`
 * rechnet hiermit, und ein Wert aus einem Client-Modul käme in einer Server
 * Component als Client-Referenz an (Falle 6/7, `CLAUDE.md`). Die Zeit kommt
 * als Parameter `jetzt` — wie `verfallStatus`, prüfbar ohne gefälschte Uhr.
 *
 * Der Zählstand kennt nur, was jemand ERFASST hat: ein fehlender Schlüssel in
 * `ist` heißt „nicht gezählt", eine 0 heißt „Fach leer". Was davon auf die
 * Leitung geht, entscheidet allein `baueNutzlast`; die Leiste sperrt vorher
 * über `sperrGruende` dieselben Fälle, die der Server abweist.
 */
import { druckZuHoch } from "./domain/o2";
import { obergrenze, ueberschuss } from "./domain/sollBereich";
import { verfallStatus } from "./domain/verfall";
import { geraetBeantwortet } from "./checkNutzlast";
import { MONAT_REGEX, PSEUDO_VERFALL, type Zustand } from "./konstanten";
import type { VerwaltungscheckDaten } from "./lesepfade/verwaltungscheck";

export type Herkunft =
  | { art: "handlager" }
  | { art: "ort"; vonLagerortId: string; chargeId: string }
  | {
    art: "neu";
    charge: { art: "vorhanden"; chargeId: string } | { art: "neu"; chargenNr?: string; verfall: string };
  };

/** Je Artikel höchstens eine Absicht je Art (Spec 6.4). */
export type Ausgleich = {
  aussondern?: { menge: number; grund?: string };
  zuruecklegen?: { menge: number; zielLagerortId: string; chargeId?: string };
  /** `mitgezaehlt`: „Schon eingeräumt und mitgezählt" (Spec 6.12.5). */
  auffuellen?: { menge: number; herkunft: Herkunft; mitgezaehlt?: boolean };
};

export type GeraetEingabe = { vorhanden: boolean; zustand?: Zustand; bemerkung?: string; selbsttest?: boolean };

export type ZaehlZustand = {
  /** sollPositionId → gezählte Menge. Fehlt = nicht gezählt. */
  ist: Record<string, number>;
  /** sollPositionId → Verfall nach dem Ausgleich; `null` leert. Fehlt = unangetastet. */
  verfall: Record<string, string | null>;
  /** artikelId → Absichten. */
  ausgleich: Record<string, Ausgleich>;
  /** plombeId → neue Nummer; leer = unverändert. */
  plomben: Record<string, string>;
  geraete: Record<string, GeraetEingabe>;
  /** flascheId → abgelesener Druck in bar. */
  druck: Record<string, number>;
  kommentar: string;
};

/**
 * Die Nutzlast an `verwaltungscheckAbschluss` — gespiegelt aus dessen Schema
 * (`VerwaltungscheckSchema` in `_actions/verwaltungscheck.ts`). Dass beide
 * zusammenpassen, prüft `verwaltungscheck.test.ts` am Typ und
 * `_actions/verwaltungscheck.test.ts` an der echten Action.
 */
export type VerwaltungscheckNutzlast = {
  fahrzeugId: string;
  sendungId: string;
  kommentar?: string;
  positionen: { sollPositionId: string; ist: number }[];
  verfaelle: { sollPositionId: string; verfall: string | null }[];
  ausgleich: ({ artikelId: string } & Ausgleich)[];
  plomben: { plombeId: string; nummer: string }[];
  geraete: {
    geraetId: string; vorhanden: boolean; zustand?: Zustand; bemerkung?: string; selbsttest?: boolean;
  }[];
  flaschen: { flascheId: string; druckBar: number }[];
};

export function leererZustand(): ZaehlZustand {
  return { ist: {}, verfall: {}, ausgleich: {}, plomben: {}, geraete: {}, druck: {}, kommentar: "" };
}

type Position = VerwaltungscheckDaten["positionen"][number];

/** Die Soll-Positionen je Artikel, in der Reihenfolge der ersten Position. */
function jeArtikel(daten: VerwaltungscheckDaten): Map<string, Position[]> {
  const m = new Map<string, Position[]>();
  for (const p of daten.positionen) m.set(p.artikelId, [...(m.get(p.artikelId) ?? []), p]);
  return m;
}

function gezaehlt(z: ZaehlZustand, sollPositionId: string): boolean {
  return typeof z.ist[sollPositionId] === "number";
}

/** Die Ist-Summe eines Artikels, oder `null`, solange eines seiner Fächer offen ist. */
function istSumme(z: ZaehlZustand, positionen: Position[]): number | null {
  if (!positionen.every((p) => gezaehlt(z, p.id))) return null;
  return positionen.reduce((s, p) => s + z.ist[p.id]!, 0);
}

/** Was vor der Eingabe galt — die Vorgabe des Verfallsfelds (Spec 6.3). */
function verfallVorher(daten: VerwaltungscheckDaten, p: Position): string | null {
  return daten.verfallFach[p.id] ?? daten.verfallArtikel[p.artikelId] ?? null;
}

/** Was nach der Eingabe gilt: der eingegebene Wert, sonst der vorherige. */
function verfallNachher(daten: VerwaltungscheckDaten, z: ZaehlZustand, p: Position): string | null {
  return Object.hasOwn(z.verfall, p.id) ? z.verfall[p.id] || null : verfallVorher(daten, p);
}

/** Ein ungültiger Monat ist ein Zwischenstand beim Tippen, kein Fehler — er läuft nicht ab. */
function abgelaufen(daten: VerwaltungscheckDaten, v: string | null, jetzt: Date): boolean {
  return v !== null && MONAT_REGEX.test(v) && verfallStatus(v, daten.schwellen, jetzt).abgelaufen;
}

/** Spec 6.4: Ausgleich zählt nur mit mindestens einer Absicht. */
function hatAbsicht(a: Ausgleich | undefined): a is Ausgleich {
  return a !== undefined && (a.aussondern !== undefined || a.zuruecklegen !== undefined || a.auffuellen !== undefined);
}

/**
 * Was vor dem Aussondern an der Einheit steht: der Server bucht die Korrektur
 * auf `Ist − mitgezählt` und sondert ERST DANACH aus (Spec 6.12.5).
 */
function basisVorAussondern(ist: number, a: Ausgleich | undefined): number {
  return ist - (a?.auffuellen?.mitgezaehlt ? a.auffuellen.menge : 0);
}

export type ChargeAnEinheit = VerwaltungscheckDaten["chargenAnEinheit"][string][number];

/** FEFO über eine Chargenliste: früherer Verfall zuerst, sonst die gelieferte Reihenfolge (stabil). */
function fefoAbziehen(chargen: ChargeAnEinheit[], menge: number): ChargeAnEinheit[] {
  let offen = menge;
  return chargen.map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.verfall.localeCompare(b.c.verfall) || a.i - b.i)
    .map(({ c }) => {
      const nimm = Math.min(Math.max(c.menge, 0), Math.max(offen, 0));
      offen -= nimm;
      return { ...c, menge: c.menge - nimm };
    });
}

/** Steht für die Korrektur-Charge, die der Server bei einem Plus ohne Charge erst anlegt — nie wählbar. */
const KORREKTUR_CHARGE = "";

/**
 * DIE CHARGEN AN DER EINHEIT, WIE SIE DAS ZURÜCKLEGEN SIEHT — nach der Zählung
 * und nach dem Aussondern, in FEFO-Reihenfolge, nur mit Rest > 0.
 *
 * Der Abschluss bucht ZUERST die Korrektur auf `Ist − mitgezählt`
 * (`korrekturAufLagerort`, `_lib/schreibpfade/korrektur.ts`), DANN das
 * Aussondern (FEFO an der Einheit) und prüft erst danach den Rest der
 * gewählten Charge. Dieselbe Regel hier:
 *   Minus → FEFO über die Chargen der Einheit,
 *   Plus  → auf die jüngste Charge des Artikels (`korrekturPlusCharge`, auch
 *           wenn sie bisher nicht hier lag), ohne jede Charge auf eine
 *           Korrektur-Charge, die erst im Abschluss entsteht und hier nicht
 *           wählbar ist.
 * Ein Artikel, der nicht ganz gezählt ist, behält seine Chargen von heute.
 */
export function chargenNachZaehlung(daten: VerwaltungscheckDaten, z: ZaehlZustand, artikelId: string): ChargeAnEinheit[] {
  let chargen = daten.chargenAnEinheit[artikelId] ?? [];
  const ist = istSumme(z, jeArtikel(daten).get(artikelId) ?? []);
  if (ist !== null) {
    const a = z.ausgleich[artikelId];
    const diff = Math.max(0, basisVorAussondern(ist, a)) - (daten.buchstand[artikelId] ?? 0);
    if (diff < 0) {
      chargen = fefoAbziehen(chargen, -diff);
    } else if (diff > 0) {
      const plus = daten.korrekturPlusCharge[artikelId];
      const id = plus?.chargeId ?? KORREKTUR_CHARGE;
      chargen = chargen.some((c) => c.chargeId === id)
        ? chargen.map((c) => (c.chargeId === id ? { ...c, menge: c.menge + diff } : c))
        : [...chargen, plus ? { ...plus, menge: diff } : { chargeId: id, label: "", verfall: PSEUDO_VERFALL, menge: diff }];
    }
    if (a?.aussondern) chargen = fefoAbziehen(chargen, a.aussondern.menge);
  }
  return fefoAbziehen(chargen, 0).filter((c) => c.menge > 0 && c.chargeId !== KORREKTUR_CHARGE);
}

export type AusgleichZeile = {
  artikelId: string;
  artikelName: string;
  einheit: string;
  sollSumme: number;
  obergrenze: number;
  ist: number;
  buchstand: number;
  fehlmenge: number;
  ueberschuss: number;
  abgelaufen: boolean;
  /** Ist > Buchstand und kein Auffüllen: „Mehr als im Lagerbuch — woher?" (sperrt nicht). */
  plusOhneHerkunft: boolean;
  /** Ist − Aussondern − Zurücklegen + Auffüllen; mitgezählt Aufgefülltes steckt schon im Ist. */
  nachAusgleich: number;
};

/**
 * Die Zeilen des Reiters „Ausgleichen" — je ganz gezähltem Artikel mit
 * Fehlmenge, Überschuss, abgelaufenem Fach oder erfasster Absicht.
 *
 * ⚠️ AUCH EIN PLUS OHNE HERKUNFT BEKOMMT EINE ZEILE, selbst wenn Ist = Soll:
 * nur dort lässt sich „schon eingeräumt und mitgezählt" erfassen (Spec 6.12.5,
 * Erstbestückung in der Reihenfolge „erst einräumen, dann zählen").
 */
export function ausgleichZeilen(daten: VerwaltungscheckDaten, z: ZaehlZustand, jetzt: Date): AusgleichZeile[] {
  const zeilen: AusgleichZeile[] = [];
  for (const [artikelId, positionen] of jeArtikel(daten)) {
    const ist = istSumme(z, positionen);
    if (ist === null) continue;
    const sollSumme = positionen.reduce((s, p) => s + p.soll, 0);
    const grenze = positionen.reduce((s, p) => s + obergrenze(p.soll, p.sollMax), 0);
    const buchstand = daten.buchstand[artikelId] ?? 0;
    const a = z.ausgleich[artikelId];
    // Vor der Neueingabe abgelaufen ODER als abgelaufen eingegeben (Spec 6.4).
    const istAbgelaufen = positionen.some((p) =>
      abgelaufen(daten, verfallVorher(daten, p), jetzt)
      || (Object.hasOwn(z.verfall, p.id) && abgelaufen(daten, z.verfall[p.id] ?? null, jetzt)));
    const zeile: AusgleichZeile = {
      artikelId,
      artikelName: positionen[0]!.artikelName,
      einheit: positionen[0]!.einheit,
      sollSumme,
      obergrenze: grenze,
      ist,
      buchstand,
      fehlmenge: Math.max(0, sollSumme - ist),
      ueberschuss: ueberschuss(ist, sollSumme, grenze),
      abgelaufen: istAbgelaufen,
      plusOhneHerkunft: ist > buchstand && a?.auffuellen === undefined,
      nachAusgleich: ist - (a?.aussondern?.menge ?? 0) - (a?.zuruecklegen?.menge ?? 0)
        + (a?.auffuellen && !a.auffuellen.mitgezaehlt ? a.auffuellen.menge : 0),
    };
    if (zeile.fehlmenge > 0 || zeile.ueberschuss > 0 || zeile.abgelaufen || zeile.plusOhneHerkunft || hatAbsicht(a)) {
      zeilen.push(zeile);
    }
  }
  return zeilen;
}

export type Sperrgrund = {
  art: "teilartikel" | "plombe" | "abgelaufen" | "menge" | "druck" | "leer";
  text: string;
  /** Nur „teilartikel": der Artikelname — `sperrZeilenKurz` fasst danach zusammen. */
  artikel?: string;
};

/** So viele Gründe stehen in der klebenden Leiste, bevor „alle zeigen" kommt. */
const SPERR_ZEILEN = 3;

/**
 * DIE GRÜNDE FÜR DIE KLEBENDE LEISTE — kurz, damit sie auf 390px nicht den
 * Bildschirm füllt: mehr als zwei angefangene Artikel werden EINE Zeile mit
 * den ersten Namen, danach stehen höchstens drei Zeilen; `weitere` zählt den
 * Rest. `gekuerzt` heißt: die volle Liste (`sperrGruende`) sagt mehr.
 */
export function sperrZeilenKurz(gruende: readonly Sperrgrund[]): { zeilen: string[]; weitere: number; gekuerzt: boolean } {
  const teil = gruende.filter((g) => g.art === "teilartikel");
  let zeilen = gruende.map((g) => g.text);
  if (teil.length > 2) {
    const namen = teil.slice(0, 2).map((g) => g.artikel ?? g.text);
    const sammel = `${teil.length} Artikel: auch in weiteren Fächern zählen (${namen.join(", ")}, …)`;
    const erste = gruende.findIndex((g) => g.art === "teilartikel");
    zeilen = gruende.flatMap((g, i) => (i === erste ? [sammel] : g.art === "teilartikel" ? [] : [g.text]));
  }
  const sichtbar = zeilen.slice(0, SPERR_ZEILEN);
  return { zeilen: sichtbar, weitere: zeilen.length - sichtbar.length, gekuerzt: sichtbar.length < gruende.length };
}

function fachName(fachLabel: string | null): string {
  return fachLabel === null ? "ohne Fach" : `Fach ${fachLabel}`;
}

/**
 * Warum „Abschließen" gesperrt ist — dieselben Fälle, die der Server abweist,
 * plus der Verfall nach dem Aussondern (Spec 6.12.2, dort keine Absage).
 * Leer heißt: abschließbar.
 */
export function sperrGruende(daten: VerwaltungscheckDaten, z: ZaehlZustand, jetzt: Date): Sperrgrund[] {
  const gruende: Sperrgrund[] = [];
  const artikel = jeArtikel(daten);

  // Spec 6.3: ein angefangener Artikel muss in allen seinen Fächern gezählt sein.
  for (const positionen of artikel.values()) {
    const offen = positionen.filter((p) => !gezaehlt(z, p.id));
    if (offen.length === 0 || offen.length === positionen.length) continue;
    const faecher = [...new Set(offen.map((p) => fachName(p.fachLabel)))];
    const artikelName = positionen[0]!.artikelName;
    gruende.push({ art: "teilartikel", text: `${artikelName}: auch in ${faecher.join(", ")} zählen`, artikel: artikelName });
  }

  // Spec 6.12.3: eine neue Nummer an einer Plombe mit Fach verlangt das ganze Fach. Ohne Fach frei.
  for (const pl of daten.plomben) {
    if (pl.fachLabel === null || !z.plomben[pl.id]?.trim()) continue;
    if (daten.positionen.some((p) => p.fachLabel === pl.fachLabel && !gezaehlt(z, p.id))) {
      gruende.push({ art: "plombe", text: `Plombe „${pl.bezeichnung}“: erst das ganze Fach ${pl.fachLabel} zählen.` });
    }
  }

  // Spec 6.12.2: wer aussondert, trägt den Verfall danach nach oder leert ihn.
  for (const [artikelId, positionen] of artikel) {
    if (!z.ausgleich[artikelId]?.aussondern) continue;
    if (positionen.some((p) => abgelaufen(daten, verfallNachher(daten, z, p), jetzt))) {
      gruende.push({ art: "abgelaufen", text: `${positionen[0]!.artikelName}: neuen Verfall eintragen oder leeren` });
    }
  }

  /*
   * Spec 6.4: jede Bewegung weist ab statt zu kappen — die Leiste sperrt vorher.
   * Reihenfolge wie im Server: Korrektur auf `Ist − mitgezählt`, dann
   * aussondern, dann zurücklegen. Nur ganz gezählte Artikel; den Rest deckt
   * „teilartikel" ab.
   */
  for (const [artikelId, positionen] of artikel) {
    const a = z.ausgleich[artikelId];
    const ist = istSumme(z, positionen);
    if (!hatAbsicht(a) || ist === null) continue;
    const name = positionen[0]!.artikelName;
    if (a.auffuellen?.mitgezaehlt && a.auffuellen.menge > ist) {
      gruende.push({ art: "menge", text: `${name}: höchstens ${ist} mitgezählt auffüllen` });
      continue;
    }
    const basis = basisVorAussondern(ist, a);
    const ausgesondert = a.aussondern?.menge ?? 0;
    if (ausgesondert > basis) {
      gruende.push({ art: "menge", text: `${name}: höchstens ${basis} aussondern` });
    } else if (a.zuruecklegen && a.zuruecklegen.menge > basis - ausgesondert) {
      gruende.push({ art: "menge", text: `${name}: höchstens ${basis - ausgesondert} zurücklegen` });
    } else if (a.zuruecklegen?.chargeId) {
      // Der Server prüft den Rest der Charge NACH Korrektur und Aussondern (`chargenNachZaehlung`).
      const { chargeId, menge } = a.zuruecklegen;
      const n = chargenNachZaehlung(daten, z, artikelId).find((c) => c.chargeId === chargeId)?.menge ?? 0;
      if (menge > n) gruende.push({ art: "menge", text: `${name}: höchstens ${n} von dieser Charge zurücklegen` });
    }
  }

  for (const f of daten.flaschen) {
    const d = z.druck[f.id];
    if (d !== undefined && druckZuHoch(d, f.nennfuelldruckBar)) {
      gruende.push({ art: "druck", text: `${f.name}: Druck über dem Nennfülldruck — am Manometer nachsehen` });
    }
  }

  // Spec 6.12.6: ohne gezählte Position erlaubt, ganz leer nicht — gezählt wie im Server.
  const n = baueNutzlast(daten, z, "");
  if (n.positionen.length + n.geraete.length + n.flaschen.length + n.plomben.length === 0) {
    gruende.push({ art: "leer", text: "Es ist noch nichts erfasst." });
  }
  return gruende;
}

export type Fortschritt = {
  positionenGezaehlt: number;
  positionenGesamt: number;
  /** Gezählte Positionen außerhalb von Soll bis „OK bis". */
  abweichungen: number;
  geraeteBeantwortet: number;
  geraeteGesamt: number;
  flaschenAbgelesen: number;
  flaschenGesamt: number;
};

/** Die Kennzahlen der Abschlussleiste (Spec 6.2). */
export function fortschritt(daten: VerwaltungscheckDaten, z: ZaehlZustand): Fortschritt {
  const gezaehltePositionen = daten.positionen.filter((p) => gezaehlt(z, p.id));
  return {
    positionenGezaehlt: gezaehltePositionen.length,
    positionenGesamt: daten.positionen.length,
    abweichungen: gezaehltePositionen.filter((p) => {
      const ist = z.ist[p.id]!;
      return ist < p.soll || ist > obergrenze(p.soll, p.sollMax);
    }).length,
    geraeteBeantwortet: daten.geraete.filter((g) => geraetBeantwortet(z.geraete[g.id], g.selbsttest)).length,
    geraeteGesamt: daten.geraete.length,
    flaschenAbgelesen: daten.flaschen.filter((f) => z.druck[f.id] !== undefined).length,
    flaschenGesamt: daten.flaschen.length,
  };
}

/** Eine Absicht in Leitungsform: leere Zusätze fallen weg, `mitgezaehlt` nur, wenn gesetzt. */
function ausgleichNutzlast(artikelId: string, a: Ausgleich): VerwaltungscheckNutzlast["ausgleich"][number] {
  const grund = a.aussondern?.grund?.trim();
  const herkunft = a.auffuellen?.herkunft;
  const chargenNr = herkunft?.art === "neu" && herkunft.charge.art === "neu" ? herkunft.charge.chargenNr?.trim() : undefined;
  return {
    artikelId,
    ...(a.aussondern ? { aussondern: { menge: a.aussondern.menge, ...(grund ? { grund } : {}) } } : {}),
    ...(a.zuruecklegen ? {
      zuruecklegen: {
        menge: a.zuruecklegen.menge, zielLagerortId: a.zuruecklegen.zielLagerortId,
        ...(a.zuruecklegen.chargeId ? { chargeId: a.zuruecklegen.chargeId } : {}),
      },
    } : {}),
    ...(a.auffuellen && herkunft ? {
      auffuellen: {
        menge: a.auffuellen.menge,
        herkunft: herkunft.art === "neu" && herkunft.charge.art === "neu"
          ? { art: "neu", charge: { art: "neu", ...(chargenNr ? { chargenNr } : {}), verfall: herkunft.charge.verfall } }
          : herkunft,
        ...(a.auffuellen.mitgezaehlt ? { mitgezaehlt: true } : {}),
      },
    } : {}),
  };
}

/**
 * Die Nutzlast des Abschlusses. Gesendet wird nur, was erfasst ist: gezählte
 * Positionen, GEÄNDERTE Verfälle gezählter Positionen (Spec 6.12.2), der
 * Ausgleich ganz gezählter Artikel, nicht-leere Plombennummern, beantwortete
 * Geräte, abgelesene Flaschen. Schlüssel, die nicht zu dieser Einheit gehören
 * (ein alter Entwurf), fallen weg — die Listen laufen über `daten`.
 *
 * ⚠️ EIN AUSGLEICH NICHT GANZ GEZÄHLTER ARTIKEL FÄLLT STILL WEG: die Zeile
 * dazu ist im Reiter nicht mehr zu sehen, und der Server wiese ihn ab. Ein
 * halb gezählter Artikel sperrt ohnehin („teilartikel").
 */
export function baueNutzlast(daten: VerwaltungscheckDaten, z: ZaehlZustand, sendungId: string): VerwaltungscheckNutzlast {
  const gezaehltePositionen = daten.positionen.filter((p) => gezaehlt(z, p.id));
  const kommentar = z.kommentar.trim();
  return {
    fahrzeugId: daten.fahrzeug.id,
    sendungId,
    ...(kommentar ? { kommentar } : {}),
    positionen: gezaehltePositionen.map((p) => ({ sollPositionId: p.id, ist: z.ist[p.id]! })),
    verfaelle: gezaehltePositionen.flatMap((p) => {
      if (!Object.hasOwn(z.verfall, p.id)) return [];
      const verfall = z.verfall[p.id] || null;
      // Ein ungültiger Monat ginge am Schema des Servers scheitern — und mit ihm der ganze Abschluss.
      if (verfall !== null && !MONAT_REGEX.test(verfall)) return [];
      return verfall === verfallVorher(daten, p) ? [] : [{ sollPositionId: p.id, verfall }];
    }),
    ausgleich: [...jeArtikel(daten)].flatMap(([artikelId, positionen]) => {
      const a = z.ausgleich[artikelId];
      return hatAbsicht(a) && istSumme(z, positionen) !== null ? [ausgleichNutzlast(artikelId, a)] : [];
    }),
    plomben: daten.plomben.flatMap((pl) => {
      const nummer = z.plomben[pl.id]?.trim();
      return nummer ? [{ plombeId: pl.id, nummer }] : [];
    }),
    // Wie `checkNutzlast` (IDA-377): nicht beantwortet heißt nicht gesendet.
    geraete: daten.geraete.flatMap((g) => {
      const a = z.geraete[g.id];
      if (!a || !geraetBeantwortet(a, g.selbsttest)) return [];
      const bemerkung = a.bemerkung?.trim();
      return [{
        geraetId: g.id, vorhanden: a.vorhanden,
        ...(a.vorhanden && a.zustand ? { zustand: a.zustand } : {}),
        ...(bemerkung ? { bemerkung } : {}),
        ...(a.vorhanden && g.selbsttest && a.selbsttest !== undefined ? { selbsttest: a.selbsttest } : {}),
      }];
    }),
    flaschen: daten.flaschen.flatMap((f) => {
      const d = z.druck[f.id];
      return d === undefined ? [] : [{ flascheId: f.id, druckBar: d }];
    }),
  };
}
