# Admin design — first run (SF-109)

Board ARW1, `FirstRunAdmin`, design version 119. **Presentation only:** it never gates access and never grants it
(D-SA25, proposed). The earlier 2/5 checklist (runbooks, shadowing, Support L2) is kept at `state=future`; none of
that exists.

## Content

The first visit shows two cards. **Your access** lists each section as Granted or Not granted, from `/admin/me`.
**How sensitive actions work** explains reason, key check, confirmation and audit.

## Tour

Seven steps for full permissions. Steps whose targets are missing are skipped, so an operator never sees a step
pointing at a page they can't open.

| #   | Step                       | Target                                 | Covers                                 |
| --- | -------------------------- | -------------------------------------- | -------------------------------------- |
| 1   | What this is               | Your access card                       | What it manages; what you can access   |
| 2   | Reviews                    | Gym verification, Sponsor applications | Where pending reviews appear           |
| 3   | Accounts and organizations | Users, Gyms, Sponsor organizations     | Inspecting users and organizations     |
| 4   | Audit log                  | Audit                                  | How audit works                        |
| 5   | Sensitive actions          | Sensitive actions card                 | How actions are confirmed              |
| 6   | System health              | Health                                 | Where health is                        |
| 7   | Your security and leaving  | Operator block                         | Managing your security; leaving safely |

**Fewer permissions** (`perms=reviewer`): steps 1, 2, 3 (Users only), 5 and 7 — five steps. Verified by
click-through.

| State           | Behavior                                                       |
| --------------- | -------------------------------------------------------------- |
| Initial         | `ready`: cards, Take the tour, Skip                            |
| In progress     | `tour`, step 1–7                                               |
| Next, Back      | Click-through passes at 1440 and 390                           |
| Skip            | “Skip tour” records `dismissed` (ADR 0018)                     |
| Resume          | A reload mid-tour restarts at step 1 until an outcome exists   |
| Completed       | `done`, records `completed`; “Go to overview”                  |
| Missing target  | Step skipped                                                   |
| Restricted      | `restricted` with `perms=reviewer`                             |
| Network error   | `error`: retry; nothing granted or changed                     |
| Session expired | `expired`: dialog to use the key again, then restart at step 1 |

**Positions** are measured on the rendered board at 1440. Below 1024 the card docks at the bottom with no ring.
