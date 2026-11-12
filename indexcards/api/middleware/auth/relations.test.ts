import factories from '../../../tests/factories/index.js';
import { db } from '../../data/database.js';
import { which, who } from './access.js';
import { policy } from './policy.js';
import { relations } from './relations.js';

import type { Insertable } from 'kysely';
import type { Permission } from '../../data/schema.js';
import type { ResourceId, SessionPerson } from './types.js';

// One tourn listed in a circuit, with each resource the policy covers, and a near miss beside each:
// another event, category, and tourn, a pending circuit listing, and tags no role names (contact, limited).
// Each relation is checked once, as the exact list of these people it matches
const people: Record<string, SessionPerson> = {};
const names = new Map<number, string>();
const ids: Record<string, ResourceId> = {};
let tournId: number;
let otherTournId: number;
let chapterId: number;

beforeAll(async () => {
	const circuit = await factories.circuit.create();
	const pendingCircuit = await factories.circuit.create();
	const tourn = await factories.tourn.create({ circuit: circuit.id });
	await db.insertInto('tourn_circuit').values({ tourn: tourn.id, circuit: pendingCircuit.id, approved: 0 }).execute();
	const otherTourn = await factories.tourn.create();
	const category = await factories.category.create({ tourn: tourn.id });
	const otherCategory = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id });
	const otherEvent = await factories.event.create({ tourn: tourn.id, category: otherCategory.id });
	const timeslot = await factories.timeslot.create({ tourn: tourn.id });
	const otherTimeslot = await factories.timeslot.create({ tourn: tourn.id });
	const round = await factories.round.create({ event: event.id, timeslot: timeslot.id });
	await factories.round.create({ event: otherEvent.id, timeslot: otherTimeslot.id });
	const panel = await factories.panel.create({ round: round.id });
	const chapter = await factories.chapter.create();
	await db.insertInto('chapter_setting').values({ chapter: chapter.id, tag: 'self_prefs', value: '1' }).execute();
	// the competitor's own chapter differs from the entering school's, as on a hybrid entry
	const studentChapter = await factories.chapter.create();
	const school = await factories.school.create({ tourn: tourn.id, chapter: chapter.id });
	const competitor = await factories.person.create();
	const student = await factories.student.create({ person: competitor.id, chapter: studentChapter.id });
	const retiredCompetitor = await factories.person.create();
	const retiredStudent = await factories.student.create({ person: retiredCompetitor.id, chapter: chapter.id, retired: 1 });
	const entry = await factories.entry.create({ event: event.id, school: school.id, students: [student.id, retiredStudent.id] });
	const schoolContact = await factories.person.create();
	await factories.contact.create({ school: school.id, person: schoolContact.id });
	chapterId = chapter.id;
	const judgePerson = await factories.person.create();
	const judge = await factories.judge.create({ person: judgePerson.id, category: category.id });
	await factories.ballot.create({ judge: judge.id, panel: panel.id });
	const jpool = await factories.jpool.create({ category: category.id });
	const region = await factories.region.create({ circuit: circuit.id });
	const district = Number((await db.insertInto('district').values({ name: 'District' }).executeTakeFirstOrThrow()).insertId);
	const otherDistrict = Number((await db.insertInto('district').values({ name: 'Other District' }).executeTakeFirstOrThrow()).insertId);
	tournId = tourn.id;
	otherTournId = otherTourn.id;
	Object.assign(ids, {
		tourn: tourn.id, category: category.id, event: event.id, round: round.id, panel: panel.id,
		timeslot: timeslot.id, chapter: chapter.id, judge: judge.id, ballot: { judgeId: judge.id, panelId: panel.id }, entry: entry.id,
		school: school.id, student: student.id, jpool: jpool.id,
		circuit: circuit.id, region: region.id, district,
	});

	const grants: Record<string, Partial<Insertable<Permission>>> = {
		tournOwner: { tourn: tourn.id, tag: 'owner' },
		tournTabber: { tourn: tourn.id, tag: 'tabber' },
		tournChecker: { tourn: tourn.id, tag: 'checker' },
		eventTabber: { tourn: tourn.id, event: event.id, tag: 'tabber' },
		eventChecker: { tourn: tourn.id, event: event.id, tag: 'checker' },
		categoryTabber: { tourn: tourn.id, category: category.id, tag: 'tabber' },
		categoryChecker: { tourn: tourn.id, category: category.id, tag: 'checker' },
		otherEventTabber: { tourn: tourn.id, event: otherEvent.id, tag: 'tabber' },
		otherCategoryTabber: { tourn: tourn.id, category: otherCategory.id, tag: 'tabber' },
		otherTournTabber: { tourn: otherTourn.id, tag: 'tabber' },
		contact: { tourn: tourn.id, tag: 'contact' },
		limited: { tourn: tourn.id, tag: 'limited' },
		circuitAdmin: { circuit: circuit.id, tag: 'circuit' },
		pendingCircuitAdmin: { circuit: pendingCircuit.id, tag: 'circuit' },
		coach: { chapter: chapter.id, tag: 'chapter' },
		prefsCoach: { chapter: chapter.id, tag: 'prefs' },
		studentChapterCoach: { chapter: studentChapter.id, tag: 'chapter' },
		regionAdmin: { region: region.id, tag: 'region' },
		districtChair: { district, tag: 'chair' },
		districtMember: { district, tag: 'member' },
		districtWsdc: { district, tag: 'wsdc' },
		otherDistrictChair: { district: otherDistrict, tag: 'chair' },
	};
	for (const [name, grant] of Object.entries(grants)) {
		const person = await factories.person.create();
		await factories.permission.create({ ...grant, person: person.id });
		people[name] = person;
	}
	people.judge = judgePerson;
	people.competitor = competitor;
	people.retiredCompetitor = retiredCompetitor;
	people.schoolContact = schoolContact;
	for (const [name, person] of Object.entries(people)) names.set(person.id, name);
});

