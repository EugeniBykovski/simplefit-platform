# Admin design — routes and flow (SF-109)

Board `FlowAdmin`, version 119. **The registry isn't changed.** The mapping comes from SF-107's route matrix
(`simplefit-api` `docs/architecture/sponsor-admin-route-matrix.md`), which is proposed.

| Board           | Registry today                        | Proposed                                                       |
| --------------- | ------------------------------------- | -------------------------------------------------------------- |
| AD0             | `web.admin.login`, GUEST_ONLY         | Login stays; key step `web.admin.verify` (**new**)             |
| ARW1            | `web.admin.welcome`, phase ONBOARDING | Same route; phase null, never a gate                           |
| AD1             | `web.admin`                           | Same                                                           |
| AD7, AD8        | `web.admin.users`, `._user-id`        | Same; AD10 no longer here                                      |
| AD9             | `web.admin.users._user-id`            | A dialog on whichever page starts the action                   |
| AD2, AD12       | `web.admin.tenants`, `._tenant-id`    | Same; gyms only                                                |
| AGV1            | —                                     | `web.admin.gyms.verification`, `._application-id` (**new**)    |
| AS1             | `web.admin.sponsors`                  | `web.admin.sponsor-applications` (**new**)                     |
| AS2             | `web.admin.sponsors._sponsor-id`      | `web.admin.sponsor-applications._application-id` (**new**)     |
| AS4             | `web.admin.sponsors._sponsor-id`      | Same, organization only                                        |
| AD14            | `web.admin.audit`                     | Plus `._event-id` (**new**)                                    |
| AD17            | `web.admin.integrations`              | Same; health                                                   |
| AD20            | `web.admin.staff`                     | Plus `._operator-id` (**new**); `state=self` for your security |
| AD13            | `web.admin.subscriptions`             | Deferred                                                       |
| Everything else | 24 more `/admin/*` placeholders       | Hidden from nav; the API refuses them                          |

## Guard order

```
no session            → /admin/login
/api/v1/admin/me 404  → web.not-found (not operator, suspended or revoked: indistinguishable)
pending_enrollment    → /admin/verify (enroll)
no current key check  → /admin/verify (key)
first visit           → /admin/welcome, once, never blocking
missing permission    → restricted state in the shell; the API refuses regardless
```

**Mobile:** none. `D-MOBILE-SPONSOR-ADMIN` stands.
