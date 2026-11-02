import { redirect } from "next/navigation";

import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { laufendeRevision, laufendeVersion, modulversionen } from "@/core/version";
import { visibleSwitcherModules } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";

/**
 * Server Component: sie loest die Sitzung auf und reicht fertige Werte durch.
 * Kein `@ant-design/icons` und kein Compound-Zugriff auf antd — beides waere
 * HTTP 500 schon beim Import bzw. beim Rendern (Fallen 1 und 7 in
 * docs/design/README.md).
 *
 * Die Seite liegt im Portal und existiert genau EINMAL: das Sitzungs-Cookie
 * gilt ueber alle Modul-Hosts (`core/auth/cookies.ts`), eine Kopie je Modul
 * waere fuenf Kopien derselben Seite.
 */
export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fprofil");
  // Nur die Module, die diese Person auch auf der Startseite sieht (IDA-328).
  const versionen = modulversionen();
  const modulStaende = visibleSwitcherModules(session.user.groups ?? [])
    // `moduleUrl` wie im Launcher: ohne erreichbaren Host steht das Modul dort auch nicht.
    .filter((m) => moduleUrl(m.key) && versionen[m.key])
    .map((m) => ({ titel: m.title, version: versionen[m.key] }));

  return (
    <>
      <Seitenkopf
        titel="Profil"
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <ProfilAnsicht
        name={session.user.name ?? null}
        email={session.user.email ?? null}
        kennung={session.user.id ?? null}
        bild={session.user.image ?? null}
        gruppen={session.user.groups ?? []}
        fachgruppen={session.user.fachgruppen ?? []}
        angemeldetSeit={session.angemeldetSeit ?? null}
        // Zur Anfragezeit gelesen, nicht auf Modulebene: die Seite ist durch `auth()`
        // ohnehin dynamisch, und `core/version.ts` erklärt, warum ein eingefrorener
        // Bauzeit-Wert still `unbekannt` bliebe.
        version={laufendeVersion()}
        revision={laufendeRevision()}
        module={modulStaende}
      />
    </>
  );
}