const rules = policy as Record<string, Record<string, string[]>>;
const tournStaff = ['tournOwner', 'tournTabber', 'tournChecker', 'eventTabber', 'eventChecker', 'categoryTabber', 'categoryChecker', 'otherEventTabber', 'otherCategoryTabber'];
const tournTab = ['tournOwner', 'tournTabber'];

// every relation, with the fixture people it should match on the fixture's resource
const cases: [string, string, string[]][] = [
	['tourn', 'tournStaff', tournStaff],
	['tourn', 'tournTab', tournTab],
	['tourn', 'tournOwner', ['tournOwner']],
	['tourn', 'tournChecker', ['tournChecker']],
	['tourn', 'circuitAdmin', ['circuitAdmin']],
	['category', 'tournTab', tournTab],
	['category', 'tournChecker', ['tournChecker']],
	['category', 'categoryTab', ['categoryTabber']],
	['category', 'categoryChecker', ['categoryChecker']],
	['event', 'tournTab', tournTab],
	['event', 'tournChecker', ['tournChecker']],
	['event', 'eventTab', ['eventTabber']],
	['event', 'eventChecker', ['eventChecker']],
	['round', 'tournTab', tournTab],
	['round', 'tournChecker', ['tournChecker']],
	['round', 'eventTab', ['eventTabber']],
	['round', 'eventChecker', ['eventChecker']],
	['panel', 'tournTab', tournTab],
	['panel', 'tournChecker', ['tournChecker']],
	['panel', 'eventTab', ['eventTabber']],
	['panel', 'eventChecker', ['eventChecker']],
	['timeslot', 'tournTab', tournTab],
	['timeslot', 'tournChecker', ['tournChecker']],
	// through their events' rounds in the timeslot; the other event's round is in the other timeslot
	['timeslot', 'eventTab', ['eventTabber']],
	['timeslot', 'eventChecker', ['eventChecker']],
	['chapter', 'coach', ['coach']],
	['judge', 'self', ['judge']],
	['judge', 'tournTab', tournTab],
	['judge', 'categoryTab', ['categoryTabber']],
	['judge', 'tournChecker', ['tournChecker']],
	['judge', 'categoryChecker', ['categoryChecker']],
	['jpool', 'tournTab', tournTab],
	['jpool', 'tournChecker', ['tournChecker']],
	['jpool', 'categoryTab', ['categoryTabber']],
	['jpool', 'categoryChecker', ['categoryChecker']],
	['ballot', 'judgeSelf', ['judge']],
	['ballot', 'tournTab', tournTab],
	['ballot', 'eventTab', ['eventTabber']],
	['entry', 'tournTab', tournTab],
	['entry', 'tournChecker', ['tournChecker']],
	['entry', 'eventTab', ['eventTabber']],
	['entry', 'eventChecker', ['eventChecker']],
	['entry', 'competitor', ['competitor']],
	['entry', 'coach', ['coach']],
	['entry', 'prefsCoach', ['prefsCoach']],
	['entry', 'selfPrefs', ['competitor']],
	['school', 'tournTab', tournTab],
	['school', 'coach', ['coach']],
	['school', 'schoolContact', ['schoolContact']],
	['chapter', 'prefsCoach', ['prefsCoach']],
	['student', 'coach', ['studentChapterCoach']],
	['student', 'self', ['competitor']],
	['circuit', 'circuitAdmin', ['circuitAdmin']],
	['region', 'regionAdmin', ['regionAdmin']],
	['region', 'circuitAdmin', ['circuitAdmin']],
	['district', 'districtChair', ['districtChair']],
	['district', 'districtMember', ['districtMember']],
	['district', 'districtWsdc', ['districtWsdc']],
];

