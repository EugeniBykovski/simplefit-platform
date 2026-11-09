# Admin design — implementation handoff (SF-109)

**Design:** [canvas](https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY), version 119, `1794214317-c2e0` (from version
117, `1794042043-ae83`). **Status: designed, not approved, not built.** ADR 0027 and D-SA01–D-SA30 remain PROPOSED.

| Document                                             | Content                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [Artboard inventory](artboard-inventory.md)          | All 51 Admin boards                                        |
| [Screen states](screen-state-matrix.md)              | Every state, and what each never shows                     |
| [Responsive](responsive-matrix.md)                   | Widths, phone restrictions, QA                             |
| [First run](first-run-flow.md)                       | Tour steps, skip, resume, fewer permissions                |
| [Security interaction](security-interaction-spec.md) | Entry, step-up, high-risk outcomes, privacy, accessibility |
| [Route and flow](admin-route-flow.md)                | Registry today, proposed, guard order                      |
| [Gap register](design-gap-register.md)               | SF-107 gaps closed and open                                |

## What changed on the canvas

| Change                                                    | Boards                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| New (3)                                                   | AGV1 `AdminGymReview`, `AdminStatesSheet` (130 states), `AdminResponsive` (77 frames) |
| Rebuilt in place, old drawing kept at `state=future` (15) | AD0, AD1, AD2, AD7, AD8, AD9, AD12, AD13, AD14, AD17, AD20, AS1, AS2, AS4, ARW1       |
| `AdminNav`                                                | Old default kept; `mode=mvp` added                                                    |
| `FlowAdmin`                                               | Replaced; the old version is in history                                               |
| Marked FUTURE in the title (30)                           | Content unchanged                                                                     |

## Readiness

**Design: ready for MVP modules.** **Build: blocked.**

| Track                         | Blocked on                                                       |
| ----------------------------- | ---------------------------------------------------------------- |
| Admin backend (SF-107 A1–A11) | SF-110 (operator domain, WebAuthn, ceremony), then the admin API |
| Gym verification UI           | SF-110 enabling a real authority in a reviewed change (SF-136)   |
| Sponsor review UI             | Sponsor domain (S1, S2) and S6                                   |
| Restriction and suspension    | Domain A9 and counsel                                            |

Implement through tokens, primitives, Lucide and i18n. Never copy markup or hex values from boards (CLAUDE.md rule 19).
Bracketed values are API fields. **No figure on these boards is real.**

## Decisions affecting the design

| Decision | Design assumes                                                        |
| -------- | --------------------------------------------------------------------- |
| D-SA13   | Bootstrap ceremony, so the first operator exists before first sign-in |
| D-SA14   | A second operator for conflicts                                       |
| D-SA15   | WebAuthn hardware keys, two each                                      |
| D-SA16   | Per-action permissions                                                |
| D-SA17   | No two-person approval                                                |
| D-SA18   | Audit retention undecided; no claims on screen                        |
| D-SA20   | Exact search, masked email                                            |
| D-SA25   | First run never gates                                                 |
| D-SA28   | DB access controls are out of scope for screens                       |
| D-SA29   | Suspension only                                                       |
| New      | High-risk actions hidden below 640 px                                 |
| New      | Field border contrast                                                 |

## QA evidence (Chromium, canvas runtime `dc-runtime.js`, 2026-11-09)

| Check                                                                                                                | Result                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16 interactive boards × 10 widths                                                                                    | No overflow, small targets, unlabelled fields, holes or errors                                                                                                                                                          |
| Sheets                                                                                                               | 130 + 77 frames, no frame overflow                                                                                                                                                                                      |
| Click-through: full tour at 1440 and 390, Back, Skip, restart; reviewer tour (5 steps) and nav (4 items); users tabs | Pass                                                                                                                                                                                                                    |
| Dead links and imports                                                                                               | None                                                                                                                                                                                                                    |
| 15 preserved `future` drawings, FUTURE boards, route gallery, Sponsor boards                                         | Render                                                                                                                                                                                                                  |
| Publication                                                                                                          | Version 119 read back. Index, 4 new or rebuilt boards and 2 unrelated boards match local hashes; 13 sampled sizes match. Version 118, created during the work, was a type-publisher release that changed no canvas file |

Not tested: the hosted editor, assistive technology, and production behavior, which doesn't exist.
