import { redirect } from "next/navigation";

import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";
import { alleSitzungenAbmelden } from "@/app/m/portal/profil/actions";

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

  return (
    <>
      <Seitenkopf
        titel="Profil"
        beschreibung="Wer du für diese Suite bist — und wie du dich überall abmeldest."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <ProfilAnsicht
        name={session.user.name ?? null}
        email={session.user.email ?? null}
        kennung={session.user.id ?? null}
        gruppen={session.user.groups ?? []}
        fachgruppen={session.user.fachgruppen ?? []}
        angemeldetSeit={session.angemeldetSeit ?? null}
        abmelden={alleSitzungenAbmelden}
      />
    </>
  );
}
