// Runs a command with the variables in an env file, after saying which database it will use.
// Usage: node scripts/with-env.mjs <env file> <command...>
// Variables from the file win over `.env`, so `.env` can stay pointed at the dev database.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [envFile, ...command] = process.argv.slice(2);
if (!envFile || command.length === 0) {
	console.error("Usage: node scripts/with-env.mjs <env file> <command...>");
	process.exit(1);
}
if (!existsSync(envFile)) {
	console.error(`Create ${envFile} with DATABASE_URL and DIRECT_URL first.`);
	process.exit(1);
}
process.loadEnvFile(envFile);

function describe(url) {
	try {
		const { hostname, port, pathname } = new URL(url);
		return `${hostname}${port ? `:${port}` : ""}${pathname}`;
	} catch {
		return "an unreadable URL";
	}
}
console.log(`Using ${envFile}: database ${describe(process.env.DATABASE_URL ?? "")}`);

const result = spawnSync("npx", command, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
