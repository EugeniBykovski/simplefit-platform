# Admin design — security interaction spec (SF-109)

Design version 119. Rests on SF-107's operator trust model (`simplefit-api`
`docs/architecture/platform-operator-trust.md`), which is **PROPOSED**. **The backend decides every request.** Screens
show what the API answers, never decide it.

## Entry (AD0)

| Situation                      | What the person sees                                                    | Why                               |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------- |
| Signed out                     | `handoff`: normal sign-in; says sign-in alone doesn't open anything     | One global account                |
| Not an operator                | `unavailable`: the site's 404                                           | Operator existence isn't revealed |
| Suspended or revoked operator  | `unavailable`: the same 404                                             | Same                              |
| Pending enrolment              | `enroll`, `enroll_second`, `enroll_done`                                | Two keys, own session             |
| Operator, no current key check | `key` → `waiting` → success, or `failed`                                | Phone passkeys refused            |
| Check expired                  | `reverify`                                                              | Returns to where they were        |
| Session ended                  | `expired`                                                               | —                                 |
| Lost keys                      | `recovery`: no self-service; another manager, or the reviewed procedure | No backdoor                       |
| Fewer permissions              | Normal shell, filtered nav, `restricted` on denied pages                | Names nothing denied              |

**No public "Sign up as Admin", no code entry, no admin role choice.** Completing first run or enrolment grants nothing:
the operator record and its permissions already exist.

## High-risk actions (AD9)

| Action                          | Permission                     | Step-up | Notes                                 |
| ------------------------------- | ------------------------------ | ------- | ------------------------------------- |
| Suspend an account              | `users.restrict`               | Yes     | Restriction domain needed (A9)        |
| Approve a gym                   | `gyms.verification.approve`    | Yes     | Independent reviewer; doesn't publish |
| Approve a sponsor application   | `sponsors.applications.decide` | Yes     | Not a contract or verification        |
| Revoke an operator              | `operators.manage`             | Yes     | Not the last manager                  |
| Grant a permission              | `operators.manage`             | Yes     | Never to self                         |
| Suspend a gym                   | `gyms.suspend`                 | Yes     | Domain needed                         |
| Change production configuration | None                           | —       | **Not offered**                       |

### Confirmation dialog

Every dialog shows the same elements:

1. A HIGH RISK chip and the permission it needs.
2. The title as a question naming the action.
3. The target, by name and id.
4. **What happens** in plain words, including what it doesn't do.
5. A mandatory reason code, plus an optional note or ticket.
6. Cancel, then Confirm. The destructive action is never focused first.

### Outcomes

| Phase        | Shows                                                  | Rule                                     |
| ------------ | ------------------------------------------------------ | ---------------------------------------- |
| `step_up`    | Inline key prompt                                      | Then submit                              |
| `submitting` | `aria-busy`, “Working…”                                | Button disabled                          |
| `success`    | Done, plus the audit event id                          | Only when the API confirms               |
| `conflict`   | Nothing changed; reload                                | Concurrent decision or stale revision    |
| `unknown`    | “We don’t know if this went through. Don’t retry yet.” | Check the audit log for the operation id |
| `failed`     | Nothing changed; try again                             | —                                        |
| `denied`     | No longer permitted                                    | Revoked mid-action                       |

## Privacy (AD7, AD8, AD12, AS4)

| Rule              | Detail                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Search            | Exact only, with a reason. No list of everyone                                                                    |
| Email             | Masked by default; revealing it needs `users.reveal_email`, a key check and a reason                              |
| Never shown       | Passwords, codes, tokens, provider data, training, notes, weight, health, messages. No permission exists for them |
| Gyms and sponsors | Counts of people, plus owner names. No member lists or contact details                                            |
| Documents         | One at a time, after a key check, via a 5-minute link; each open is recorded                                      |
| Your own access   | Every view of an account is listed on that account                                                                |

## Accessibility (WCAG 2.2 AA intent)

- **Structure:** semantic tables with captions and `scope`, breadcrumbs as `nav`, and the search as `role=search`
  with a label.
- **Tabs:** `role=tab` with `aria-selected`.
- **Dialogs:** `aria-modal`, labelled by their title.
- **Status:** always a word plus an icon. Health uses five words: healthy, degraded, unavailable, unknown, no
  telemetry.
- **Targets:** 40 px or more (44 for primary buttons).
- **Field borders:** `#7A8177` (4.65:1), as SF-108. The canonical border measures 1.76:1, and that decision is still open.
- **Focus:** a visible 2 px olive ring.
- **Motion:** none required. Reduced motion is honored.
