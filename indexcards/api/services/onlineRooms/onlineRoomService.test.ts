import factories from '../../../tests/factories/index.js';
import { db } from '../../data/database.js';
import config from '../../config.js';
import eventRepo from '../../repos/eventRepo.js';
import panelRepo from '../../repos/panelRepo.js';
import type { Settings } from '../../repos/utils/index.js';
import { createActor } from '../../middleware/auth/authorization.js';
import type { Actor } from '../../middleware/auth/types.js';
import { campusUuid } from './campus.js';
import {
	getEntryPrepRoom,
	getSchoolRoom,
	getSectionRoom,
	getUtilityRooms,
	joinUtilityRoom,
} from './onlineRoomService.js';

type SectionOverrides = {
	tournSettings?: Settings;
	eventSettings?: Settings;
	roundSettings?: Settings;
	panelSettings?: Settings;
	Room?: Record<string, unknown>;
};

// A section in event PF with one ballot: a judge and a one student entry, each with their own person
async function createSection(overrides: SectionOverrides = {}) {
	const { Tourn, Category, Event, Round } = await factories.tourn.createFull({
		tz: 'America/Chicago',
		settings: overrides.tournSettings,
		Event: { abbr: 'PF', settings: overrides.eventSettings },
		Round: { name: 1, settings: overrides.roundSettings },
	});
	const room = await factories.room.create({
		name: 'Room 101',
		url: 'https://zoom.test/room',
		password: 'roompass',
		judge_url: 'https://zoom.test/host',
		judge_password: 'hostpass',
		...overrides.Room,
	});
	const panel = await factories.panel.create({ round: Round.id, room: room.id, letter: 'A', settings: overrides.panelSettings });

	const judgePerson = await factories.person.create({ first: 'Jane', last: 'Judge' });
	const judge = await factories.judge.create({ person: judgePerson.id, category: Category.id, code: 'J1' });

	const studentPerson = await factories.person.create({ first: 'Sam', last: 'Student' });
	const student = await factories.student.create({ person: studentPerson.id, first: 'Sam', last: 'Student' });
	const school = await factories.school.create({ tourn: Tourn.id });
	const entry = await factories.entry.create({ event: Event.id, school: school.id, code: 'AB', name: 'Alpha Beta', students: [student.id] });

	const ballot = await factories.ballot.create({ panel: panel.id, judge: judge.id, entry: entry.id });

	return { Tourn, Category, Event, Round, room, panel, judge, judgePerson, student, studentPerson, school, entry, ballot };
}

type TestPerson = { id: number; first: string | null; last: string | null; email: string };

// the person's actor, holding a checker perm on each of the given resources, e.g. 'tourn:12'
function asPerson(person: TestPerson, site_admin = 0, ...checks: string[]): Actor {
	const actor = createActor(db, { id: person.id, first: person.first, last: person.last, email: person.email, site_admin });
	actor.grant(checks.map((check) => {
		const [scope, id] = check.split(':');
		return { scope, id: Number(id), role: 'checker' };
	}));
	return actor;
}

// each room looked up in its own tourn, as the routes do. isStaff grants the actor checker on that tourn
async function sectionRoom(sectionId: number, actor: Actor, { isStaff = false, observer }: { isStaff?: boolean, observer?: number } = {}) {
	const tourn = await panelRepo.getPanelTourn(db, sectionId);
	if (isStaff && tourn) actor.grant([{ scope: 'tourn', id: tourn.id, role: 'checker' }]);
	return await getSectionRoom(db, tourn?.id ?? 0, sectionId, actor, { observer });
}

async function schoolRoom(school: { id: number; tourn: number | null }, actor: Actor, isStaff = false) {
	if (isStaff && school.tourn) actor.grant([{ scope: 'tourn', id: school.tourn, role: 'checker' }]);
	return await getSchoolRoom(db, school.tourn ?? 0, school.id, actor);
}

