# Notes for the write-up

Things found while building that belong in the write-up. Product decisions are in [DECISIONS.md](DECISIONS.md).

## Known issues left in

**npm audit (checked 26 Nov 2026).** Three findings in the starter's dependencies:

- **Next.js, critical.** The affected range is everything up to `16.3.0-preview.10`. We run `14.2.35`, the
  last 14.x release, so no 14.x patch fixes it. npm's only fix is Next 16, a major upgrade we did not take
  (no `npm audit fix --force`). Most of the advisories cover features this app does not use: the App
  Router, Server Actions, `next/image`, middleware and rewrites (it has one redirect).
- **postcss 8.4.31 (high)**, nested inside Next. Fixed only by the same Next upgrade.
- **zod 3.25 (high)**, memory use on oversized collections. Fixed only in zod 4, a major upgrade.

## Bugs found in the starter

**`plant.list` showed every company's plants.** `listPlants` took an optional `companyId` that the router
never passed, and Prisma treats `undefined` as "no filter". So Meera saw Kestrel's plants and Kestrel's head
saw Nimbus's. Fixed in `f8dfd8b`: the service now takes the user and filters with `companyScope`, like
`getPlantDetail`. Two tests cover it, and both fail when the old code is put back.

## Where the AI was wrong, and how it was caught

**Tests sharing the dev database.** When setting up the local Docker database, the AI said tests could
safely share it with local development, because each test creates its own company and deletes it
afterwards. The starter's README had advised a separate database; the AI argued that advice was only about
the live site.

**The real risk: tests writing to production.** Tests read `DATABASE_URL` from `.env`, and `.env` is the
file you point at whatever database you are working on. Once the app is deployed, it is easy for `.env` to
hold the live Neon URL (to run `db:push` or `db:seed` against production, for example). A plain `npm test`
would then create and delete rows in the live database:

- Test companies and users would appear on the live site while tests run. `session.users` lists every user
  in every company, so they would show up on the public sign-in page.
- A test that fails or is interrupted before its clean-up leaves its rows there for good.
- Each test deletes only its own company today, but one wrong `where` in a future clean-up would delete
  real, approved data that the auditor relies on.

**The symptom that made us look.** To prove the `plant.list` test catches the bug, we ran it against the old
code. The failing query returned **13 plants: the 11 seeded ones plus the 2 test fixtures**. The fixtures
were cleaned up, but seed data was visible to every test, so any test that counts rows (for example "the
review queue has one month in it") would depend on whatever happened to be in the database. That showed
tests and other data were not separated. The production risk above is why it matters.

Fix, in `e48921a`: tests read `.env.test` only, never `.env`, and with no fallback. A missing `.env.test`
stops the run instead of quietly using whatever `.env` points at. We checked it by counting rows after a
run: 11 plants in the dev database, 0 in the test database.

What caught it: making the new test fail on purpose before trusting that it passed, reading the actual
failure output instead of just the pass/fail count, and then asking what else that shared `.env` could be
pointing at.

**A deliberate break that was not undone.** To prove the time-zone tests work, the AI set the reporting time
zone to UTC, saw the three expected failures, then ran `git checkout` on the file to restore it. The file
was new and not yet tracked, so `git checkout` did nothing and the file still said UTC. It was caught by
reading `git status` (the file showed as untracked, not unmodified) before committing, then checking the
line itself. Lesson: after breaking code on purpose, confirm the restore, not just the failure.

**Demo data that made the flags cry wolf.** The AI's first demo seed built every plant's April to September
from its capacity. For P01 that history did not match P01's real October file, so the review queue showed
**6 flags** on P01: coal and petroleum coke "up 50-70%" were artefacts of the made-up history, and they buried
the one real problem (power of 4,500 MWh, 16 kWh per tonne of clinker, likely a missing zero). Caught by
reading the queue as a reviewer would, not just checking that the seed ran. Fix: plants with a sample file get
history based on their own October figures, so P01 now shows 2 flags, both about power, and P04 is clean.

**A failed command hidden by the next one.** Checking that the database rejects a report whose company
differs from its plant's, the AI chained `prisma db push` with the SQL check. The push had stopped at a
warning, but the chain carried on, and the check "passed" by inserting the bad row: the constraint was not
there yet. Caught by reading the whole output, not the last line. The push was then rerun on its own and the
check repeated; the bad row was refused.

**A check that wrote into the test database.** To prove the deploy scripts honour their env file, the AI ran
the seed against `.env.test`. It proved the point, and left the full demo data in the test database we had
just separated from everything else. Cleaned up straight away and confirmed empty.

## Flags that found real problems

- In the tests, Nalgonda's October clinker (1,01,700 t) tripped the capacity flag at the test helper's default
  plant size of 1 Mt a year (83,333 t a month). The flag was right; the test plant was wrong. Test plants now
  use Nalgonda's real 2.5 Mt.
- In the sample files, P01 Chittorgarh's grid power works out at 16 kWh per tonne of clinker, against 121 at
  P04 Nalgonda. The power-per-tonne flag catches it.

## Local setup quirks

**Vitest on Windows.** When the terminal's path starts with lowercase `c:\` (VS Code's default here), Vitest
loads itself twice and every suite fails with "failed to find the current suite". Running from `C:\` works.
Not a code problem; Vercel and Linux are not affected. Recorded in the README.
