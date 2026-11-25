// Applies prisma/schema.prisma to the test database in .env.test. Prisma itself only reads .env.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".env.test")) {
	console.error("Create .env.test with DATABASE_URL and DIRECT_URL for the test database first.");
	process.exit(1);
}
process.loadEnvFile(".env.test");
const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
