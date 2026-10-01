import { BLATT, PAPIER } from "../../_lib/layout/masse";
import { BlattKopf, LogoDefs, type Rahmen } from "../zeichnung/Blatt";
import { FARBE } from "../zeichnung/farben";

/**
 * VORSCHAU DES KOPFS (Spec §4.4): derselbe `BlattKopf` wie auf jedem gedruckten Blatt, im Maßstab der
 * Seitenbreite — was hier steht, steht so auf dem Papier. Rein (Server Component); die Einstellungsseite
 * rendert sie nach jeder Änderung neu (`router.refresh()`).
 */
export function KopfVorschau({ kopf, schrift }: { kopf: Pick<Rahmen, "organisation" | "logo">; schrift?: string }) {
  const breite = PAPIER["a4-quer"].breite;
  const rahmen: Rahmen = { titel: "Kommunikationsplan (Beispiel)", untertitel: "Anlass · Datum", stand: "", bearbeiter: "", vermerkVsNfD: false, ...kopf };
  const beschreibung = `${kopf.organisation ?? "ohne Organisation"}, ${kopf.logo ? "mit Logo" : "ohne Logo"}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="kp-kopfvorschau" viewBox={`0 0 ${breite} ${BLATT.randOben + BLATT.kopf + 2}`}
      role="img" aria-label={`Vorschau des Kopfs: ${beschreibung}`} style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopf.logo ? <defs><LogoDefs logo={kopf.logo} /></defs> : null}
      <BlattKopf rahmen={rahmen} breite={breite} />
    </svg>
  );
}
