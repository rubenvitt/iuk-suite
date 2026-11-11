import { VorhabenAufruf } from "../../../_ui/planung/VorhabenAufruf";

export const dynamic = "force-dynamic";

/** Die alte Adresse eines Events oder Projekts (bis IDA-398): leitet auf `/events/<id>` bzw. `/projekte/<id>` weiter. */
export default async function GemeinschaftVorhabenAlt({ params }: { params: Promise<{ id: string }> }) {
  return <VorhabenAufruf art={null} id={(await params).id} />;
}

export const metadata = { title: "Event oder Projekt" };