async function prepRoom(entry: { id: number; event: number | null }, actor: Actor, isStaff = false) {
	const event = entry.event ? await eventRepo.getEvent(db, entry.event) : undefined;
	if (isStaff && event?.tourn) actor.grant([{ scope: 'tourn', id: event.tourn, role: 'checker' }]);
	return await getEntryPrepRoom(db, event?.tourn ?? 0, entry.id, actor);
}

describe('getSectionRoom', () => {
	it('returns null for a section that does not exist', async () => {
		const person = await factories.person.create();

		expect(await getSectionRoom(db, 1, 999999999, asPerson(person))).toBeNull();
	});

	it('returns null for a section in another tourn', async () => {
		const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'sync' } });
		const other = await factories.tourn.createFull();

		expect(await getSectionRoom(db, other.Tourn.id, panel.id, asPerson(judgePerson))).toBeNull();
	});

	it('returns null for a person with no part in the section', async () => {
		const { panel } = await createSection({ eventSettings: { online_mode: 'sync' } });
		const person = await factories.person.create();

		expect(await sectionRoom(panel.id, asPerson(person), { isStaff: false })).toBeNull();
	});

	describe('sync rooms', () => {
		it('gives judges the host link and password', async () => {
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'sync' } });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display).toEqual({ name: 'Room 101', joinable: true, hybrid: false, mapUrl: null });
			expect(room?.launch).toEqual({ url: 'https://zoom.test/host', password: 'hostpass', campus: null });
			expect(room?.log).toMatchObject({ tag: 'panel', panel: panel.id, judge: expect.any(Number) });
		});

		it('gives competitors the room link and password', async () => {
			const { panel, studentPerson, entry } = await createSection({ eventSettings: { online_mode: 'sync' } });

			const room = await sectionRoom(panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch).toEqual({ url: 'https://zoom.test/room', password: 'roompass', campus: null });
			expect(room?.log).toMatchObject({ entry: entry.id, judge: null });
		});

		it('gives tab staff the host link', async () => {
			const { panel } = await createSection({ eventSettings: { online_mode: 'sync' } });
			const person = await factories.person.create();

			const room = await sectionRoom(panel.id, asPerson(person), { isStaff: true });

			expect(room?.launch?.url).toBe('https://zoom.test/host');
		});

		it('uses the round override link first', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'sync' },
				roundSettings: { override_link: 'https://override.test' },
			});

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.url).toBe('https://override.test');
		});

		it('is not joinable without a link', async () => {
			const { panel, studentPerson } = await createSection({
				eventSettings: { online_mode: 'sync' },
				Room: { url: '', judge_url: null },
			});

			const room = await sectionRoom(panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.display.joinable).toBe(false);
			expect(room?.launch).toBeNull();
		});

		it('uses the room links when the round sets use_normal_rooms', async () => {
			const { panel, studentPerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus' },
				roundSettings: { use_normal_rooms: 1 },
			});

			const room = await sectionRoom(panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch).toEqual({ url: 'https://zoom.test/room', password: 'roompass', campus: null });
		});
	});

	describe('campus rooms', () => {
		it('launches Campus with the section uuid and the person as judge', async () => {
			const { panel, judgePerson, judge, Tourn, Event } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display).toEqual({ name: 'PF A', joinable: true, hybrid: false, mapUrl: null });
			expect(room?.launch?.url).toBe(config.campus.uri);
			expect(room?.launch?.campus).toMatchObject({
				source: 'tabroom',
				person_id: judgePerson.id,
				role: 'judge',
				object_id: `judge-${judge.id}`,
				displayName: 'Jane Judge',
				roomName: 'PF A',
				server: 'us-east-2',
				uuid: campusUuid(panel.id, 'A'),
				panel_id: panel.id,
				panel_type: 'panel',
				tourn_id: Tourn.id,
				event_id: Event.id,
				mode: 'nsda_campus',
			});
		});

		it('is joinable whether or not a Campus key is configured', async () => {
			const original = config.campus.key;
			config.campus.key = undefined;
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.joinable).toBe(true);
			config.campus.key = original;
		});

		it.each([
			[{}, 'AB'],
			[{ online_entry_display: 'code_first' }, 'AB Sam'],
			[{ online_entry_display: 'code_name' }, 'AB Alpha Beta'],
			[{ online_entry_display: 'name', online_prepend_role: 1 }, 'Entry - Alpha Beta'],
		])('names competitors by the event display settings %j', async (settings, expected) => {
			const { panel, studentPerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', ...settings } });

			const room = await sectionRoom(panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch?.campus).toMatchObject({ role: 'competitor', displayName: expected });
		});

		it.each([
			[{ online_judge_display: 'code' }, 'J1'],
			[{ online_judge_display: 'code_name', online_prepend_role: 1 }, 'Judge - J1 Jane Judge'],
		])('names judges by the event display settings %j', async (settings, expected) => {
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', ...settings } });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.displayName).toBe(expected);
		});

		it('treats a person who judges and competes in the section as the judge', async () => {
			const { panel, judgePerson, Event, school } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			const student = await factories.student.create({ person: judgePerson.id });
			const entry = await factories.entry.create({ event: Event.id, school: school.id, students: [student.id] });
			await factories.ballot.create({ panel: panel.id, entry: entry.id });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.role).toBe('judge');
		});

		it('lets tab staff and site admins in', async () => {
			const { panel } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_prepend_role: 1 } });
			const person = await factories.person.create({ first: 'Tia', last: 'Tab' });

			const tab = await sectionRoom(panel.id, asPerson(person), { isStaff: true });
			const admin = await sectionRoom(panel.id, asPerson(person, 1), { isStaff: false });

			expect(tab?.launch?.campus).toMatchObject({ role: 'tab', displayName: 'Tab - Tia Tab' });
			expect(admin?.launch?.campus).toMatchObject({ role: 'admin', displayName: 'Admin - Tia Tab' });
		});

		it('labels a site admin who is also tab staff as tab', async () => {
			const { Tourn, panel } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_prepend_role: 1 } });
			const person = await factories.person.create({ first: 'Tia', last: 'Tab' });
			await factories.permission.create({ person: person.id, tourn: Tourn.id, tag: 'tabber' });

			const room = await sectionRoom(panel.id, asPerson(person, 1));

			expect(room?.launch?.campus).toMatchObject({ role: 'tab', displayName: 'Tab - Tia Tab' });
		});

		it('uses the tourn campus_zone for the server', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus' },
				tournSettings: { campus_zone: 'us-west-2' },
			});

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.server).toBe('us-west-2');
		});

		it('meets in the matched event\'s section for events that share rooms', async () => {
			const other = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('event').set({ abbr: 'LD' }).where('id', '=', other.Event.id).execute();
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_event_match: other.Event.id } });

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.name).toBe('LD A');
			expect(room?.launch?.campus).toMatchObject({ uuid: campusUuid(other.panel.id, 'A'), panel_id: other.panel.id, event_id: other.Event.id });
			expect(room?.log.panel).toBe(other.panel.id);
		});

		it('shows the physical room and map for a hybrid section', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus', online_hybrid: 1 },
				panelSettings: { online_hybrid: 1 },
			});

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display).toEqual({ name: 'Room 101', joinable: true, hybrid: true, mapUrl: 'https://zoom.test/room' });
			expect(room?.launch?.campus).toMatchObject({ roomName: 'Room 101', hybrid: 1 });
		});
	});

	it('is an in-person room for a section of a hybrid event not marked hybrid', async () => {
		const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_hybrid: 1 } });

		const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

		expect(room?.display).toEqual({ name: 'Room 101', joinable: false, hybrid: false, mapUrl: 'https://zoom.test/room' });
		expect(room?.launch).toBeNull();
	});

	it.each(['async', 'public_jitsi', 'public_jitsi_observers', null])('is not joinable in online mode %s', async (mode) => {
		const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: mode } });

		const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

		expect(room?.display).toEqual({ name: 'Room 101', joinable: false, hybrid: false, mapUrl: null });
	});

	describe('closing', () => {
		it('stays open for an hour after the ballots are confirmed', async () => {
			const { panel, judgePerson, ballot } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('ballot').set({ audit: 1 }).where('id', '=', ballot.id).execute();

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.joinable).toBe(true);
		});

		it('closes an hour after the ballots are confirmed', async () => {
			const { panel, judgePerson, ballot } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('ballot')
				.set({ audit: 1, timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) })
				.where('id', '=', ballot.id)
				.execute();

			const room = await sectionRoom(panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.joinable).toBe(false);
			expect(room?.launch).toBeNull();
		});
	});

	describe('observers', () => {
		async function createCoach(schoolId: number) {
			const chapter = await factories.chapter.create();
			await db.updateTable('school').set({ chapter: chapter.id }).where('id', '=', schoolId).execute();
			const coach = await factories.person.create({ first: 'Cory', last: 'Coach' });
			await factories.permission.create({ person: coach.id, chapter: chapter.id, tag: 'chapter' });
			return coach;
		}

		it('lets a coach observe their entry in an observers room', async () => {
			const { panel, school, entry } = await createSection({ eventSettings: { online_mode: 'nsda_campus_observers', online_prepend_role: 1 } });
			const coach = await createCoach(school.id);

			const room = await sectionRoom(panel.id, asPerson(coach), { isStaff: false, observer: entry.id });

			expect(room?.launch?.campus).toMatchObject({ role: 'observer', panel_type: 'observer', object_id: String(entry.id), displayName: 'Obsv - Cory Coach' });
			expect(room?.log).toMatchObject({ tag: 'observer', entry: entry.id });
		});

		it('does not let coaches observe a room without observers', async () => {
			const { panel, school, entry } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			const coach = await createCoach(school.id);

			expect(await sectionRoom(panel.id, asPerson(coach), { isStaff: false, observer: entry.id })).toBeNull();
		});

		it('does not let a coach observe another school\'s entry', async () => {
			const { panel, entry } = await createSection({ eventSettings: { online_mode: 'nsda_campus_observers' } });
			const otherSchool = await factories.school.create();
			const coach = await createCoach(otherSchool.id);

			expect(await sectionRoom(panel.id, asPerson(coach), { isStaff: false, observer: entry.id })).toBeNull();
		});
	});
});

