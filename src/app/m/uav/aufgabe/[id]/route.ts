/**
 * Alt-Bookmark der `uav-praxis`-SPA (`/aufgabe/:id`, TanStack-Router-Route) →
 * 308 auf die neue, cachebare Shell `/aufgabe?id=<id>` (äußere Pfadform).
 *
 * Bewusst `new Response` statt `NextResponse.redirect()`: Letzteres verlangt
 * eine absolute URL: die Suite hängt Route-Handler mehrerer Module unter
 * verschiedenen Hosts auf, ein relativer Redirect ist hier genau richtig und
 * hostunabhängig.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return new Response(null, {
    status: 308,
    headers: { location: `/aufgabe?id=${encodeURIComponent(id)}` },
  });
}
