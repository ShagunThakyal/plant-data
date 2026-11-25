# Decisions

Product decisions for v1 of monthly plant data: plants send, reviewers approve, Meera sees the result.
Each entry says what we decided, why, and what we left out. Decided 25 Nov 2026.

## 1. States a month can be in

- Stored states: **Draft → Submitted → Approved**, or **Submitted → Returned → Submitted** again.
- **Not started** (no record yet) and **Overdue** are worked out, not stored. A month is overdue when it is
  not yet submitted after the 10th of the following month.
- While a month is Submitted it is locked. The owner cannot pull it back; they ask a reviewer to return it.
- **Every status change is conditional.** Submit, approve, return and reopen each update the month only
  where its id, status and version are the ones the user acted on, and fail if no row changed. Two reviewers
  cannot both act on the same month, and an approval applies to exactly the version that was reviewed.
- **Overdue** applies to Not started and Draft only. A month that was sent back was submitted on time, and the
  delay since is partly the reviewer's.

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
- **Frozen again at every submit,** including a resubmit after a return. An approved figure always uses the
  factors frozen at the submit that was approved.
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
  A month is written `YYYY-MM` (month 01–12). It has ended once the next month has begun in India time
  (Asia/Kolkata), since every plant is in India.
- **Numbers:** stored as floating point, at most 4 decimal places. A typed value of up to 15 significant
  digits comes back exactly as typed, and totals are shown to 0.1 tCO2.
- **New factors later:** opening an old draft or returned month shows a blank line for any applicable factor it
  is missing, and saving adds it; it must be filled before submit. Approved months stay as they are. Code that
  reads lines (totals, flags) treats a missing line as "not reported", never as an error.
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
| d. Same as last month | A line is exactly equal to the last approved month's value. Skipped when both are 0, so fuels a plant does not use do not trigger it |
| e. Changed since last submission | On a resubmitted month, lines that changed are highlighted for the reviewer |

If time runs short, flags (b) and (c) can be cut; (a), (d) and (e) stay.

The thresholds are a starting point. Every threshold (and the overdue day and first reportable month in
sections 1 and 5) lives in one constants file, so they are easy to find and tune.

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
- A report's company is set only from the plant row loaded through the user's company, never from input. The
  database enforces it too: a report points at its plant by (plant id, company id).

## 9. Existing bug

`plant.list` returned every company's plants. We fix it in its own commit, with a test.

## Build order

Small commits, each with tests where they make sense. Done so far: this file, the `plant.list` fix, the
schema, periods. Then:

1. Emissions calculation and status rules
2. Owner save and submit (service and API)
3. Owner UI: months list and entry form
4. **Deploy to Vercel + Neon.** From here on, redeploy after every feature
5. Review service: approve, return, reopen, with a test of two concurrent approve/return calls
6. Review UI
7. Meera's overview
8. Anomaly flags
9. Demo data in the seed
10. Write-up
