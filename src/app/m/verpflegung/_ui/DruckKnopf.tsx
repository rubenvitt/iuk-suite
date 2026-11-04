"use client";

import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";

export function DruckKnopf() {
  return <Button type="primary" icon={<Icons8Ikone name="print" groesse={16} />} onClick={() => window.print()}>Drucken</Button>;
}
