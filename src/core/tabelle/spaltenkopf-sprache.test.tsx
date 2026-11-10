import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { AntdProvider } from "../theme/AntdProvider";
import { Datentabelle } from "./Datentabelle";

/**
 * WAS EIN VORLESEPROGRAMM AN EINEM SORTIERBAREN SPALTENKOPF HÖRT (IDA-399).
 *
 * antd hängt an jeden sortierbaren Kopf `aria-description` und nimmt den Text aus
 * `global.sortable` der Sprachdatei. Ohne `ConfigProvider` mit `de_DE` steht dort
 * „sortable“ — so in jedem Test, der antd ohne Sprachdatei rendert, und dort fiel es
 * auf. In der Suite reicht `AntdProvider` die Sprachdatei an jede Tabelle durch;
 * dieser Test hält das über den echten Provider fest, damit ein antd-Upgrade, das den
 * Schlüssel umbenennt oder verliert, nicht still auf Englisch zurückfällt.
 *
 * Gerendert wird serverseitig: das ist das HTML, das zuerst ankommt.
 */

type Zeile = { id: string; name: string };

function kopfbeschreibungen(): (string | null)[] {
  const html = renderToString(
    <AntdProvider initialMode="light" initialPreference="light">
      <Datentabelle<Zeile>
        rowKey="id"
        aria-label="Probe"
        columns={[
          { title: "Name", dataIndex: "name", key: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
          { title: "Ohne Sortierung", dataIndex: "id", key: "id" },
        ]}
        dataSource={[
          { id: "1", name: "Anton" },
          { id: "2", name: "Berta" },
        ]}
      />
    </AntdProvider>,
  );
  const koepfe = html.match(/<th\b[^>]*>/g) ?? [];
  return koepfe.map((th) => th.match(/aria-description="([^"]*)"/)?.[1] ?? null);
}

describe("sortierbarer Spaltenkopf", () => {
  it("beschreibt sich auf Deutsch", () => {
    expect(kopfbeschreibungen()).toEqual(["sortierbar", null]);
  });
});
