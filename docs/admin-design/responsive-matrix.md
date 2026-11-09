# Admin design — responsive matrix (SF-109)

Design version 119. **Web only:** there's no native Admin app. Real layouts, using container queries in the boards,
are on `AdminResponsive` (11 modules × 7 widths, first 900 px each, half size). Production uses the repo's breakpoints.

| Width                  | Nav                            | Content                 | Tables              | Dialogs                   | High-risk actions                  |
| ---------------------- | ------------------------------ | ----------------------- | ------------------- | ------------------------- | ---------------------------------- |
| 1920, 1728, 1512, 1440 | 240 px sidebar with groups     | Two columns             | Full                | Centered, 560 px          | Allowed                            |
| 1280                   | Sidebar                        | Two columns             | Full                | Centered                  | Allowed                            |
| 1024                   | Sidebar                        | One column where needed | Scroll in their box | Centered                  | Allowed                            |
| 768                    | Scrolling row, no group labels | One column              | Scroll in their box | Full width, top           | Allowed                            |
| 430, 390, 375          | Scrolling row                  | Stacked                 | Scroll in their box | Full width, scroll inside | **Hidden, with a note (PROPOSED)** |

**Below 640, high-risk actions are hidden** (approve, reject, revoke, suspend, grant, reveal). A visible note says they
need a larger screen and a key. Reading, searching and claiming still work. This is a new proposal that needs a
founder decision. Hiding a button is UX only: the API enforces nothing based on screen size.

**Tour:** below 1024 the card docks at the bottom and the ring is hidden.

## QA

All 16 interactive Admin boards rendered in Chromium with the canvas runtime, at 375, 390, 430, 768, 1024, 1280,
1440, 1512, 1728 and 1920 (160 renders).

| Check                                     | Result |
| ----------------------------------------- | ------ |
| Horizontal page overflow                  | None   |
| Controls under 40 px                      | None   |
| Unlabelled fields                         | None   |
| Unresolved template holes, runtime errors | None   |

`AdminResponsive` and `AdminStatesSheet` report no frame overflow.
