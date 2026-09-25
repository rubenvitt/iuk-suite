/**
 * Das Stammdatenpaket für die App (Spec §12, `GET api/stammdaten` und `POST api/einrichten`):
 * nur aktive Einträge, genau die Drahtfelder von `stammdatenpaketSchema`, dazu die Einstellungen
 * und die Suite-Zone. Vor der Ausgabe prüft die Suite die Grenzen des Readers
 * (Entscheidung 13) — ein Schnappschuss über der Grenze ließe sich versiegeln, aber nie mehr lesen.
 */
import { zeitFormat, zeitzone } from "@/core/zeit";
import { leseEinstellungen } from "../einstellungen";
import { einsatzSchema } from "../reader/pruefung";
import { listeFahrzeuge, listePersonal, listeStichworte, stammdatenVersion, type Db } from "../stammdaten/daten";
import type { Stammdatenpaket } from "./vertrag";

const nachName = (a: string, b: string) => a.localeCompare(b, "de");

export function baueStammdatenpaket(db: Db): Stammdatenpaket {
  const gruppen = new Map<string, { name: string; reihenfolge: number }[]>();
  for (const s of listeStichworte(db)) {
    if (!s.aktiv) continue;
    gruppen.set(s.gruppe, [...(gruppen.get(s.gruppe) ?? []), { name: s.name, reihenfolge: s.reihenfolge }]);
  }
  const stichworte = [...gruppen.entries()]
    .map(([name, items]) => ({
      name,
      erste: Math.min(...items.map((i) => i.reihenfolge)),
      items: items.sort((a, b) => a.reihenfolge - b.reihenfolge || nachName(a.name, b.name)).map((i) => i.name),
    }))
    .sort((a, b) => a.erste - b.erste || nachName(a.name, b.name))
    .map(({ name, items }) => ({ name, items }));
  const e = leseEinstellungen(db);
  return {
    version: stammdatenVersion(db),
    stammdaten: {
      fahrzeuge: listeFahrzeuge(db).filter((f) => f.aktiv).map(({ id, typ, kennung, ruf, standort }) => ({ id, typ, kennung, ruf, standort })),
      personal: listePersonal(db).filter((p) => p.aktiv).map(({ id, name, quali, ov }) => ({ id, name, quali, ov })),
      stichworte,
    },
    fristMinuten: e.fristMinuten,
    besatzung: e.besatzung,
    zeitzone: zeitzone(),
    bereitschaft: e.bereitschaft,
  };
}

/** ETag `"<version>/<zeitzone>"` (Entscheidung 7): Die Zone gehört zum Paket, zählt aber nicht zur Version. */
export function etagVon(p: Stammdatenpaket): string {
  return `"${p.version}/${p.zeitzone}"`;
}

export type Lesergrenze = { ok: true } | { ok: false; feld: string; eintrag: string; laenge: number; hoechstens: number };

/**
 * Prüft jedes Feld, das als Schnappschuss in einen Einsatz wandert, gegen `einsatzSchema`. Feldnamen,
 * Reihenfolge und Eintrag wie `pruefe_stammdaten` im Rust-Kern (`apps/einsatzbuch/src-tauri/kern/src/grenzen.rs`):
 * Fahrzeuge und Personen heißen nach ihrer ID (gekürzt auf deren Grenze), Stichworte nach ihrer Gruppe.
 * Länge in UTF-16-Codeeinheiten wie `z.string().max`.
 */
export function pruefeLesergrenzen(p: Stammdatenpaket): Lesergrenze {
  const e = einsatzSchema.shape;
  const fz = e.fahrzeuge.element.shape;
  const ps = e.personal.element.shape;
  const max = (s: { maxLength: number | null }) => s.maxLength ?? Number.POSITIVE_INFINITY;
  const kurz = (id: string, n: number) => Array.from(id).slice(0, n).join("");
  const pruefungen: [string, string, string, number][] = [];
  for (const f of p.stammdaten.fahrzeuge) {
    const eintrag = kurz(f.id, max(fz.id));
    pruefungen.push(
      ["Fahrzeug-ID", eintrag, f.id, max(fz.id)], ["Fahrzeugtyp", eintrag, f.typ, max(fz.typ)], ["Kennung", eintrag, f.kennung, max(fz.kennung)],
      ["Funkrufname", eintrag, f.ruf, max(fz.ruf)], ["Standort", eintrag, f.standort, max(fz.standort)],
    );
  }
  for (const x of p.stammdaten.personal) {
    const eintrag = kurz(x.id, max(ps.id));
    pruefungen.push(
      ["Personen-ID", eintrag, x.id, max(ps.id)], ["Name", eintrag, x.name, max(ps.name)],
      ["Qualifikation", eintrag, x.quali, max(ps.quali)], ["Ortsverein", eintrag, x.ov, max(ps.ov)],
    );
  }
  for (const g of p.stammdaten.stichworte) {
    for (const item of g.items) pruefungen.push(["Alarmstichwort", g.name, item, max(e.stichwort)]);
  }
  for (const [feld, eintrag, wert, hoechstens] of pruefungen) {
    if (wert.length > hoechstens) return { ok: false, feld, eintrag, laenge: wert.length, hoechstens };
  }
  return { ok: true };
}

const ZEITPUNKT = zeitFormat("sv-SE", {
  hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset",
});

/**
 * ISO-Zeitpunkt mit Offset in der Suite-Zone, z. B. `2026-09-25T10:00:00+02:00` — die Form, in der
 * der Drahtvertrag Zeitpunkte führt. Die Zone löst `zeitFormat` je Aufruf auf (`@/core/zeit`).
 */
export function zeitpunktInZone(d: Date): string {
  const t = Object.fromEntries(ZEITPUNKT.formatToParts(d).map((p) => [p.type, p.value]));
  // `longOffset` liefert „GMT+02:00“, für UTC nur „GMT“. Manche ICU-Fassungen schreiben Mitternacht trotz `h23` als 24.
  const versatz = t.timeZoneName === "GMT" ? "+00:00" : t.timeZoneName.replace(/^GMT/, "").replace("−", "-");
  const stunde = t.hour === "24" ? "00" : t.hour;
  return `${t.year}-${t.month}-${t.day}T${stunde}:${t.minute}:${t.second}${versatz}`;
}
