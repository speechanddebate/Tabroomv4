import factories from '../../../tests/factories/index.js';
import { db } from '../../data/database.js';
import { can, rule, which, who } from './access.js';
import { policy } from './policy.js';

import type { Database } from '../../data/database.js';
import type { SessionPerson } from './types.js';

// The engine's mechanics, with a few real relations. What each relation matches is relations.test.ts's job.
// A judge with a ballot on one panel, a co-judge whose ballot has two rows, a judge with no account,
// and a second panel the judge isn't on
let tournId: number;
let eventId: number;
let otherEventId: number;
let judgeId: number;
let coJudgeId: number;
let unlinkedJudgeId: number;
let panelId: number;
let notOnPanelId: number;
const people: Record<string, SessionPerson> = {};

beforeAll(async () => {
	const tourn = await factories.tourn.create();
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id });
	const otherEvent = await factories.event.create({ tourn: tourn.id, category: category.id });
	const round = await factories.round.create({ event: event.id });
	panelId = (await factories.panel.create({ round: round.id })).id;
	notOnPanelId = (await factories.panel.create({ round: round.id })).id;
	tournId = tourn.id;
	eventId = event.id;
	otherEventId = otherEvent.id;

	people.judge = await factories.person.create();
	judgeId = (await factories.judge.create({ person: people.judge.id, category: category.id })).id;
	await factories.ballot.create({ judge: judgeId, panel: panelId });

	people.coJudge = await factories.person.create();
	coJudgeId = (await factories.judge.create({ person: people.coJudge.id, category: category.id })).id;
	await factories.ballot.create({ judge: coJudgeId, panel: panelId, side: 1 });
	await factories.ballot.create({ judge: coJudgeId, panel: panelId, side: 2 });

	unlinkedJudgeId = (await factories.judge.create({ category: category.id })).id;
	await factories.ballot.create({ judge: unlinkedJudgeId, panel: panelId });

	people.tabber = await factories.person.create();
	await factories.permission.create({ person: people.tabber.id, tourn: tourn.id, tag: 'tabber' });
	people.eventTabber = await factories.person.create();
	await factories.permission.create({ person: people.eventTabber.id, tourn: tourn.id, event: event.id, tag: 'tabber' });
	people.stranger = await factories.person.create();
	people.siteAdmin = await factories.person.create({ site_admin: 1 });
});

describe('can', () => {
	it('allows a person a listed relation matches, and denies one it does not', async () => {
		expect(await can(db, people.eventTabber, 'event', 'write', eventId)).toBe(true);
		expect(await can(db, people.stranger, 'event', 'write', eventId)).toBe(false);
	});

	it('matches the relation on the requested resource only', async () => {
		expect(await can(db, people.eventTabber, 'event', 'write', otherEventId)).toBe(false);
	});

	it('checks every part of a composite id: a judge has no ballot on a panel they are not on', async () => {
		expect(await can(db, people.judge, 'ballot', 'write', { judgeId, panelId })).toBe(true);
		expect(await can(db, people.judge, 'ballot', 'write', { judgeId, panelId: notOnPanelId })).toBe(false);
	});

	it('throws for an id of the wrong shape', async () => {
		await expect(can(db, people.judge, 'ballot', 'write', judgeId)).rejects.toThrow('needs judgeId in its id');
		await expect(can(db, people.tabber, 'event', 'write', { eventId })).rejects.toThrow('takes a single id');
	});

	it('allows a site admin without asking the database', async () => {
		const unreachable = new Proxy({}, { get: () => { throw new Error('queried the database'); } }) as Database;
		expect(await can(unreachable, people.siteAdmin, 'tourn', 'owner', tournId)).toBe(true);
	});

	it('gives the same answers whatever order a rule lists its relations in', async () => {
		const listed = policy.ballot.write;
		const original = [...listed];
		const answers = () => Promise.all(Object.values(people).map(person => can(db, person, 'ballot', 'write', { judgeId, panelId })));
		try {
			const before = await answers();
			listed.reverse();
			expect(await answers()).toEqual(before);
		} finally {
			listed.splice(0, listed.length, ...original);
		}
	});
});

describe('who', () => {
	it('lists each person once per relation, however many rows match, and skips rows with no person', async () => {
		const coJudgeBallot = await who(db, 'ballot', 'write', { judgeId: coJudgeId, panelId });
		expect(coJudgeBallot.filter(row => row.personId === people.coJudge.id)).toEqual([{ personId: people.coJudge.id, relation: 'judgeSelf' }]);

		const unlinkedBallot = await who(db, 'ballot', 'write', { judgeId: unlinkedJudgeId, panelId });
		expect(unlinkedBallot.every(row => row.personId > 0)).toBe(true);
		expect(unlinkedBallot.map(row => row.relation)).not.toContain('judgeSelf');
	});

	it('leaves out site admins, who are not related to the resource', async () => {
		expect((await who(db, 'event', 'write', eventId)).map(row => row.personId)).not.toContain(people.siteAdmin.id);
	});
});

describe('which', () => {
	it('lists a composite resource once however many rows it has', async () => {
		expect((await which(db, people.coJudge, 'ballot', 'write', { tourn: tournId })).ids).toEqual([{ judgeId: coJudgeId, panelId }]);
	});

	it('gives site admins all, without ids', async () => {
		expect(await which(db, people.siteAdmin, 'event', 'read', { tourn: tournId })).toEqual({ all: true, ids: [] });
	});

	it('throws for a resource with no tourn to bound by', async () => {
		await expect(which(db, people.tabber, 'chapter', 'write', { tourn: tournId })).rejects.toThrow('has no tourn to bound by');
	});
});

describe('rules', () => {
	it('throws for a pair the policy has no rule for', async () => {
		expect(rule('tourn', 'nonsense')).toBeUndefined();
		await expect(can(db, people.tabber, 'tourn', 'nonsense', tournId)).rejects.toThrow('No policy for nonsense on tourn');
		await expect(who(db, 'tourn', 'nonsense', tournId)).rejects.toThrow('No policy for nonsense on tourn');
		await expect(which(db, people.tabber, 'tourn', 'nonsense', { tourn: tournId })).rejects.toThrow('No policy for nonsense on tourn');
	});
});
