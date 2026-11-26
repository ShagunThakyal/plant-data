# Write-up

Live: <https://plant-data-ochre.vercel.app> (pick any sample user; switch from the top bar). Decisions and their
reasons are in [DECISIONS.md](DECISIONS.md); things found while building are in [NOTES.md](NOTES.md).

## What I built

- **Send a month.** A data owner enters a finished month's fuel, grid power and clinker. Units are picked by
  name ("tonnes", "kilolitres"), never "MT". They save a draft, come back and submit. Last month's approved
  value sits beside each input, and CO2 updates as they type.
- **Review a month.** Reviewers see submitted months, flagged ones first, check the figures, then approve or
  send back with a required comment.
- **Fix and resubmit.** The owner reads the comment, corrects and resubmits; the reviewer sees what changed.
- **See where things stand.** Meera gets a plant-by-month grid for FY 2026-27 and approved CO2 by plant,
  quarter and year, Scope 1 and Scope 2 apart, with coverage ("25 of 27 plant-months approved") and each
  quarter marked complete or "not ready to report".

Every status change writes a `ReportEvent`: who, when, from and to which state, the comment, and a snapshot of
the figures. **Only approved months count in any figure Meera sees.**

## Key decisions and why

1. **The month is the unit of review.** One report per plant and month, reviewed as a whole, as plants send
   data today.
2. **Status rules on the server.** One table says who may submit, approve, send back or reopen, from which
   state; nobody reviews their own plant. Each change is a conditional update on id, status and version, so
   two reviewers cannot both act, and an approval covers exactly the version reviewed.
3. **An append-only event log.** The app only adds events. Reopening an approved month needs a reason, and the
   earlier approval stays in the history.
4. **Factors frozen at submit.** Each line copies its factor's value, source and scope at every submit, so a
   later change to the factor table cannot alter an approved figure.
5. **Flags steer attention, never block.** Six checks, from a big change on last month to power per tonne of
   clinker. The owner sees them while typing and can explain in a note; the reviewer sees the note.
6. **Company scoping in the database.** A report's company comes from the plant row, and a composite foreign
   key (plant, company) rejects any mismatch.

## What I left out, and why

- **Real sign-in:** the brief keeps the user switcher.
- **File import and prefill:** three plants send three formats, and their "MT" (tonnes) clashes with our `Mt`
  (million tonnes). I also wanted every number looked at, not copied.
- **Notifications and evidence uploads.**
- **Versioned revisions:** a reopened month leaves Meera's totals until approved again.
- **Multi-reviewer sign-off** and assigning reviewers.
- **Captive power:** we collect only grid power, so plants with their own power plant are flagged low.
- **Next.js 16:** npm audit reports a critical Next.js advisory whose only fix is a major upgrade; most of it
  covers features this app does not use.

## What I'd build next

1. Versioned revisions, so a figure shown to the board counts until its correction is approved.
2. Captive and waste-heat power as reported items.
3. Import of plant files, with each item and unit confirmed before saving.
4. Reminders before the due date and on send-back.

## How I used AI

I used Claude Code in VS Code for most of the typing: explaining the starter, listing the questions the brief
leaves open with options, then writing code, tests and docs in small commits and clicking through each flow in
a headless browser. The product decisions were mine.

**Where it was wrong.** Claude said tests could safely share the development database, because each test
deletes its own rows. When we ran a new test against the old code on purpose, the failing query returned 13
plants (11 seeded plus 2 fixtures), so tests could see everything else in the database. The real risk was
worse: once deployed, `.env` may point at the live database, and `npm test` would write to and delete from
production. Tests now read only `.env.test` and refuse to run unless the database name ends in `_test`.

## How I know it works

90 automated tests pass: 52 on pure logic (dates in India time, units, emissions, status rules, flags, the
overview) and 38 through the API against Postgres (permissions, company isolation, stale saves, two reviewers
acting at once). Where it mattered I broke the code on purpose to see the test fail.
