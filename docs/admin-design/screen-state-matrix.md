# Admin design — screen state matrix (SF-109)

Design version 119, `1794214317-c2e0`. Every state is a `state`, `phase`, `dialog`, `tab`, `step` or `perms` value on
the board, and all 130 are on `AdminStatesSheet`. **Names are design states, not an API contract.** Permissions are
the SF-107 proposal (ADR 0027, unapproved).

| State                              | Meaning                               | Never                        |
| ---------------------------------- | ------------------------------------- | ---------------------------- |
| `loading`                          | Skeleton, `role=status`, labelled     | A spinner over stale data    |
| `error`                            | Couldn’t load; nothing changed; retry | Shown for an empty result    |
| `empty`, `no_match`, `queue_empty` | Valid answer with no rows             | Styled as an error           |
| `restricted`                       | Permission missing; names no resource | Details of the thing denied  |
| `partial`                          | Some sources failed, shown as “—”     | Zero for a failed number     |
| `provider`, `unknown`              | Health input unavailable              | Shown as healthy             |
| `conflict`                         | Operator is a party; decision refused | Any override                 |
| `stale`                            | Revision changed; reload              | Deciding on the old revision |
| `unknown` (AD9)                    | Outcome not known                     | Success, or a blind retry    |

## Coverage

| Module               | Board     | States                                                                                                                                   |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and security   | AD0       | handoff, checking, key, waiting, failed, enroll, enroll_second, enroll_done, reverify, expired, recovery, unavailable                    |
| First run            | ARW1      | ready, tour 1–7, done, restricted (5 steps), error, expired                                                                              |
| Overview             | AD1       | ready, partial, empty, provider, restricted, loading, error                                                                              |
| Users                | AD7       | idle, results, no_match, loading, error, restricted; tabs all, fighters, coaches                                                         |
| Account              | AD8       | ready, suspended, not_found, loading, error, restricted; reveal dialog                                                                   |
| High-risk            | AD9       | 7 actions; phases confirm, step_up, submitting, success, conflict, unknown, failed, denied                                               |
| Gyms                 | AD2, AD12 | ready, empty or suspended, loading, error, restricted                                                                                    |
| Gym verification     | AGV1      | queue, queue_empty, detail, conflict, stale, approved, unavailable, loading, error, restricted; dialogs approve, changes, reject, revoke |
| Sponsor applications | AS1       | ready, empty, loading, error, restricted                                                                                                 |
| Application review   | AS2       | unclaimed, mine, other, conflict, stale, approved, loading, error, restricted; dialogs approve, changes, reject                          |
| Sponsor organization | AS4       | active, suspended, closed, loading, error, restricted                                                                                    |
| Audit                | AD14      | ready, detail, empty, loading, error, restricted                                                                                         |
| Health               | AD17      | ready, unknown, loading, error, restricted                                                                                               |
| Operators            | AD20      | ready, detail, self, loading, error, restricted; add dialog                                                                              |
| Billing              | AD13      | deferred                                                                                                                                 |

**Session expired** and **operator revoked** have no in-page state, on purpose. The next request leads to AD0
`expired`, or to the ordinary 404 (AD0 `unavailable`). Showing a revoked operator a special page would reveal that they
had been an operator.

## Separate facts, never one badge

| Shown together on | Facts kept apart                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| AS2, AS4          | Application status · Organization status · Verification (not offered) · Commercial (none) |
| AD12              | Lifecycle · Business verification · Publication (not available)                           |
| AD13              | Gym SaaS subscriptions · Member subscriptions · Sponsor agreements · Platform revenue     |
