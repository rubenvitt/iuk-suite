import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { linkBasisAus } from "../../_lib/ansicht";
import { linkZeilen } from "../../_lib/links";
import { requireAdmin } from "../../_lib/zugang";
import { LinksVerwaltung } from "../../_ui/LinksVerwaltung";

export const dynamic = "force-dynamic";

export default async function LinksSeite() {
  await requireAdmin("/links");
  return <LinksVerwaltung links={await linkZeilen(getDb(), linkBasisAus(await headers()))} />;
}

export const metadata = { title: "Zugangscodes" };