type TournOverrides = {
	tournSettings?: Settings;
	eventSettings?: Settings;
	start?: Date;
	end?: Date;
};

// A running tourn with a Campus event, a school whose chapter has a coach, and an entry with a student
async function createTourn(overrides: TournOverrides = {}) {
	const { Tourn, Category, Event } = await factories.tourn.createFull({
		tz: 'America/Chicago',
		...(overrides.start && { start: overrides.start }),
		...(overrides.end && { end: overrides.end }),
		settings: overrides.tournSettings,
		Event: { abbr: 'PF', settings: { online_mode: 'nsda_campus', ...overrides.eventSettings } },
	});

	const chapter = await factories.chapter.create();
	const school = await factories.school.create({ tourn: Tourn.id, chapter: chapter.id, name: 'Lincoln HS' });
	const coach = await factories.person.create({ first: 'Cory', last: 'Coach' });
	await factories.permission.create({ person: coach.id, chapter: chapter.id, tag: 'chapter' });

	const studentPerson = await factories.person.create({ first: 'Sam', last: 'Student' });
	const student = await factories.student.create({ person: studentPerson.id });
	const entry = await factories.entry.create({ event: Event.id, school: school.id, code: 'AB', students: [student.id] });

	return { Tourn, Category, Event, school, coach, studentPerson, entry };
}

