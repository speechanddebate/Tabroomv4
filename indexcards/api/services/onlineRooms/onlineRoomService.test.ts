import factories from '../../../tests/factories/index.js';
import { db } from '../../data/database.js';
import config from '../../config.js';
import type { Settings } from '../../repos/utils/index.js';
import { campusUuid } from './campus.js';
import { getSectionRoom, type RoomPerson } from './onlineRoomService.js';

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

const asPerson = (person: { id: number; first: string | null; last: string | null }, site_admin = 0): RoomPerson => ({
	id: person.id, first: person.first, last: person.last, site_admin,
});

describe('getSectionRoom', () => {
	it('returns null for a section that does not exist', async () => {
		const person = await factories.person.create();

		expect(await getSectionRoom(db, 999999999, asPerson(person), { isStaff: false })).toBeNull();
	});

	it('returns null for a person with no part in the section', async () => {
		const { panel } = await createSection({ eventSettings: { online_mode: 'sync' } });
		const person = await factories.person.create();

		expect(await getSectionRoom(db, panel.id, asPerson(person), { isStaff: false })).toBeNull();
	});

	describe('sync rooms', () => {
		it('gives judges the host link and password', async () => {
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'sync' } });

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display).toEqual({ name: 'Room 101', joinable: true, hybrid: false, mapUrl: null });
			expect(room?.launch).toEqual({ url: 'https://zoom.test/host', password: 'hostpass', campus: null });
			expect(room?.log).toMatchObject({ tag: 'panel', panel: panel.id, judge: expect.any(Number) });
		});

		it('gives competitors the room link and password', async () => {
			const { panel, studentPerson, entry } = await createSection({ eventSettings: { online_mode: 'sync' } });

			const room = await getSectionRoom(db, panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch).toEqual({ url: 'https://zoom.test/room', password: 'roompass', campus: null });
			expect(room?.log).toMatchObject({ entry: entry.id, judge: null });
		});

		it('gives tab staff the host link', async () => {
			const { panel } = await createSection({ eventSettings: { online_mode: 'sync' } });
			const person = await factories.person.create();

			const room = await getSectionRoom(db, panel.id, asPerson(person), { isStaff: true });

			expect(room?.launch?.url).toBe('https://zoom.test/host');
		});

		it('uses the round override link first', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'sync' },
				roundSettings: { override_link: 'https://override.test' },
			});

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.url).toBe('https://override.test');
		});

		it('is not joinable without a link', async () => {
			const { panel, studentPerson } = await createSection({
				eventSettings: { online_mode: 'sync' },
				Room: { url: '', judge_url: null },
			});

			const room = await getSectionRoom(db, panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.display.joinable).toBe(false);
			expect(room?.launch).toBeNull();
		});

		it('uses the room links when the round sets use_normal_rooms', async () => {
			const { panel, studentPerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus' },
				roundSettings: { use_normal_rooms: 1 },
			});

			const room = await getSectionRoom(db, panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch).toEqual({ url: 'https://zoom.test/room', password: 'roompass', campus: null });
		});
	});

	describe('campus rooms', () => {
		it('launches Campus with the section uuid and the person as judge', async () => {
			const { panel, judgePerson, judge, Tourn, Event } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

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

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

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

			const room = await getSectionRoom(db, panel.id, asPerson(studentPerson), { isStaff: false });

			expect(room?.launch?.campus).toMatchObject({ role: 'competitor', displayName: expected });
		});

		it.each([
			[{ online_judge_display: 'code' }, 'J1'],
			[{ online_judge_display: 'code_name', online_prepend_role: 1 }, 'Judge - J1 Jane Judge'],
		])('names judges by the event display settings %j', async (settings, expected) => {
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', ...settings } });

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.displayName).toBe(expected);
		});

		it('treats a person who judges and competes in the section as the judge', async () => {
			const { panel, judgePerson, Event, school } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			const student = await factories.student.create({ person: judgePerson.id });
			const entry = await factories.entry.create({ event: Event.id, school: school.id, students: [student.id] });
			await factories.ballot.create({ panel: panel.id, entry: entry.id });

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.role).toBe('judge');
		});

		it('lets tab staff and site admins in', async () => {
			const { panel } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_prepend_role: 1 } });
			const person = await factories.person.create({ first: 'Tia', last: 'Tab' });

			const tab = await getSectionRoom(db, panel.id, asPerson(person), { isStaff: true });
			const admin = await getSectionRoom(db, panel.id, asPerson(person, 1), { isStaff: false });

			expect(tab?.launch?.campus).toMatchObject({ role: 'tab', displayName: 'Tab - Tia Tab' });
			expect(admin?.launch?.campus).toMatchObject({ role: 'admin', displayName: 'Admin - Tia Tab' });
		});

		it('uses the tourn campus_zone for the server', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus' },
				tournSettings: { campus_zone: 'us-west-2' },
			});

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.launch?.campus?.server).toBe('us-west-2');
		});

		it('meets in the matched event\'s section for events that share rooms', async () => {
			const other = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('event').set({ abbr: 'LD' }).where('id', '=', other.Event.id).execute();
			const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_event_match: other.Event.id } });

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.name).toBe('LD A');
			expect(room?.launch?.campus).toMatchObject({ uuid: campusUuid(other.panel.id, 'A'), panel_id: other.panel.id, event_id: other.Event.id });
			expect(room?.log.panel).toBe(other.panel.id);
		});

		it('shows the physical room and map for a hybrid section', async () => {
			const { panel, judgePerson } = await createSection({
				eventSettings: { online_mode: 'nsda_campus', online_hybrid: 1 },
				panelSettings: { online_hybrid: 1 },
			});

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display).toEqual({ name: 'Room 101', joinable: true, hybrid: true, mapUrl: 'https://zoom.test/room' });
			expect(room?.launch?.campus).toMatchObject({ roomName: 'Room 101', hybrid: 1 });
		});
	});

	it('is an in-person room for a section of a hybrid event not marked hybrid', async () => {
		const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: 'nsda_campus', online_hybrid: 1 } });

		const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

		expect(room?.display).toEqual({ name: 'Room 101', joinable: false, hybrid: false, mapUrl: 'https://zoom.test/room' });
		expect(room?.launch).toBeNull();
	});

	it.each(['async', 'public_jitsi', null])('is not joinable in online mode %s', async (mode) => {
		const { panel, judgePerson } = await createSection({ eventSettings: { online_mode: mode } });

		const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

		expect(room?.display).toEqual({ name: 'Room 101', joinable: false, hybrid: false, mapUrl: null });
	});

	describe('closing', () => {
		it('stays open for an hour after the ballots are confirmed', async () => {
			const { panel, judgePerson, ballot } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('ballot').set({ audit: 1 }).where('id', '=', ballot.id).execute();

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

			expect(room?.display.joinable).toBe(true);
		});

		it('closes an hour after the ballots are confirmed', async () => {
			const { panel, judgePerson, ballot } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			await db.updateTable('ballot')
				.set({ audit: 1, timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) })
				.where('id', '=', ballot.id)
				.execute();

			const room = await getSectionRoom(db, panel.id, asPerson(judgePerson), { isStaff: false });

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

			const room = await getSectionRoom(db, panel.id, asPerson(coach), { isStaff: false, observer: entry.id });

			expect(room?.launch?.campus).toMatchObject({ role: 'observer', panel_type: 'observer', object_id: String(entry.id), displayName: 'Obsv - Cory Coach' });
			expect(room?.log).toMatchObject({ tag: 'observer', entry: entry.id });
		});

		it('does not let coaches observe a room without observers', async () => {
			const { panel, school, entry } = await createSection({ eventSettings: { online_mode: 'nsda_campus' } });
			const coach = await createCoach(school.id);

			expect(await getSectionRoom(db, panel.id, asPerson(coach), { isStaff: false, observer: entry.id })).toBeNull();
		});

		it('does not let a coach observe another school\'s entry', async () => {
			const { panel, entry } = await createSection({ eventSettings: { online_mode: 'nsda_campus_observers' } });
			const otherSchool = await factories.school.create();
			const coach = await createCoach(otherSchool.id);

			expect(await getSectionRoom(db, panel.id, asPerson(coach), { isStaff: false, observer: entry.id })).toBeNull();
		});
	});
});
