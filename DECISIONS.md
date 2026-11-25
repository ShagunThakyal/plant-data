# Decisions

Product decisions for v1 of monthly plant data: plants send, reviewers approve, Meera sees the result.
Each entry says what we decided, why, and what we left out. Decided 25 Nov 2026.

## 1. States a month can be in

- Stored states: **Draft → Submitted → Approved**, or **Submitted → Returned → Submitted** again.
- **Not started** (no record yet) and **Overdue** are worked out, not stored. A month is overdue when it is
  not yet submitted after the 10th of the following month.
- While a month is Submitted it is locked. The owner cannot pull it back; they ask a reviewer to return it.

Why: four states cover every flow in the brief. An "In review" state would stop two reviewers checking the
same month, but Meera's team is small and it adds a claim/release flow nobody asked for.

## 2. Changing an approved month

- Approved months are locked.
- A Reviewer or the Head of Sustainability can **reopen** one, with a reason they must give. It goes back to
  the owner as Returned, and stops counting in Meera's figures until it is approved again.
- The earlier approved values stay in the history.

Why: corrections happen, and the auditor must see who reopened what and why.
Left out: versioned revisions, where the old approved figure keeps counting until the new one is approved.
Better for figures already shown to the board; it is the next thing to build.

## 3. No self-review

A reviewer cannot approve, return or reopen a month for a plant they own (for example Priya Nair, Reviewer
and P05 data owner). The server enforces it, not just the UI.

Why: an auditor will ask whether the person who entered a figure also approved it.

## 4. Audit trail

- A dedicated event table records every status change: who, when, from and to which state, the comment, and
  a snapshot of the values.
- Snapshots are taken at submit and approve, not on every draft save.
- The reviewer sees which lines changed since the last submission.
- **Factors are frozen:** when a month is submitted, each line keeps a copy of the factor value and source it
  was calculated with. Editing `src/lib/factors.ts` later does not change approved figures.
- Returning a month needs a comment. Each line has an optional note (for example "As per bill").

Left out: file uploads for evidence such as bills.

## 5. Entering data

- **Units:** each line lets the owner pick a unit of the same kind as the factor (tonnes or kg; litres or
  kilolitres; kWh or MWh). We store the quantity and unit as entered, and the value converted to the factor's
  unit.
- **Units are labelled in words** wherever a person picks one: "tonnes", "kilolitres", "kWh". Never "MT" or
  "Mt": plant files use "MT" for metric tonnes, while our unit table's `Mt` is million tonnes.
- **No CSV import and no prefill.** Each input shows **last month's approved value** beside it as a reference.
  Nobody should submit copied numbers without looking at them.
- **Blank, zero and "doesn't apply":** a draft can have blanks. Submitting needs every line filled; zero is
  allowed. Grinding units have no clinker line, because they buy clinker rather than make it.
- **Which months:** only months that have ended, from April 2026 (start of FY 2026-27). No negative numbers.
- **Who:** only a data owner of the plant can edit its month. If two people save the same draft, the second
  save is rejected (version check) instead of silently overwriting the first.

Left out: CSV import (three different file formats today, and the MT/Mt mix-up shows the risk), email
reminders.

## 6. Anomaly flags

Flags are warnings. They never block a submission. The owner sees them before submitting and can add an
explanation; the reviewer sees them with that explanation. The review queue lists flagged months first.

| Flag | Rule (v1 thresholds, our assumption) |
|---|---|
| a. Big change | A line differs from the last approved month by more than ±30% |
| b. Clinker above capacity | Monthly clinker is more than the plant's cement capacity ÷ 12 |
| b. Power per tonne of clinker | Integrated plants only: grid power outside 50–150 kWh per tonne of clinker |
| c. Unexpected zero | A line is zero where the plant type expects a value (for example clinker at an integrated plant) |
| d. Same as last month | A line is exactly equal to the last approved month's value |
| e. Changed since last submission | On a resubmitted month, lines that changed are highlighted for the reviewer |

The thresholds are a starting point. They live in one place in the code so they are easy to tune.

## 7. Meera's view

- **Only approved figures count.** Months that are not approved show their status but no number.
- Company totals show coverage, for example "Oct 2026: 7 of 9 plants approved". We never estimate missing
  plants.
- Layout: a grid of plants × months for the financial year, by status; approved tCO2 by plant, by quarter
  and for the year, with Scope 1 and Scope 2 shown separately.
- Meera cannot edit monthly data. She can reopen an approved month (see 2).

Left out: intensity figures (CO2 per tonne of cement), because plants do not report cement output.

## 8. Who sees what

- Data owners see only their own plants' months.
- Reviewers and the Head of Sustainability see every plant in their company.
- No assigning months to particular reviewers.
- Everyone sees only their own company's data.

## 9. Existing bug

`plant.list` returned every company's plants. We fix it in its own commit, with a test.

## Build order

Small commits, each with tests where they make sense:

1. This file
2. Fix `plant.list` company scoping
3. Schema: monthly report, lines, events
4. Emissions calculation
5. Status rules (which role can move a month to which state)
6. API: owner opens, saves and submits a draft
7. UI: owner's months and entry form
8. **Deploy to Vercel + Neon.** From here on, redeploy after every feature
9. API + UI: review queue, approve, return, reopen
10. Anomaly flags
11. Meera's overview
12. Sample history in the seed
13. Navigation by role, empty states
14. Write-up
