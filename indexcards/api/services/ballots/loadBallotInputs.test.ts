import factories from '../../../tests/factories/index.js';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import { ballotRules, SITE_SETTING_TAGS } from './ballotRules.js';
import { loadBallotInputs } from './loadBallotInputs.js';

// A judge's ballot on an unpublished debate prelim at a hidden tourn, flight 2,
// in a room, with settings at each level
const createBallotPanel = async () => {
	const tourn = await factories.tourn.create({ hidden: 1, settings: { nsda_nats: '1' } });
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id, type: 'debate', settings: { online_mode: 'async' } });
	const timeslot = await factories.timeslot.create({ tourn: tourn.id });
	const protocol = await factories.protocol.create({ tourn: tourn.id, tiebreaks: ['winloss', 'points'] });
	const round = await factories.round.create({
		event: event.id,
		timeslot: timeslot.id,
		protocol: protocol.id,
		type: 'prelim',
		published: 0,
		settings: { use_normal_rooms: '1' },
	});
	const room = await factories.room.create();
	const panel = await factories.panel.create({ round: round.id, room: room.id, flight: '2' });
	const judge = await factories.judge.create({ category: category.id });

	return { tourn, event, timeslot, round, room, panel, judge };
};

describe('loadBallotInputs', () => {
	it('loads the judge, panel, room, round, timeslot, event and tourn', async () => {
		const { tourn, event, timeslot, round, room, panel, judge } = await createBallotPanel();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.judge.id).toBe(judge.id);
		expect(inputs?.panel.id).toBe(panel.id);
		expect(inputs?.panel.flight).toBe('2');
		expect(inputs?.room?.id).toBe(room.id);
		expect(inputs?.round.id).toBe(round.id);
		expect(inputs?.timeslot.id).toBe(timeslot.id);
		expect(inputs?.event.id).toBe(event.id);
		expect(inputs?.tourn.id).toBe(tourn.id);
	});

	it('loads tourn, event and round settings', async () => {
		const { panel, judge } = await createBallotPanel();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.tourn.settings).toMatchObject({ nsda_nats: '1' });
		expect(inputs?.event.settings).toMatchObject({ online_mode: 'async' });
		expect(inputs?.round.settings).toMatchObject({ use_normal_rooms: '1' });
	});

	it('loads the event\'s category and the panel with their settings', async () => {
		const { event, panel, judge } = await createBallotPanel();
		await db.insertInto('category_setting').values({ category: event.category!, tag: 'ballot_school_codes', value: '1' }).execute();
		await db.insertInto('panel_setting').values({ panel: panel.id, tag: 'show_async', value: '1' }).execute();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.category.id).toBe(event.category);
		expect(inputs?.category.settings).toMatchObject({ ballot_school_codes: '1' });
		expect(inputs?.panel.settings).toMatchObject({ show_async: '1' });
	});

	it('loads the judge\'s ballots with their entries, students and scores', async () => {
		const { event, panel, judge } = await createBallotPanel();
		const ana = await factories.student.create({ first: 'Ana', last: 'Adams' });
		const entry = await factories.entry.create({ event: event.id, code: 'AFF1', students: [ana.id], settings: { ballot_notes: 'Needs a ramp' } });
		const ballot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: entry.id, side: 1 });
		await factories.score.create({ ballot: ballot.id, student: ana.id, tag: 'point', value: 28 });

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.ballots.map(b => b.id)).toEqual([ballot.id]);
		expect(inputs?.entries).toEqual([expect.objectContaining({ id: entry.id, code: 'AFF1', settings: { ballot_notes: 'Needs a ramp' } })]);
		expect(inputs?.students).toEqual([{ entry: entry.id, id: ana.id, first: 'Ana', last: 'Adams', pronoun: null }]);
		expect(inputs?.scores).toEqual([expect.objectContaining({ ballot: ballot.id, student: ana.id, tag: 'point', value: 28 })]);
		expect(inputs?.doubled).toEqual([]);
	});

	it('loads every site setting tag that exists', async () => {
		const { panel, judge } = await createBallotPanel();
		const rows = await db.selectFrom('tabroom_setting')
			.select(['tag', 'value_text'])
			.where('tag', 'in', [...SITE_SETTING_TAGS])
			.execute();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.site).toEqual(Object.fromEntries(rows.map(row => [row.tag, row.value_text])));
	});

	it('loads the round\'s tiebreak types', async () => {
		const { panel, judge } = await createBallotPanel();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.tbTypes).toEqual({ winloss: true, point: true, tv: false });
	});

	it('loads the event\'s topic', async () => {
		const { insertId } = await db.insertInto('topic').values({ tag: 'test', topic_text: 'Resolved: A.' }).executeTakeFirstOrThrow();
		const { event, panel, judge } = await createBallotPanel();
		await db.insertInto('event_setting').values({ event: event.id, tag: 'topic', value: String(insertId) }).execute();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.topic?.topic_text).toBe('Resolved: A.');
	});

	it('warns when the event\'s topic is missing', async () => {
		const warn = vi.spyOn(logger, 'warn');
		const { event, panel, judge } = await createBallotPanel();
		await db.insertInto('event_setting').values({ event: event.id, tag: 'topic', value: '999999999' }).execute();

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.topic).toBeNull();
		expect(warn).toHaveBeenCalledWith('Event topic setting points to a missing topic', { event: event.id, topic: 999999999 });
		warn.mockRestore();
	});

	it('loads no room for a panel without one', async () => {
		const { round, judge } = await createBallotPanel();
		const panel = await factories.panel.create({ round: round.id });

		const inputs = await loadBallotInputs(db, judge.id, panel.id);

		expect(inputs?.room).toBeNull();
	});

	it('returns undefined for a missing panel', async () => {
		const { judge } = await createBallotPanel();

		expect(await loadBallotInputs(db, judge.id, 999_999_999)).toBeUndefined();
	});

	it('throws for a missing judge', async () => {
		const { panel } = await createBallotPanel();

		await expect(loadBallotInputs(db, 999_999_999, panel.id)).rejects.toThrow();
	});

	it('throws when the panel has no round', async () => {
		const { judge } = await createBallotPanel();
		const panel = await factories.panel.create();

		await expect(loadBallotInputs(db, judge.id, panel.id)).rejects.toThrow();
	});

	it('feeds ballotRules', async () => {
		const { panel, judge } = await createBallotPanel();

		const rules = ballotRules((await loadBallotInputs(db, judge.id, panel.id))!);

		expect(rules.unsupported).toEqual([]);
		expect(rules.onlineMode).toBe('sync');
	});
});