describe('getSchoolRoom', () => {
	it('opens the squad room in Campus for the school\'s coaches', async () => {
		const { Tourn, school, coach } = await createTourn();

		const room = await schoolRoom(school, asPerson(coach));

		expect(room?.display).toEqual({ name: 'Lincoln HS Squad Room', joinable: true, hybrid: false, mapUrl: null });
		expect(room?.launch?.campus).toMatchObject({
			mode: 'nsda_campus',
			uuid: campusUuid('school', school.id),
			roomName: 'Lincoln HS Squad Room',
			displayName: 'Cory Coach',
			panel_id: school.id,
			panel_type: 'school',
			tourn_id: Tourn.id,
			server: 'us-east-2',
		});
		expect(room?.log).toEqual({ tag: 'school', tourn: Tourn.id, school: school.id, description: 'Entered Lincoln HS Squad Room from Tabroom' });
	});

	it('lets the school\'s students and tab staff in', async () => {
		const { school, studentPerson } = await createTourn();
		const staff = await factories.person.create();

		expect(await schoolRoom(school, asPerson(studentPerson))).not.toBeNull();
		expect(await schoolRoom(school, asPerson(staff), true)).not.toBeNull();
	});

	it('returns null for a person with no part in the school', async () => {
		const { school } = await createTourn();
		const person = await factories.person.create();

		expect(await schoolRoom(school, asPerson(person))).toBeNull();
	});

	it('returns null for a school that opted out of squad rooms', async () => {
		const { school, coach } = await createTourn();
		await db.insertInto('school_setting').values({ school: school.id, tag: 'no_squad_room', value: '1' }).execute();

		expect(await schoolRoom(school, asPerson(coach))).toBeNull();
	});

	it('returns null when the tourn has no Campus events', async () => {
		const { school, coach } = await createTourn({ eventSettings: { online_mode: 'sync' } });

		expect(await schoolRoom(school, asPerson(coach))).toBeNull();
	});
});

