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

The evidence said otherwise. To prove the `plant.list` test catches the bug, we ran it against the old code.
The failing query returned **13 plants: the 11 seeded ones plus the 2 test fixtures**. The fixtures were
cleaned up, but the seed data was visible to every test. Any test that counts rows (for example "the review
queue has one month in it") would depend on whatever happened to be seeded or left over from dev work.

Fix, in `e48921a`: tests read `.env.test` and run against their own database, with no fallback to `.env`.
We checked it by counting rows after a run: 11 plants in the dev database, 0 in the test database.

What caught it: making the new test fail on purpose before trusting that it passed, and reading the actual
failure output instead of just the pass/fail count.

## Local setup quirks

**Vitest on Windows.** When the terminal's path starts with lowercase `c:\` (VS Code's default here), Vitest
loads itself twice and every suite fails with "failed to find the current suite". Running from `C:\` works.
Not a code problem; Vercel and Linux are not affected. Recorded in the README.
