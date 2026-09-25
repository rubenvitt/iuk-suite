import type { AuditModule } from "./types";
/**
 * Explicit inventory. Adding a schema table requires a coverage decision here and a migration.
 * `unauditedColumns` lets an audited table's UPDATE trigger leave a reasoned set of touch-only
 * columns (e.g. a last-contact timestamp) out of its WHEN predicate; `catalog.test.ts` still checks
 * every other persisted column is covered, and that every named column actually exists.
 */
export type AuditTableDecision =
  | { mode: "audited" | "anonymous"; primaryKey: readonly string[]; unauditedColumns?: { columns: readonly string[]; reason: string } }
  | { mode: "excluded"; reason: string };
export const AUDIT_TABLES = {
  "portal": {
    "services": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "portal_einstellungen": {
      "mode": "audited",
      "primaryKey": [
        "schluessel"
      ]
    }
  },
  "qr": {
    "presets": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "feedback": {
    "evenings": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "groups": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "responses": {
      "mode": "anonymous",
      "primaryKey": [
        "id"
      ]
    },
    "surveys": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "user_groups": {
      "mode": "audited",
      "primaryKey": [
        "user_id",
        "group_id"
      ]
    },
    "known_users": {
      "mode": "excluded",
      "reason": "Anzeigenamen-Cache bei Seitenaufrufen; Rechte stehen in user_groups."
    }
  },
  "files": {
    "aufraeum_laeufe": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "download_logs": {
      "mode": "excluded",
      "reason": "Fachliches Download-Protokoll; bereitgestellte Downloads werden explizit protokolliert."
    },
    "inbox_files": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "share_files": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "shares": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "zugangslinks": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "lagerbuch": {
    "artikel": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "ausgeblendete_kategorien": {
      "mode": "excluded",
      "reason": "Persönliche Ansichtseinstellung der Artikelliste je Konto; keine Bestands- oder Stammdatenänderung."
    },
    "buchungen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "bz_geraete": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "bz_kontrollen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "chargen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "checks": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "fahrzeug_templates": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "geraete": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "inventur_positionen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "inventuren": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "lagerort_verfall": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "lagerorte": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "o2_flaschen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "o2_messungen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "soll_positionen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "template_positionen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "tokens": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "users": {
      "mode": "excluded",
      "reason": "SSO-Anzeigenamen-Cache; keine lokale Rechtequelle."
    }
  },
  "aufgaben": {
    "aufgaben": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "dateien": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "nachweise": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "personen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "routinen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "verlauf": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "radio": {
    "device_events": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "devices": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "loans": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "software_versions": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "users": {
      "mode": "excluded",
      "reason": "SSO-Anzeigenamen-Cache; keine lokale Rechtequelle."
    },
    "zugangscodes": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "uav": {
    "executions": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "participants": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "sessions": {
      "mode": "excluded",
      "reason": "Technische Sitzungen; An- und Abmeldung werden explizit protokolliert."
    },
    "task_status": {
      "mode": "audited",
      "primaryKey": [
        "participant_id",
        "task_id"
      ]
    },
    "tasks": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "einsatzbuch": {
    "fahrzeug": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "person": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "stichwort": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "einstellung": {
      "mode": "audited",
      "primaryKey": [
        "schluessel"
      ]
    },
    "schluesselpaar": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "stammdatenstand": {
      "mode": "excluded",
      "reason": "Technischer Versionszähler (ETag); jede Änderung, die ihn erhöht, steht bereits als Audit-Zeile der Stammdatentabelle im Log."
    },
    "rechner": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ],
      "unauditedColumns": {
        "columns": [
          "letzter_kontakt",
          "letzte_sicherung"
        ],
        "reason": "Technische Kontaktzeiten des Geräts, keine fachliche Änderung am Rechner."
      }
    },
    "anker": {
      "mode": "excluded",
      "reason": "Hash-Meldungen des Rechners, keine Inhalte; Abweichungen stehen auditiert in anker_abweichung."
    },
    "anker_abweichung": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "einmalcode": {
      "mode": "excluded",
      "reason": "Kurzlebige Einmalcodes der Anmeldung; die Anmeldung selbst ist als Sitzung nachvollziehbar, die Freigabe auditiert."
    },
    "sitzung": {
      "mode": "excluded",
      "reason": "Technische Sitzungen des Rechners (30 min); jede Schlüsselfreigabe steht auditiert in freigabe."
    },
    "freigabe": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
  },
  "konto": {
    "sitzung_widerruf": {
      "mode": "audited",
      "primaryKey": [
        "sub"
      ]
    }
  }
} as const satisfies Record<AuditModule, Record<string, AuditTableDecision>>;
export const AUDIT_SOURCES = Object.keys(AUDIT_TABLES) as AuditModule[];
export function auditMigrationsFolder(module: AuditModule): string {
  return module === "konto" ? "src/core/konto/_db/migrations" : `src/app/m/${module}/_db/migrations`;
}
