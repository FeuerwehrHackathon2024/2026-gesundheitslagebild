# BOOTSTRAP — Phasen-Gating, Anti-Patterns, Autonomie-Regeln

## 1. Autonomie-Regeln

1. **Arbeite eigenständig.** Der Nutzer wird dich nicht regelmäßig beauftragen. Beginne direkt nach dem Durchlesen der Spec-Dokumente.
2. **Triff Annahmen mit Augenmaß.** Wenn eine Spec-Aussage offen ist, wähle den pragmatischsten Wert, der zum Gesamt-Vertrag passt. Dokumentiere jede Annahme als `// ASSUMPTION:`-Kommentar *und* als Eintrag in `doc/DECISIONS.md`.
3. **Lehne Rollback auf einfache Lösungen ab, bevor du sie gründlich versucht hast.** Wenn OSRM zickt, cache mehr und härte den Fallback; ersetze es nicht sofort durch Haversine-only.
4. **Wenn du dreimal am gleichen Problem scheiterst**, pausiere am betreffenden Punkt, dokumentiere den Stand in `STATUS.md` und nimm einen Alternativweg. Erst der User darf entscheiden "zurück zu Plan A".
5. **Keine Feature-Erweiterungen** außerhalb der Spec. YAGNI.
6. **Nach jeder Phase**: Build grün, Lint grün, Typecheck grün, Tests grün → commit mit `feat(phase-N): ...`. Dann nächste Phase.
7. **Git-Hygiene**: Keine `--no-verify`-Commits. Keine destruktiven Operationen ohne dass ein Commit vorher gesichert ist.

## 2. Phasen-Gates (verpflichtend)

Jede Phase endet mit einem **Gate**. Die Gates sind im `doc/PHASES.md` pro Phase beschrieben. Gate-Prüfung besteht aus:

| Prüfung | Befehl / Aktion |
|---|---|
| Build | `pnpm build` — exit 0 |
| Typecheck | `pnpm typecheck` — 0 Fehler |
| Lint | `pnpm lint` — 0 Fehler |
| Unit-Tests | `pnpm test` — alle grün |
| Manueller UI-Check | Phase-spezifisch in `PHASES.md` beschrieben |

**Erst wenn alle Prüfungen grün**: Commit, dann nächste Phase.

Wenn ein Test/Build rot ist → fixen bis grün, dann committen.

## 3. Anti-Patterns — was du nicht tust

| Anti-Pattern | Stattdessen |
|---|---|
| Abhängigkeiten hinzufügen ohne Grund | Nur Stack-Pakete aus `SPEC §2` installieren, nichts darüber hinaus ohne schriftliche Notwendigkeit |
| Dark-Mode oder Gotham-Stil | Ausschließlich Liquid-Glass-Tokens aus `DESIGN.md` |
| PZC-Konzepte wiederbeleben | Strikt 4 Ressourcen-Typen + 4 Triage-Stufen (`DATA_MODEL.md`) |
| Radiuskreise um MANV-Marker | Marker-Größe ~ √casualties, Zahl im Marker; kein Kreis |
| Arztpraxen als Datenquelle / Maßnahme | Explizit raus. Nicht einbauen. |
| Große refactors mitten in einer Phase | Sauber in eigene Phase ziehen oder nach allen Phasen als `refactor`-Commit |
| `any`-Types ohne TODO-Kommentar | Begründet und dokumentiert oder sauber typisieren |
| UI-Strings auf Englisch | Alle Operator-sichtbaren Strings auf Deutsch |
| Maßnahmen ohne Audit-Log-Eintrag | Jede `executable`-Maßnahme schreibt vor Ausführung ein Event |
| Routing ohne Cache | Jede OSRM-Anfrage erst Cache-Lookup, dann Netz |
| Fork-Preview-Berechnung im Main-Thread ohne Debounce | Debounce ≥ 120 ms, Cancellation bei neuem Hover |

## 4. Commit-Konventionen

```
feat(phase-N): Kurzer deutscher Satz
fix(scope):    Kurzer deutscher Satz
chore(scope):  Kurzer deutscher Satz
test(scope):   Kurzer deutscher Satz
docs(scope):   Kurzer deutscher Satz
refactor(scope): Kurzer deutscher Satz
```

Body optional, aber bei nicht-trivialen Änderungen empfohlen (Begründung, nicht Beschreibung).

## 5. Verzeichnis-Struktur (Soll)

```
Rettungsleitstelle/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── map/
│   │   ├── MapContainer.tsx
│   │   ├── HospitalLayer.tsx
│   │   ├── IncidentLayer.tsx
│   │   ├── PlannedIntakeLayer.tsx
│   │   ├── RouteLayer.tsx
│   │   └── mapStyle.ts
│   ├── panels/
│   │   ├── Header.tsx
│   │   ├── LeftPanel.tsx
│   │   ├── RightPanel.tsx
│   │   ├── AlertList.tsx
│   │   ├── RecommendationList.tsx
│   │   ├── HospitalDetailPanel.tsx
│   │   ├── IncidentLauncher.tsx
│   │   ├── PlannedIntakeForm.tsx
│   │   ├── AuditLogPanel.tsx
│   │   └── TimelineStrip.tsx
│   ├── charts/
│   │   ├── TimelineChart.tsx
│   │   ├── HospitalSparkline.tsx
│   │   └── ForkPreviewOverlay.tsx
│   └── ui/                       (shadcn-Komponenten)
├── lib/
│   ├── simulation/
│   │   ├── engine.ts
│   │   ├── allocation.ts
│   │   ├── relocation.ts
│   │   ├── router.ts
│   │   ├── detection.ts
│   │   ├── recommendations.ts
│   │   ├── fork-preview.ts
│   │   └── scenarios.ts
│   ├── routing/
│   │   ├── osrm-client.ts
│   │   ├── route-cache.ts
│   │   └── route-types.ts
│   ├── audit/
│   │   ├── event-log.ts
│   │   └── event-types.ts
│   ├── data/
│   │   ├── hospitals.json       (generiert)
│   │   ├── hospitalsLoader.ts
│   │   └── resources.ts
│   ├── geo.ts
│   ├── types.ts
│   └── store.ts
├── scripts/
│   └── gen-hospitals.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── doc/                         (diese Markdowns + Excel)
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── components.json              (shadcn config)
├── .eslintrc.json
├── .gitignore
├── .env.example
├── CLAUDE.md
├── STATUS.md                    (lebendig, jede Phase aktualisiert)
└── README.md
```

## 6. STATUS.md — laufendes Sitzungs-Log

Nach jeder Phase aktualisieren — eine Tabelle oben ("Aktuelle Phase: N") + Changelog-Sektion mit Stichpunkten. Falls der Nutzer eine Session unterbricht, findet er hier den aktuellen Stand.

## 7. DECISIONS.md — Annahmen-Log

Jede getroffene Annahme wird in einer Tabelle protokolliert:

```
| Datum (Sim) | Bereich       | Annahme                              | Begründung                         |
|-------------|---------------|--------------------------------------|------------------------------------|
| 2026-04-18  | relocation    | 15 % Puffer über Intake.total        | Standard-Reserve, wie in SPEC §15  |
```

## 8. Wenn du fertig bist

1. `pnpm build` + `pnpm test` + `pnpm test:e2e` alle grün.
2. STATUS.md zusammenfassen: "Phase 10 abgeschlossen, Demo-Showcase endet sauber".
3. README.md mit Start-Anleitung schreiben.
4. Letzter Commit: `chore: release-candidate`.

Das System ist dann übergabereif.