it('has a case for every relation', () => {
	const defined = Object.entries(relations).flatMap(([resource, rels]) => Object.keys(rels).map(name => `${resource} ${name}`));
	expect(cases.map(([resource, name]) => `${resource} ${name}`).toSorted()).toEqual(defined.toSorted());
});

// who lists every relation of a rule with its name, so any action whose rule lists the relation will do
const actionListing = (resource: string, relation: string) => Object.keys(rules[resource]).find(name => rules[resource][name].includes(relation))!;

it.each(cases)('%s %s matches exactly its people', async (resource, relation, expected) => {
	const found = await who(db, resource, actionListing(resource, relation), ids[resource]);
	expect(found.filter(row => row.relation === relation).map(row => names.get(row.personId)).toSorted()).toEqual(expected.toSorted());
});

// which bounds by each relation's tourn column; chapters and students belong to no tourn
const inATourn = cases.filter(([resource, relation]) => (relations as Record<string, Record<string, { tourn?: string }>>)[resource][relation].tourn);

it.each(inATourn)('%s %s finds the resource in its own tourn only', async (resource, relation, expected) => {
	const person = people[expected[0]];
	const action = actionListing(resource, relation);
	expect((await which(db, person, resource, action, { tourn: tournId })).ids).toContainEqual(ids[resource]);
	expect((await which(db, person, resource, action, { tourn: otherTournId })).ids).not.toContainEqual(ids[resource]);
});

it('entry selfPrefs needs the school chapter self_prefs setting', async () => {
	const holders = async () => (await who(db, 'entry', 'prefs', ids.entry)).filter(row => row.relation === 'selfPrefs');
	try {
		await db.deleteFrom('chapter_setting').where('chapter', '=', chapterId).where('tag', '=', 'self_prefs').execute();
		expect(await holders()).toEqual([]);
	} finally {
		await db.insertInto('chapter_setting').values({ chapter: chapterId, tag: 'self_prefs', value: '1' }).execute();
	}
});
