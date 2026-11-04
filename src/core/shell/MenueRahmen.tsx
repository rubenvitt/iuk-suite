import { Layout } from "antd";
// Direkter Named-Import aus dem tiefen Pfad, nicht `Layout.Content` — Compound-Zugriff auf antd
// ergibt in einer Server Component `undefined` und HTTP 500 (Falle 1).
import { Content } from "antd/es/layout/layout";

import { auth } from "@/core/auth";
import { bereichFuer, getModule } from "@/core/registry";
import { rueckmeldeweg } from "@/core/rueckmeldung/konfiguration";
import { BEREICHE_IN_REIHENFOLGE, launcherAuswahl, launcherEintraege } from "@/core/shell/launcherEintraege";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { SuiteLeiste } from "@/core/shell/Navigator";
import type { SuiteNavItem } from "@/core/shell/types";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { SPACE } from "@/core/theme/tokens";
import { modulVersion } from "@/core/version";
import m from "./menue.module.css";

/**
 * DER RAHMEN VON `FullShell` — EIN MENÜ STATT KOPFZEILE UND SEITENLEISTE (IDA-347, Etappe 2).
 *
 * Bis dahin trug `SuiteRahmen` auch `FullShell`: Kopfzeile mit App-Umschalter im Titel, darunter
 * die Seitenleiste der Modulnavigation, am Telefon ein Drawer. Zwei Navigationen, die um „wo bin
 * ich" und „wohin kann ich" konkurrierten. Jetzt ist es EIN Menü (`Navigator.tsx`): am Desktop
 * dauerhaft links, am Telefon als Blatt hinter einem Ort-Knopf. `MinimalShell` (`qr`, `uav`,
 * `beta`) bleibt bewusst bei `SuiteRahmen`.
 *
 * DIE DATEN ENTSTEHEN HIER, nicht im Client: `launcherEintraege()` liest über `moduleUrl()`
 * `process.env` und erreicht für die Dienste die Portal-Datenbank; `launcherAuswahl()` merkt den
 * Aufruf für „Zuletzt" (IDA-338). Beides NUR angemeldet — anonym gibt es keinen Umschalter, nichts
 * zu merken und nichts anzuheften (Begründung in `SuiteHeader`).
 *
 * DAS MENÜ HÄNGT IMMER DA, AUCH OHNE `nav`: der App-Wechsel, das Konto und das Theme wohnen darin.
 * Ein Modul ohne Navigation (`alpha`, `gamma`) bekommt nur die Seitenliste nicht.
 *
 * `druck` (DRK-406): am Bildschirm unverändert, im Druck fällt das Menü weg und die Polsterung am
 * Inhalt (`menue.module.css`, „Druck"). Die Druckflächen von lagerbuch, wartung und verpflegung
 * nehmen diesen Rahmen direkt und nicht `FullShell` — sonst bekämen sie den schwebenden
 * Rückmeldeknopf (Begründung in `lagerbuch/_ui/DruckRahmen.tsx`).
 *
 * KEIN antd-`Sider` mehr, und damit auch keine `hasSider`-Frage (Falle 12): die Spalten sind ein
 * eigenes Raster, antds `Layout` trägt nur noch den Inhalt und dessen Grundfarbe.
 */
export async function MenueRahmen({
  moduleKey,
  nav = [],
  druck = false,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  druck?: boolean;
  children: React.ReactNode;
}) {
  const session = await auth();
  const angemeldet = !!session?.user;
  const mod = getModule(moduleKey);
  const eintraege = angemeldet ? await launcherEintraege(session?.user?.groups ?? null) : [];
  const auswahl = angemeldet ? launcherAuswahl(session?.user?.id, moduleKey) : { angeheftet: [], zuletzt: [] };
  const portal = moduleUrl("portal");
  const version = modulVersion(moduleKey);

  return (
    <div className={druck ? `${m.rahmen} ${m.druckRahmen}` : m.rahmen}>
      <header data-testid="suite-header" className={m.kopf}>
        {/* 44px auch im Menü (Falle 4: `FullShell` 44, „auch Telefon und Seitenleiste"). */}
        <Arbeitsdichte>
          <SuiteLeiste
            daten={{
              modulKey: moduleKey,
              modulTitel: mod.title,
              modulIcon: mod.icon,
              modulBereich: bereichFuer(moduleKey),
              modulHref: moduleUrl(moduleKey),
              nav,
              eintraege,
              auswahl,
              bereiche: BEREICHE_IN_REIHENFOLGE,
              portalHref: angemeldet ? portal : null,
              suchHref: portal ? `${portal}/suche` : null,
              angemeldet,
              userName: session?.user?.name ?? null,
              userBild: session?.user?.image ?? null,
              profilHref: angemeldet ? portal : null,
              // Nur angemeldet: das Formular ist ein internes Board (DRK-453, IDA-214).
              rueckmeldeweg: angemeldet ? rueckmeldeweg() : null,
              modulStand: version ? `${mod.title} ${version}` : null,
            }}
          />
        </Arbeitsdichte>
      </header>
      {/* Die Höhe kommt aus dem Raster (`.rahmen`, `100dvh`): eine eigene `minHeight` hier machte die
          Seite am Telefon um die Höhe der Ort-Zeile zu hoch. */}
      <Layout className={m.flaeche}>
        <Content className={m.druckInhalt} style={{ padding: SPACE.lg }}>
          {children}
        </Content>
      </Layout>
    </div>
  );
}
