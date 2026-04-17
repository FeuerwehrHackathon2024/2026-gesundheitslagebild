# BOOTSTRAP — MANV Dashboard

You are building a **MANV (Massenanfall von Verletzten) decision-support dashboard** for a demo. A map-centric leitstand UI that shows how a mass-casualty incident cascades through German hospital capacities in real time and recommends concrete actions to the operator.

## First actions (in order)

1. **Read `SPEC.md` completely before writing a single line of code.** It is the contract.
2. Verify environment: Node 20+, pnpm installed, git initialized, empty project folder.
3. Initialize Next.js 14 App Router + TypeScript + Tailwind project per SPEC §Stack.
4. Commit baseline, then start Phase 1.

## Phase gating rule (non-negotiable)

The SPEC defines **8 phases**. For each phase:

1. Implement exactly what the phase scopes — nothing from later phases.
2. Reach the phase's **validation gate** (a concrete runnable checkpoint).
3. Commit with message `phase-N: <short description>`.
4. Only then proceed to phase N+1.

Do not "prepare infrastructure" for future phases. Do not add abstraction that isn't used in the current phase. YAGNI is enforced.

## When something is ambiguous

Stop and ask Mark in the chat. Do **not** invent product decisions. Examples of ambiguity worth asking:
- Data format choice that locks future flexibility
- Any deviation from the Palantir Gotham aesthetic defined in SPEC §UI
- Any medical/domain assumption not covered in SPEC §PZC or §Disciplines

Not ambiguous (just decide):
- Internal file naming, helper function structure, component internals
- Test data values inside the specified ranges

## Anti-patterns to avoid

- **No server-side rendering of the simulation.** The sim runs client-side. App Router is used only for routing and static shell.
- **No backend**, no database, no API routes beyond what's needed to serve `hospitals.json`. This is a client-only demo.
- **No ML, no AI API calls.** Detection and recommendations are rule-based and fully deterministic. Explainability > sophistication.
- **No chart-kit overload.** Only `recharts` for timeseries. No D3 unless MapLibre needs it internally.
- **No premature optimization.** 200 hospitals × 1 tick/sec is trivial. Write clear code, profile only if something actually jitters.
- **No rounded-corner glossy UI.** This is a leitstand, not a SaaS dashboard. See SPEC §UI.

## Output expectation per phase

At each validation gate, produce:
1. A short status message: what works, what was skipped/deferred, what surprised you.
2. The exact command to run/verify the phase (e.g. `pnpm dev`, then: open X, click Y, observe Z).
3. Any deviation from SPEC with reasoning (small deviations are fine; large ones require asking Mark first).

## Tooling hygiene

- `pnpm` only. No npm/yarn mixing.
- Strict TypeScript. `any` requires a `// TODO` comment with reason.
- ESLint + Prettier, default Next.js config is fine.
- One commit per phase minimum. More granular commits welcome.

Now read `SPEC.md`.
