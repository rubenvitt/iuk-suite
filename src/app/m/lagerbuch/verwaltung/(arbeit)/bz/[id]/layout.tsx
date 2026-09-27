import { notFound } from "next/navigation";
import { getDb } from "../../../../_db/client";
import { detailVorhanden } from "../../../../_lib/lesepfade/vorhanden";

/**
 * DRK-480 — der 404 VOR der Ladegrenze dieses Segments. Unter der
 * `loading.tsx` kaeme das `notFound()` der Seite als HTTP 200 an (Falle 23,
 * `CLAUDE.md`); ein Layout rendert oberhalb der Grenze. Warum genau diese
 * Pruefung und nur sie: `_lib/lesepfade/vorhanden.ts`. Der Zugriff selbst
 * liegt schon im `(arbeit)`-Layout; hier haengt am 404 nur „gibt es nicht".
 */
export default async function BzVorhanden({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!detailVorhanden(getDb(), "bz", id)) notFound();
  return children;
}