describe('getEntryPrepRoom', () => {
	it('opens the prep room in Campus for the entry\'s students', async () => {
		const { Tourn, Event, entry, studentPerson } = await createTourn({ eventSettings: { online_prep: 1 } });

		const room = await prepRoom(entry, asPerson(studentPerson));

		expect(room?.display).toEqual({ name: 'AB Prep Room', joinable: true, hybrid: false, mapUrl: null });
		expect(room?.launch?.campus).toMatchObject({
			uuid: campusUuid('entry', entry.id),
			panel_id: entry.id,
			panel_type: 'entry',
			event_id: Event.id,
			displayName: 'Sam Student',
		});
		expect(room?.log).toEqual({ tag: 'prep', tourn: Tourn.id, entry: entry.id, description: 'Entered AB Prep Room from Tabroom' });
	});

	it('lets the entry\'s coaches in', async () => {
		const { entry, coach } = await createTourn({ eventSettings: { online_prep: 1 } });

		expect(await prepRoom(entry, asPerson(coach))).not.toBeNull();
	});

	it('returns null for an event without prep rooms', async () => {
		const { entry, studentPerson } = await createTourn();

		expect(await prepRoom(entry, asPerson(studentPerson))).toBeNull();
	});

	it('returns null for a person with no part in the entry', async () => {
		const { entry } = await createTourn({ eventSettings: { online_prep: 1 } });
		const person = await factories.person.create();

		expect(await prepRoom(entry, asPerson(person))).toBeNull();
	});
});

