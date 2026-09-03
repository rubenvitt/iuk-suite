import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { merkliste } from "../../_db/schema";
import { KATALOG_STAND } from "../../_lib/katalog";
import { KatalogInsel } from "../../_ui/KatalogInsel";

/*
 * ⛔ `<Suspense>` UM DIE INSEL, weil sie `useSearchParams()` liest. Ohne die
 * Grenze verlangt Next die Grenze selbst — Vorbild `uav/(teilnehmer)/page.tsx`.
 * Ein Ersatzinhalt ist nicht noetig: die Seite ist ohnehin dynamisch (sie ruft
 * `auth()`), und die Insel rendert per SSR vollstaendig durch.
 *
 * ⛔ DER `sub` KOMMT AUS `auth()`, NIE AUS EINEM PARAMETER. `session.user.id` IST
 * der Pocket-ID-`sub`, aber der Typ luegt (@auth/core baut `user` ohne `id`) —
 * deshalb die ausdrueckliche Pruefung. Auf einer SEITE ist `notFound()` der
 * richtige Ausgang, nicht ein Wurf.
 *
 * KEIN `Typography.Title`: `Seitenkopf` rendert ein nacktes <h1> (Falle 1).
 */
export default async function KatalogSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const gemerkt = getDb()
    .select({ zeichenId: merkliste.zeichenId })
    .from(merkliste)
    .where(eq(merkliste.sub, sub))
    .all()
    .map((z) => z.zeichenId);

  return (
    <>
      <Seitenkopf
        titel="Katalog"
        beschreibung={`${KATALOG_STAND.anzahl} Zeichen, Stand ${KATALOG_STAND.erzeugtAm}.`}
      />
      <Suspense>
        <KatalogInsel gemerkt={gemerkt} />
      </Suspense>
    </>
  );
}
