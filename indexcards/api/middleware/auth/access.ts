import { sql } from 'kysely';
import { policy } from './policy.js';
import { relations, type Relation } from './relations.js';
import type { Database } from '../../data/database.js';
import type { ResourceId, SessionPerson } from './types.js';

/** the relations that allow action on resource, or undefined when the policy has no rule for it */
export function rule(resource: string, action: string): [string, Relation][] | undefined {
	const names = (policy as Record<string, Record<string, string[]>>)[resource]?.[action];
	if (!names) return undefined;
	const defined = (relations as Record<string, Record<string, Relation>>)[resource];
	return names.map(name => [name, defined[name]]);
}

function ruleOrThrow(resource: string, action: string) {
	const found = rule(resource, action);
	if (!found) throw new Error(`No policy for ${action} on ${resource}`);
	return found;
}

/**
 * one query per relation, filtered on its own columns. The filters go on each branch,
 * not around the combined query, so every branch can use its indexes
 */
function branches(db: Database, rels: [string, Relation][], filter: { resourceId?: ResourceId, personId?: number }) {
	return rels.map(([name, relation]) => {
		let query = relation.query(db);
		const id = filter.resourceId;
		if (id !== undefined && typeof relation.resource === 'string') {
			if (typeof id !== 'number') throw new Error(`${name} takes a single id`);
			query = query.where(sql.ref(relation.resource), '=', id);
		} else if (id !== undefined && typeof relation.resource !== 'string') {
			// each part of a composite id has its own column, e.g. ballot.judge for judgeId
			for (const [part, column] of Object.entries(relation.resource)) {
				const value = typeof id === 'number' ? undefined : id[part];
				if (value === undefined) throw new Error(`${name} needs ${part} in its id`);
				query = query.where(sql.ref(column), '=', value);
			}
		}
		if (filter.personId !== undefined) query = query.where(sql.ref(relation.person), '=', filter.personId);
		return { name, relation, query };
	});
}

/**
 * whether person may perform action on the resource. One query, whichever relations the policy lists.
 * MariaDB evaluates `exists (a) or exists (b)` left to right and stops at the first match, where
 * `exists (a union all b)` runs every branch, so list the most common relation first in the policy
 */
export async function can(db: Database, person: SessionPerson, resource: string, action: string, resourceId: ResourceId) {
	const rels = ruleOrThrow(resource, action);
	if (person.site_admin) return true;

	const checks = branches(db, rels, { resourceId, personId: person.id })
		.map(({ query }) => query.select(sql.lit(1).as('ok')));
	const row = await db.selectNoFrom(eb => eb.or(checks.map(check => eb.exists(check))).as('ok')).executeTakeFirstOrThrow();
	return Number(row.ok) === 1;
}

/**
 * everyone who may perform action on the resource, with the relation that allows it.
 * site admins aren't listed: they may do anything, but aren't related to the resource
 */
export async function who(db: Database, resource: string, action: string, resourceId: ResourceId) {
	const union = branches(db, ruleOrThrow(resource, action), { resourceId })
		.map(({ name, relation, query }) => query.select([
			sql<number | null>`${sql.ref(relation.person)}`.as('personId'),
			sql<string>`${name}`.as('relation'),
		]))
		.reduce((all, branch) => all.unionAll(branch));
	const rows = await union.execute();

	// a person can hold the same relation twice, e.g. two tabber rows at a tourn
	const seen = new Set<string>();
	return rows.flatMap(({ personId, relation }) => {
		const key = `${personId}:${relation}`;
		if (!personId || seen.has(key)) return [];
		seen.add(key);
		return [{ personId: Number(personId), relation: String(relation) }];
	});
}

/**
 * the resources in one tourn that person may perform action on. all is true for site admins,
 * who may act on every resource and get no ids. The tourn bound is required: unbounded, the
 * heaviest coach's entries took 16 s cold on the dev DB
 */
export async function which(db: Database, person: SessionPerson, resource: string, action: string, bound: { tourn: number }): Promise<{ all: boolean, ids: ResourceId[] }> {
	const rels = ruleOrThrow(resource, action);
	if (person.site_admin) return { all: true, ids: [] };

	// every relation of a resource has the same id parts, so the first one names the columns
	const parts = typeof rels[0][1].resource === 'string' ? ['resourceId'] : Object.keys(rels[0][1].resource);
	const union = branches(db, rels, { personId: person.id })
		.map(({ name, relation, query }) => {
			if (!relation.tourn) throw new Error(`${name} on ${resource} has no tourn to bound by`);
			const columns = typeof relation.resource === 'string' ? { resourceId: relation.resource } : relation.resource;
			return query
				.where(sql.ref(relation.tourn), '=', bound.tourn)
				.select(parts.map(part => sql<number>`${sql.ref(columns[part])}`.as(part)));
		})
		.reduce((all, branch) => all.unionAll(branch));
	const rows = await union.execute() as Record<string, unknown>[];

	// the same resource comes back once per relation and per matching row, e.g. a ballot's several entries
	const ids = new Map<string, ResourceId>();
	for (const row of rows) {
		// a null id part names nothing, e.g. a round with no timeslot reached from timeslot's event relations
		if (parts.some(part => row[part] === null)) continue;
		const id = typeof rels[0][1].resource === 'string'
			? Number(row.resourceId)
			: Object.fromEntries(parts.map(part => [part, Number(row[part])]));
		ids.set(JSON.stringify(id), id);
	}
	return { all: false, ids: [...ids.values()] };
}