describe('utility rooms', () => {
	// a judge in the tourn's category, with their own person
	async function createJudge(categoryId: number) {
		const person = await factories.person.create({ first: 'Jane', last: 'Judge' });
		await factories.judge.create({ person: person.id, category: categoryId });
		return person;
	}

	type Rooms = Record<string, unknown>[];

	// saves the rooms the way classic does, as JSON in the tourn's online_rooms setting
	async function createRooms(rooms: Rooms | ((tourn: Awaited<ReturnType<typeof createTourn>>) => Rooms), overrides: TournOverrides = {}) {
		const tourn = await createTourn(overrides);
		const value = typeof rooms === 'function' ? rooms(tourn) : rooms;
		await db.insertInto('tourn_setting')
			.values({ tourn: tourn.Tourn.id, tag: 'online_rooms', value: 'json', value_text: JSON.stringify(value) })
			.execute();
		return tourn;
	}

	const names = (rooms: Awaited<ReturnType<typeof getUtilityRooms>>) => rooms?.map(room => room.display.name);

	it('shows each audience its rooms', async () => {
		const { Tourn, Category, Event, coach, studentPerson } = await createRooms([
			{ id: '1', name: 'Entry Lounge', type: 'link', url: 'https://zoom.test/entry', access: 'entry', event_id: '' },
			{ id: '2', name: 'Other Event Lounge', type: 'link', url: 'https://zoom.test/other', access: 'entry', event_id: '999999999' },
			{ id: '3', name: 'Judge Lounge', type: 'jitsi', uuid: 'judgelounge', access: 'judge', category_id: '' },
			{ id: '4', name: 'Coach Lounge', type: 'jitsi', uuid: 'coachlounge', access: 'coach' },
			{ id: '5', name: 'Tab Room', type: 'jitsi', uuid: 'tabroom', access: 'tab' },
		]);
		const judge = await createJudge(Category.id);

		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(studentPerson)))).toEqual(['Entry Lounge']);
		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(judge)))).toEqual(['Judge Lounge']);
		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(coach)))).toEqual(['Coach Lounge']);
		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(studentPerson, 0, `event:${Event.id}`)))).toEqual(['Entry Lounge']);
	});

	it('shows event and category tab rooms to their checkers', async () => {
		const { Tourn, Category, Event } = await createRooms(({ Category, Event }) => [
			{ id: '1', name: 'Event Tab', type: 'jitsi', uuid: 'eventtab', access: 'tab', event_id: String(Event.id) },
			{ id: '2', name: 'Category Tab', type: 'jitsi', uuid: 'categorytab', access: 'tab', category_id: String(Category.id) },
		]);
		const person = await factories.person.create();

		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(person, 0, `event:${Event.id}`)))).toEqual(['Event Tab']);
		// a category checker checks in that category's events too
		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(person, 0, `category:${Category.id}`)))).toEqual(['Event Tab', 'Category Tab']);
	});

	it('shows tab staff every room, marked as tab', async () => {
		const { Tourn } = await createRooms([
			{ id: '1', name: 'Entry Lounge', type: 'link', url: 'https://zoom.test/entry', access: 'entry' },
			{ id: '2', name: 'Tab Room', type: 'jitsi', uuid: 'tabroom', access: 'tab' },
		]);
		const person = await factories.person.create({ first: 'Tia', last: 'Tab' });

		const rooms = await getUtilityRooms(db, Tourn.id, asPerson(person, 0, `tourn:${Tourn.id}`));

		expect(names(rooms)).toEqual(['Entry Lounge', 'Tab Room']);
		expect(rooms?.[1].launch?.campus).toMatchObject({
			uuid: 'tabroom',
			panel_id: 'tabroom',
			panel_type: 'util',
			displayName: 'Tia Tab -Tab',
		});
		expect(rooms?.[1].log).toEqual({ tag: 'campus', tourn: Tourn.id, uuid: 'tabroom', description: 'Entered Tab Room from Tabroom' });
	});

	it('marks site admins as tab only when they are tab staff', async () => {
		const { Tourn } = await createRooms([
			{ id: '1', name: 'Tab Room', type: 'jitsi', uuid: 'tabroom', access: 'tab' },
		]);
		const admin = await factories.person.create({ first: 'Ada', last: 'Admin' });
		const tabAdmin = await factories.person.create({ first: 'Tia', last: 'Tab' });
		await factories.permission.create({ person: tabAdmin.id, tourn: Tourn.id, tag: 'checker' });

		const adminRooms = await getUtilityRooms(db, Tourn.id, asPerson(admin, 1));
		const tabAdminRooms = await getUtilityRooms(db, Tourn.id, asPerson(tabAdmin, 1));

		expect(adminRooms?.[0].launch?.campus?.displayName).toBe('Ada Admin');
		expect(tabAdminRooms?.[0].launch?.campus?.displayName).toBe('Tia Tab -Tab');
	});

	it('marks coaches in Campus rooms', async () => {
		const { Tourn, coach } = await createRooms([
			{ id: '1', name: 'Coach Lounge', type: 'jitsi', uuid: 'coachlounge', access: 'coach' },
		]);

		const rooms = await getUtilityRooms(db, Tourn.id, asPerson(coach));

		expect(rooms?.[0].launch?.campus?.displayName).toBe('Cory Coach -Coach');
	});

	it('opens link rooms at their link, and is not joinable without one', async () => {
		const { Tourn } = await createRooms([
			{ id: '1', name: 'Zoom Lounge', type: 'link', url: 'https://zoom.test/lounge', access: 'tab' },
			{ id: '2', name: 'Empty Lounge', type: 'link', url: '', access: 'tab' },
		]);
		const person = await factories.person.create();

		const rooms = await getUtilityRooms(db, Tourn.id, asPerson(person, 0, `tourn:${Tourn.id}`));

		expect(rooms?.[0].display).toEqual({ id: 1, name: 'Zoom Lounge', joinable: true, hybrid: false, mapUrl: null });
		expect(rooms?.[0].launch).toEqual({ url: 'https://zoom.test/lounge', password: null, campus: null });
		expect(rooms?.[0].log.uuid).toBe('1');
		expect(rooms?.[1].display.joinable).toBe(false);
	});

	it('hides rooms from attendees outside the tourn\'s dates', async () => {
		const { Tourn, coach } = await createRooms(
			[{ id: '1', name: 'Coach Lounge', type: 'jitsi', uuid: 'coachlounge', access: 'coach' }],
			{ start: new Date(Date.now() + 24 * 60 * 60 * 1000), end: new Date(Date.now() + 48 * 60 * 60 * 1000) },
		);
		const person = await factories.person.create();

		expect(await getUtilityRooms(db, Tourn.id, asPerson(coach))).toEqual([]);
		expect(names(await getUtilityRooms(db, Tourn.id, asPerson(person, 0, `tourn:${Tourn.id}`)))).toEqual(['Coach Lounge']);
	});

	it('returns null for a tourn that does not exist', async () => {
		const person = await factories.person.create();

		expect(await getUtilityRooms(db, 999999999, asPerson(person))).toBeNull();
	});

	describe('joinUtilityRoom', () => {
		it('logs the join and returns the link', async () => {
			const { Tourn, coach } = await createRooms([
				{ id: '1', name: 'Coach Lounge', type: 'link', url: 'https://zoom.test/coach', access: 'coach' },
			]);

			const joined = await joinUtilityRoom(db, Tourn.id, 1, 'Coach Lounge', asPerson(coach));

			expect(joined).toEqual({ result: 'joined', join: { url: 'https://zoom.test/coach', token: null, password: null } });
			const logs = await db.selectFrom('campus_log').selectAll().where('tourn', '=', Tourn.id).where('person', '=', coach.id).execute();
			expect(logs).toEqual([expect.objectContaining({ tag: 'campus', uuid: '1' })]);
		});

		it('reports a room that changed since the list was loaded', async () => {
			const { Tourn, coach } = await createRooms([
				{ id: '1', name: 'Coach Lounge', type: 'link', url: 'https://zoom.test/coach', access: 'coach' },
			]);

			expect(await joinUtilityRoom(db, Tourn.id, 1, 'Old Lounge', asPerson(coach))).toEqual({ result: 'changed' });
		});

		it('does not find a room the person can\'t see', async () => {
			const { Tourn, studentPerson } = await createRooms([
				{ id: '1', name: 'Coach Lounge', type: 'link', url: 'https://zoom.test/coach', access: 'coach' },
			]);

			expect(await joinUtilityRoom(db, Tourn.id, 1, 'Coach Lounge', asPerson(studentPerson))).toEqual({ result: 'notFound' });
		});
	});
});
