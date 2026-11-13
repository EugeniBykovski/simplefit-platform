# SF-157 — Control Plane email and password sign-in: design discrepancy register

Design source: Claude Design `AdminSignIn` (AD0, board 19.1), canvas version `1794573984-270f`, read with the
Artifact tool (`project/AdminSignIn.dc.html`). AD0's `handoff` draws "Sign in to continue" with Google, Apple and
Email (code) only; no board draws a password, setting or resetting a password, or the password code email.
Backend: simplefit-api ADR 0012 and ADR 0028 amendments (SF-157, founder-approved; security reviewer sign-off
open, D-SF157-01).

Every deviation keeps the product truthful: signing in grants nothing, the copy never claims an assurance the
backend doesn't give, and nothing points at a page that doesn't exist. No token changes. Claude Design is unchanged.

| #   | Board / state             | Design                                                       | Built                                                                                                                                                          | Why                                                                                                     |
| --- | ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | AD0 `handoff`             | "Sign in to continue": Google, Apple, Email (code)           | `/admin/login`: email, password with show/hide, Sign in; "Forgot your password, or don't have one yet?"; "Or sign in another way" to the one SimpleFit sign-in | Password sign-in approved for the Control Plane only (D-SF157-02); the other methods stay one link away |
| 2   | AD0 (none)                | —                                                            | Sign-in states: invalid (one answer for address or password), missing fields, throttled (button disabled until retry-after), suspended, network                | Real backend outcomes with no artboard; AD0 card with the design system's notices                       |
| 3   | (none) AD0P               | —                                                            | `/admin/login/password`: email → code and new password (12–128, hint) → done, with the sign-in continuation kept                                               | No artboard (D-SF157-05); AD0 header and card, E17's code language                                      |
| 4   | AD0 `enroll`              | Gate before the Control Plane                                | Shown when the operator asks (notice "Register keys") or an action answers `enrollment_required`; "Back to the Control Plane" added                            | ADR 0028 amendment: reads at session assurance, keys for writes                                         |
| 5   | AD0 `key`, `reverify`     | Key check at entry; reverify when it lapses                  | Not shown at entry; the action dialogs ask for the key (as before, SF-111)                                                                                     | Same amendment; the cards stay for the ceremony states                                                  |
| 6   | Operator block (AdminNav) | "Key checked · n min left"                                   | That line while a key check runs; otherwise "Signed in · actions ask for your key"                                                                             | The block must not claim a key check that doesn't exist                                                 |
| 7   | AD0 `enroll` copy         | "You can't open the Control Plane until both are registered" | "Reading the Control Plane doesn't need them; every action does"                                                                                               | The old sentence is no longer true                                                                      |
| 8   | E-mail (none)             | —                                                            | Password code email (simplefit-api `PasswordResetCode`): E17's composition, code only, no link                                                                 | Not in the E01–E17 inventory; D-SF157-05                                                                |

Locales: all seven (`en`, `ru`, `pl`, `de`, `uk`, `es`, `fr`; `es-MX` inherits `es`). Design approval is needed for
rows 1–3 and 8.
