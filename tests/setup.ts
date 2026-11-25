import { afterAll } from "vitest";

import { prisma } from "@/server/db";

if (!process.env.DATABASE_URL) {
	throw new Error(
		"Set DATABASE_URL (in .env.test or the environment) to run the tests. Tests write and delete their own rows, so use a database of their own: not the one you develop on, and not the live one.",
	);
}

afterAll(async () => {
	await prisma.$disconnect();
});
