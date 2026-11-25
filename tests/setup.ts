import { afterAll } from "vitest";

import { prisma } from "@/server/db";

if (!process.env.DATABASE_URL) {
	throw new Error(
		"Set DATABASE_URL (in .env.test or the environment) to run the tests. Tests write and delete their own rows, so use a database of their own: not the one you develop on, and not the live one.",
	);
}

// Tests create and delete rows. Refuse any database not named as a test one, so a URL copied from the live
// site or from development can never be written to by `npm test`. CI's database is named `..._test` too.
const databaseName = testDatabaseName(process.env.DATABASE_URL);
if (!databaseName?.endsWith("_test")) {
	throw new Error(
		`Refusing to run the tests against the database "${databaseName ?? "unreadable URL"}". Tests write and delete rows, so they only run against a database whose name ends in "_test" (for example plant_data_test). Point DATABASE_URL in .env.test at one.`,
	);
}

function testDatabaseName(url: string): string | null {
	try {
		return decodeURIComponent(new URL(url).pathname.slice(1)) || null;
	} catch {
		return null;
	}
}

afterAll(async () => {
	await prisma.$disconnect();
});
