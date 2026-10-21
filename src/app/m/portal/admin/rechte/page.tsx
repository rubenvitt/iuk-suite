import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { suiteAdminGroup } from "@/core/groups";
import { ladeRechte, rechteKatalog, ROLLEN_TEXT } from "@/app/m/portal/_lib/rechte";
import { rechteSeiteOderNotFound } from "@/app/m/portal/_lib/rechteZugang";
import { RechteVerwaltung, type RechteAbschnitt } from "./RechteVerwaltung";

export const metadata = { title: "Rechte" };

/**
 * Nutzerrechte vergeben (IDA-253). Die Rechte der Suite sind Pocket-ID-Gruppen; diese Seite schaltet
 * Mitgliedschaften, sie führt keine eigene Rechteliste. Nur für die Suite-Betriebsgruppe, wie das Audit-Log.
 */
export default async function RechtePage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const selbst = await rechteSeiteOderNotFound();
  const { person } = await searchParams;
  const daten = await ladeRechte();

  const kopf = (
    <Seitenkopf
      titel="Rechte"
      beschreibung="Wer darf welches Modul benutzen oder verwalten? Hier nimmst du Personen in die Gruppen aus Pocket ID auf oder heraus."
      zurueck={{ titel: "Verwaltung", href: "/admin" }}
    />
  );

  if (daten.status !== "ok") {
    return (
      <div data-testid="rechte">
        {kopf}
        <p style={{ margin: 0 }} data-testid="rechte-ausfall">
          {daten.status === "unconfigured"
            ? "Pocket ID ist für die Suite nicht eingerichtet (POCKET_ID_API_KEY fehlt). Ohne Zugang lassen sich hier keine Rechte vergeben."
            : "Pocket ID antwortet gerade nicht. Lade die Seite gleich noch einmal."}
        </p>
      </div>
    );
  }

  const katalog = rechteKatalog(daten.gruppen);
  const abschnitte: RechteAbschnitt[] = katalog.abschnitte.map((a) => ({
    schluessel: a.schluessel,
    titel: a.titel,
    rollen: a.rollen.map((r) => ({
      gruppeId: r.gruppe.id,
      anzeige: r.gruppe.anzeige,
      name: r.gruppe.name,
      beschreibung: ROLLEN_TEXT[r.art],
      ldap: r.gruppe.ldap,
    })),
  }));
  if (katalog.weitere.length > 0) {
    abschnitte.push({
      schluessel: "weitere",
      titel: "Weitere Gruppen",
      rollen: katalog.weitere.map((g) => ({
        gruppeId: g.id,
        anzeige: g.anzeige,
        name: g.name,
        beschreibung: "Gehört zu keinem Modul der Suite, etwa für einen anderen Dienst",
        ldap: g.ldap,
      })),
    });
  }
  const betrieb = daten.gruppen.find((g) => g.name === suiteAdminGroup()) ?? null;

  return (
    <div data-testid="rechte">
      {kopf}
      <RechteVerwaltung
        personen={daten.personen}
        abschnitte={abschnitte}
        betriebGruppeId={betrieb?.id ?? null}
        selbstId={selbst.id}
        startPersonId={person ?? null}
      />
    </div>
  );
}
