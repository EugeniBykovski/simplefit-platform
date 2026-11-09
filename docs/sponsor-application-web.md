# Sponsor application on the web (SF-115)

**Route:** `web.partners.apply` (`/partners/apply`), unchanged in the registry. Without `?step=` it is SPX2,
server-rendered and public. With `?step=` it is the application, which runs in the browser on the viewer's session
and the SF-113 / SF-114 API (`simplefit-api` ADR 0031, ADR 0032).

**Design:** Claude Design canvas `1794214317-c2e0` (the SF-108 boards, also cited by ADR 0031):

| Board                        | Artboard                            | Step            |
| ---------------------------- | ----------------------------------- | --------------- |
| SPX1                         | `PartnersLanding`                   | `/partners`     |
| SPX2                         | `BecomeSponsor`                     | no `step`       |
| SPA0                         | `SponsorEntry`                      | `start`         |
| SPA1 / SP1–SP7, review       | `SponsorApply`, `SponsorApplySheet` | the eight steps |
| SP9                          | `SponsorSubmitted`                  | `submitted`     |
| SPX5, applicant states (MVP) | `SponsorApp`, `SponsorStatusSheet`  | `status`        |

## How it decides

- **Session:** signed out shows SPA0 with Google, Apple and "Continue with Email". Email goes to `web.login` with
  `returnTo` set to the current step, so the visitor comes back to it. An ended session shows SPA0 `expired`.
- **Account:** if the entry resolver answers `account_registration`, SPA0 links to WA5 with the same `returnTo`.
  Option A of D-SA01, as SF-113 built it: an account comes before the first draft. Nothing is held in browser
  storage.
- **Application:** this is the backend's `GET /me/sponsor-application`, and the URL is corrected to match it:
  - No application: SPA0 `ready`, then the form.
  - A draft, or answers to correct: the form.
  - Anything else: SPX5.
  - SP9 shows only after a submission this page saw confirmed.
- **Entry destinations:** `sponsor_application_draft` and `sponsor_application_status` (SF-113) now map to this
  route, as `sponsor_application` already did. Before SF-115 they were unmapped, which made the entry fail.
- **Sign-in from SPX2:** "Already applied? Sign in" goes to `web.login` with `returnTo` set to the status. It does
  not go to SPX3, which is still a placeholder.

## Writes

- **Saving:** each step saves only the answers it changed. The first save carries one `client_request_id`, which a
  retry repeats. Every later save carries `expected_revision`.
  - **Stale revision (`409 revision_conflict`):** the page re-reads the application and keeps the visitor's
    unsaved text. Saving again applies it on the new revision.
  - **Save and continue:** stops on the answers of the step that the backend reports in `missing_fields`.
    Requiredness is never re-derived in React.
  - **Client checks:** formats only (OpenAPI lengths and patterns).
- **Submitting:**
  - Unsaved answers are saved first.
  - There is one `client_request_id` per attempt. A retry repeats it, and the key is renewed only after `reused`.
  - The declaration's version and language come from the backend. Its checkbox text comes from the legal registry
    (`getLegalDocumentVersion`), and it is unticked by default.
  - When the answer is lost or the status has moved on, the page re-reads the application. It shows SP9 only if
    there is a new submission, and never submits again.
- **Uploads (SP7, and the logo on SP1):**
  - The flow is: initiate, `PUT` to the presigned URL, then `confirm`.
  - Only the backend's confirmation shows "Uploaded".
  - The presigned operation stays in component memory for one upload. It is never cached, stored, logged or put
    in a URL.
  - An expired operation is replaced by removing the pending document and starting again.
  - When `uploads.available` is false (production, D-SA09), the designed BLOCKED step shows instead.
- **After a change request:** only the requested answers are enabled, the reviewer's message is shown, and the
  submit button reads "Send back to SimpleFit".

## Differences from the boards (documented, not redesigned)

| Board                | Difference                                                                                                                    | Why                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| SPA1 header          | Site header (`web.site` shell) above a slim "Sponsor application" band instead of the board's own header with "Save and exit" | The registry gives this route the site shell; "Back" and the rail save before leaving      |
| SPA0 `ready`         | "You're signed in", without the account's address                                                                             | `GET /api/me` returns no address                                                           |
| SPA0 `resume`, SPX5  | No "Discard draft" and no "Withdraw application"                                                                              | Not exposed by the API (ADR 0031: T2, T9)                                                  |
| SPX5 `rejected`      | No reason and no "Start a new application"                                                                                    | No reason field; reapplication is blocked (D-SA03)                                         |
| SPX5 history         | Submissions and the change request only                                                                                       | The API exposes no review-start time or reviewer                                           |
| SP9                  | No reference, and no "We'll email you" or "We emailed a confirmation"                                                         | No reference exists; sponsor emails are off in production (S7)                             |
| SP4                  | Country and city pickers (combobox and free text) instead of preset chips                                                     | The policy accepts any ISO country and any city name                                       |
| SP1 logo             | Shown only when uploads are available                                                                                         | It can't work otherwise (D-SA09)                                                           |
| Marketing consent    | None in the application                                                                                                       | ADR 0032 rule 7: it is the account's own `product_news`, never asked for by an application |
| Contact verification | Not shown                                                                                                                     | SF-114 built the API, but no board draws it                                                |
| SPX1 examples        | "Your brand" in place of the board's `[BRAND]` placeholder                                                                    | A public page shouldn't print a bracketed placeholder                                      |
| Duplicate state      | A submission found on reload opens SPX5 instead of SPA1's `duplicate` notice                                                  | The backend has closed the form; the status is the truthful screen                         |

## Tests

- **Unit and component (Vitest):**
  - `features/sponsor-application-form/model/model.test.ts` covers the model.
  - `widgets/sponsor-application/ui/sponsor-application.test.tsx` covers the flow with the network mocked at
    `fetch`.
- **Stories:** `src/stories/screens/sponsor-application`. They run in `e2e/sponsor-application-storybook.spec.ts`
  (mock only), which checks axe, 375–1920 px overflow and the 1440 geometry.
- **Real backend:** `e2e/real-api/sponsor-application.spec.ts`, with `e2e/real-api/fixtures/s3-stub.mjs` standing
  in for S3 when no emulator is available. The setup is in `e2e/real-api/README.md`.
