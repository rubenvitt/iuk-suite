"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
} from "antd";
import { SPACE } from "@/core/theme/tokens";
import {
  fahrzeugTemplateLoesen,
  fahrzeugTemplateSync,
  fahrzeugTemplateZuweisen,
  templateAusFahrzeug,
} from "../../../../_actions/templates";
import {
  ausDieserEinheit,
  dieseEinheit,
  einheitNomen,
  type Einheitenart,
} from "../../../../_lib/konstanten";
import { Ikone } from "../../../../_ui/ikonen";

const ZUWEISEN_FEHLER = "Vorlage konnte nicht verknüpft werden.";
const SYNC_FEHLER = "Vorlage konnte nicht erneut übertragen werden.";
const LOESEN_FEHLER = "Vorlagenverknüpfung konnte nicht gelöst werden.";

export type TemplateOption = { value: string; label: string };

export function templateFilter(eingabe: string, option?: TemplateOption): boolean {
  return (option?.label ?? "")
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

type NeueVorlageWerte = {
  name: string;
  verknuepfen: boolean;
};

/**
 * ⚠️ DIE VIER TEXTE DIESER FLAECHE HAENGEN AN DER ART (DRK-309, Reviewrunde 4).
 *
 * Hier steht „Vorlage aus diesem Fahrzeug erstellen" ueber einer Einheit, deren
 * Kopfzeile drei Abschnitte weiter oben einen Chip „Tasche" traegt — derselbe
 * Widerspruch in derselben Ansicht wie am Loeschknopf, und mit derselben Folge:
 * wer zwei sich widersprechende Angaben liest, glaubt keiner von beiden.
 *
 * ⚠️ DER MODALTITEL STAND SCHON AUF „aus dieser Einheit", DER KNOPF DANEBEN
 * NICHT — und genau diese Haelfte ist die schlechtere von beiden. Ein Knopf und
 * der Dialog, den er oeffnet, mit verschiedenen Woertern fuer dieselbe Sache
 * lesen sich wie zwei verschiedene Vorgaenge. Jetzt tragen beide denselben Satz
 * aus demselben Baustein.
 *
 * ⚠️ `templateAusFahrzeug` BLEIBT: der Name der Server Action ist kein
 * Anzeigetext, und eine Tasche ist dort dieselbe Zeile in `lagerorte` wie ein
 * Fahrzeug.
 */
export function TemplateVerknuepfung({
  fahrzeugId,
  aktuelleVorlage,
  vorlagen,
  hatPositionen,
  einheitenart,
}: {
  fahrzeugId: string;
  aktuelleVorlage: { id: string; name: string } | null;
  vorlagen: { id: string; name: string }[];
  hatPositionen: boolean;
  einheitenart: Einheitenart | null;
}) {
  const herkunft = ausDieserEinheit(einheitenart);
  const erstellenTitel = `Vorlage ${herkunft} erstellen`;
  const erstellenFehler = `Vorlage konnte nicht ${herkunft} erstellt werden.`;
  // Das Feld zeigt die verknuepfte Vorlage (DRK-310); eine abweichende Wahl ist
  // ein Entwurf gegen genau diese Verknuepfung. Kommt eine andere Verknuepfung
  // als Prop an — Verknuepfen, Loesen, „aus Fahrzeug erstellen" —, ist der
  // Entwurf hinfaellig. Kein `key` an der Insel: der bricht die
  // JSON-Sicherheitspruefung der Inselprops in page.test.tsx.
  const aktuelleId = aktuelleVorlage?.id ?? null;
  const [entwurf, setEntwurf] = useState<{ gegen: string | null; wert: string } | null>(null);
  const auswahl = entwurf?.gegen === aktuelleId ? entwurf.wert : aktuelleVorlage?.id;
  const [fehler, setFehler] = useState<string | null>(null);
  const [modalFehler, setModalFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [laeuft, startTransition] = useTransition();
  const laufendRef = useRef(false);
  const [form] = Form.useForm<NeueVorlageWerte>();

  // Die aktuelle Vorlage muss Option sein, sonst zeigt der Select ihre rohe
  // ID statt des Namens. Eine inaktive fehlt in `vorlagen` und kommt nach vorn.
  const optionen = useMemo<TemplateOption[]>(() => {
    const liste = vorlagen.map((vorlage) => ({ value: vorlage.id, label: vorlage.name }));
    if (aktuelleVorlage && !vorlagen.some((vorlage) => vorlage.id === aktuelleVorlage.id)) {
      liste.unshift({ value: aktuelleVorlage.id, label: aktuelleVorlage.name });
    }
    return liste;
  }, [aktuelleVorlage, vorlagen]);
  const auswahlGeaendert = auswahl !== undefined && auswahl !== aktuelleVorlage?.id;

  async function actionAusfuehren(
    aktion: () => Promise<{ ok: boolean }>,
    fehlerText: string,
    beiErfolg?: () => void,
  ): Promise<boolean> {
    if (laufendRef.current) return false;
    laufendRef.current = true;
    try {
      const ergebnis = await aktion();
      if (!ergebnis.ok) {
        setFehler(fehlerText);
        return false;
      }
      setFehler(null);
      // Nach jeder gelungenen Aktion gilt wieder der gespeicherte Stand. Der
      // `gegen`-Vergleich allein reicht nicht: ein Entwurf gegen „keine" kaeme
      // nach Verknuepfen und anschliessendem Loesen wieder zum Vorschein.
      setEntwurf(null);
      beiErfolg?.();
      return true;
    } catch {
      setFehler(fehlerText);
      return false;
    } finally {
      laufendRef.current = false;
    }
  }

  function starten(
    aktion: () => Promise<{ ok: boolean }>,
    fehlerText: string,
    beiErfolg?: () => void,
  ): void {
    if (laufendRef.current) return;
    startTransition(async () => {
      await actionAusfuehren(aktion, fehlerText, beiErfolg);
    });
  }

  function modalSchliessen(): void {
    if (laufendRef.current) return;
    setOffen(false);
    setModalFehler(null);
    form.resetFields();
  }

  function neueVorlageSpeichern(werte: NeueVorlageWerte): void {
    if (laufendRef.current) return;
    laufendRef.current = true;
    startTransition(async () => {
      try {
        const ergebnis = await templateAusFahrzeug({ fahrzeugId, ...werte });
        if (!ergebnis.ok) {
          const nameFehler = ergebnis.feldFehler?.name;
          if (nameFehler) {
            form.setFields([{ name: "name", errors: [nameFehler] }]);
            setModalFehler(null);
          } else {
            setModalFehler(erstellenFehler);
          }
          return;
        }
        setModalFehler(null);
        setFehler(null);
        setEntwurf(null);
        setOffen(false);
        form.resetFields();
      } catch {
        setModalFehler(erstellenFehler);
      } finally {
        laufendRef.current = false;
      }
    });
  }

  return (
    <div
      data-rolle="template-verknuepfung"
      // 10 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und hat keine
      // Geschwisterzeile in diesem Zuschnitt; bleibt Literal.
      style={{ display: "grid", gap: 10 }}
    >
      <div data-rolle="aktuelle-vorlage">
        Aktuelle Vorlage: <strong>{aktuelleVorlage?.name ?? "keine"}</strong>
      </div>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <Flex gap={SPACE.sm} wrap align="center">
        <Select<string, TemplateOption>
          showSearch
          filterOption={templateFilter}
          value={auswahl}
          onChange={(wert) => setEntwurf({ gegen: aktuelleId, wert })}
          options={optionen}
          aria-label="Vorlage"
          placeholder="Keine Vorlage verknüpft"
          style={{ minWidth: 240 }}
          disabled={laeuft}
        />
        <Button
          type="primary"
          icon={<Ikone name="verketten" groesse={16} />}
          disabled={!auswahlGeaendert || laeuft}
          loading={laeuft}
          onClick={() => starten(
            () => fahrzeugTemplateZuweisen({ fahrzeugId, templateId: auswahl! }),
            ZUWEISEN_FEHLER,
          )}
        >
          Verknüpfen
        </Button>
        <Button
          icon={<Ikone name="erneut" groesse={16} />}
          disabled={!aktuelleVorlage || laeuft}
          loading={laeuft}
          onClick={() => starten(
            () => fahrzeugTemplateSync({ fahrzeugId }),
            SYNC_FEHLER,
          )}
        >
          Erneut übertragen
        </Button>
        <Popconfirm
          title="Verknüpfung lösen?"
          description="Die Positionen bleiben als individuelle Bestückung erhalten."
          okText="Lösen"
          cancelText="Abbrechen"
          disabled={!aktuelleVorlage || laeuft}
          onConfirm={() => new Promise<void>((fertig) => {
            startTransition(async () => {
              await actionAusfuehren(
                () => fahrzeugTemplateLoesen({ fahrzeugId }),
                LOESEN_FEHLER,
              );
              fertig();
            });
          })}
        >
          <Button
            icon={<Ikone name="entketten" groesse={16} />}
            disabled={!aktuelleVorlage || laeuft}
          >
            Verknüpfung lösen
          </Button>
        </Popconfirm>
        <Button
          icon={<Ikone name="plus" groesse={16} />}
          disabled={!hatPositionen || laeuft}
          onClick={() => {
            setModalFehler(null);
            setOffen(true);
          }}
        >
          {erstellenTitel}
        </Button>
      </Flex>
      {!hatPositionen ? (
        <span data-rolle="keine-positionen">
          Dafür braucht {dieseEinheit(einheitenart)} mindestens eine aktive
          Soll-Position.
        </span>
      ) : null}

      <Modal
        open={offen}
        title={erstellenTitel}
        footer={null}
        destroyOnHidden
        onCancel={modalSchliessen}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
      >
        <Form<NeueVorlageWerte>
          form={form}
          layout="vertical"
          initialValues={{ verknuepfen: true }}
          disabled={laeuft}
          preserve={false}
          onFinish={neueVorlageSpeichern}
        >
          {modalFehler ? (
            <Alert
              type="warning"
              showIcon={false}
              title={modalFehler}
              style={{ marginBlockEnd: SPACE.md }}
            />
          ) : null}
          <Form.Item name="name" label="Name">
            <Input aria-label="Vorlagenname" />
          </Form.Item>
          <Form.Item
            name="verknuepfen"
            valuePropName="checked"
          >
            <Checkbox aria-label="Neue Vorlage verknüpfen">
              {einheitNomen(einheitenart)} mit der neuen Vorlage verknüpfen
            </Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={laeuft}>
            Vorlage erstellen
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
