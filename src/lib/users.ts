import { ROLES, hasRole, roleLabels } from "@/lib/roles";
import type { SwitcherUser } from "@/lib/schemas/session";

/** Where a user starts after signing in: their main job. */
export function homePathFor(user: { roles: readonly string[] }): string {
	if (hasRole(user, ROLES.REVIEWER)) {
		return "/review";
	}
	if (hasRole(user, ROLES.SUSTAINABILITY_HEAD)) {
		return "/overview";
	}
	if (hasRole(user, ROLES.DATA_OWNER)) {
		return "/months";
	}
	return "/plants";
}

/** "Plant data owner · P01 Nimbus Chittorgarh Works" */
export function describeUser(user: SwitcherUser): string {
	const roles = roleLabels(user.roles);
	const plants = user.plants.map((plant) => `${plant.code} ${plant.name}`).join(", ");
	return plants ? `${roles} · ${plants}` : roles;
}

/** Users grouped by company, in the order given. */
export function groupByCompany(users: SwitcherUser[]): [string, SwitcherUser[]][] {
	const groups = new Map<string, SwitcherUser[]>();
	for (const user of users) {
		const members = groups.get(user.companyName) ?? [];
		members.push(user);
		groups.set(user.companyName, members);
	}
	return [...groups.entries()];
}
