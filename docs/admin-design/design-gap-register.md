# Admin design — gap register (SF-109)

Design version 119. Status of SF-107's Admin gaps (G-A01–G-A23, in `simplefit-api`
`docs/architecture/sponsor-admin-design-gap-register.md`), then what remains.

## SF-107 gaps

| Gap                                       | Now      | Where                                                     |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| G-A01 Sign-in without Okta or VPN         | Designed | AD0 `handoff`, `key`                                      |
| G-A02 Enrol two keys                      | Designed | AD0 `enroll*`                                             |
| G-A03 Step-up                             | Designed | AD9 `step_up`, AD0 `reverify`                             |
| G-A04 Non-operator                        | Designed | AD0 `unavailable` = 404                                   |
| G-A05 Permission denied                   | Designed | `restricted` on every MVP board                           |
| G-A06 Expired                             | Designed | AD0 `expired`, `reverify`; ARW1 `expired`                 |
| G-A07 First run                           | Designed | ARW1                                                      |
| G-A08 Overview MVP                        | Designed | AD1                                                       |
| G-A09 Nav by permission                   | Designed | `AdminNav` `perms`                                        |
| G-A10 Sponsor queue states                | Designed | AS1                                                       |
| G-A11 Application detail                  | Designed | AS2                                                       |
| G-A12–14 Request changes, reject, approve | Designed | AS2 dialogs, AD9                                          |
| G-A15 Sponsor organization                | Designed | AS4. **No list board:** the queue layout of AS1 is reused |
| G-A16, 17 Gym verification                | Designed | AGV1                                                      |
| G-A18 Publication review                  | **Open** | SF-139 boards PO1–PO4 still not drawn                     |
| G-A19 Gym suspend                         | Designed | AD9 `suspend_gym`, AD12                                   |
| G-A20 Users reduced                       | Designed | AD7, AD8                                                  |
| G-A21 Audit detail                        | Designed | AD14 `detail`                                             |
| G-A22 Operators                           | Designed | AD20                                                      |
| G-A23 Health failures                     | Designed | AD17                                                      |

## Remaining

| Gap                                    | Priority                | Note                                                  |
| -------------------------------------- | ----------------------- | ----------------------------------------------------- |
| Gym publication review (G-A18)         | When SF-139 is approved | **Canvas space:** 2 files left                        |
| Sponsor organization list              | P2                      | Reuse table pattern                                   |
| Moderation, reports, appeals           | FUTURE                  | No domain. AD4, AD11 kept as reference, marked FUTURE |
| Billing read-only views                | Deferred                | AD13 shows four separate flows, unconnected           |
| Feature flags                          | FUTURE                  | Flags are code. No console editing; no secrets        |
| Platform settings                      | FUTURE                  | Markets, emails as code                               |
| Compact sidebar                        | Not approved            | —                                                     |
| Light theme                            | —                       | Design is dark only, as everywhere                    |
| Two-person approval                    | FUTURE                  | D-SA17                                                |
| Phone restriction of high-risk actions | Needs decision          | New proposal (responsive matrix)                      |
| Field border contrast                  | Needs token decision    | Raised in SF-108                                      |
| Hosted editor check                    | —                       | QA used the same runtime locally                      |

**Canvas capacity: 510 of 512 files.** Further Admin work should add states to existing boards, as this ticket did.
