import type { DebateBallotSubmission } from '@tabroom/types';
import { db } from '../../data/database.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import scoreRepo from '../../repos/scoreRepo.js';
import factories from '../../../tests/factories/index.js';
import { loadBallotInputs } from './loadBallotInputs.js';
import { saveBallot, saveBallotFeedback } from './saveBallot.js';

// An unscored LD prelim counting wins and points: AFF1 (Ana Adams) on Aff, NEG2 (Ben Brown) on Neg
const createPanel = async (opts: { eventType?: string, eventSettings?: Record<string, string> } = {}) => {
	const person = await factories.person.create();
	const tourn = await factories.tourn.create();
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id, type: opts.eventType ?? 'debate', settings: opts.eventSettings ?? {} });
	const timeslot = await factories.timeslot.create({ tourn: tourn.id });
	const protocol = await factories.protocol.create({ tourn: tourn.id, tiebreaks: ['winloss', 'points'] });
	const round = await factories.round.create({ event: event.id, timeslot: timeslot.id, protocol: protocol.id, type: 'prelim' });
	const panel = await factories.panel.create({ round: round.id });
	const judge = await factories.judge.create({ person: person.id, category: category.id, last: 'Doe' });

	const ana = await factories.student.create({ first: 'Ana', last: 'Adams' });
	const ben = await factories.student.create({ first: 'Ben', last: 'Brown' });
	const aff = await factories.entry.create({ event: event.id, code: 'AFF1', students: [ana.id] });
	const neg = await factories.entry.create({ event: event.id, code: 'NEG2', students: [ben.id] });
	const affBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: aff.id, side: 1 });
	const negBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: neg.id, side: 2 });

	return { person, judge, panel, aff, neg, ana, ben, affBallot, negBallot };
};

type Panel = Awaited<ReturnType<typeof createPanel>>;

// Aff wins 29 to 28, with no feedback
const submission = (panel: Panel, overrides: Partial<DebateBallotSubmission> = {}): DebateBallotSubmission => ({
	eventType: 'debate',
	winner: panel.affBallot.id,
	lowPointWin: false,
	points: [
		{ student: panel.ana.id, points: 29 },
		{ student: panel.ben.id, points: 28 },
	],
	feedback: { rfd: null, Entries: [] },
	...overrides,
});

const save = async (panel: Panel, body: DebateBallotSubmission, dryRun = false) => {
	const inputs = await loadBallotInputs(db, panel.judge.id, panel.panel.id);
	if (!inputs) throw new Error('No inputs');
	return await saveBallot(db, inputs, body, { person: panel.person.id, dryRun });
};

const scores = async (panel: Panel) => await db.selectFrom('score')
	.select(['ballot', 'student', 'tag', 'value', 'content'])
	.where('ballot', 'in', [panel.affBallot.id, panel.negBallot.id])
	.orderBy('tag').orderBy('ballot')
	.execute();

const changeLogs = async (panel: Panel) => await db.selectFrom('change_log')
	.select(['person', 'judge', 'tag', 'description'])
	.where('panel', '=', panel.panel.id)
	.execute();

describe('saveBallot', () => {
	it('writes the winner and points, and logs the vote', async () => {
		const panel = await createPanel();

		const saved = await save(panel, submission(panel));

		expect(saved).toEqual({
			result: 'saved',
			review: {
				eventType: 'debate',
				saved: true,
				winner: panel.affBallot.id,
				lowPointWin: false,
				Entries: [
					{
						ballot: panel.affBallot.id, entry: panel.aff.id, code: 'AFF1', sideLabel: 'Aff',
						Students: [{ id: panel.ana.id, first: 'Ana', last: 'Adams', points: 29 }],
					},
					{
						ballot: panel.negBallot.id, entry: panel.neg.id, code: 'NEG2', sideLabel: 'Neg',
						Students: [{ id: panel.ben.id, first: 'Ben', last: 'Brown', points: 28 }],
					},
				],
			},
		});
		expect(await scores(panel)).toEqual([
			{ ballot: panel.affBallot.id, student: panel.ana.id, tag: 'point', value: 29, content: null },
			{ ballot: panel.negBallot.id, student: panel.ben.id, tag: 'point', value: 28, content: null },
			{ ballot: panel.affBallot.id, student: 0, tag: 'winloss', value: 1, content: null },
			{ ballot: panel.negBallot.id, student: 0, tag: 'winloss', value: 0, content: null },
		]);
		expect(await changeLogs(panel)).toEqual([
			{ person: panel.person.id, judge: panel.judge.id, tag: 'judge', description: 'Doe voted for AFF1 on the Aff' },
		]);
	});

	it('leaves the ballot unconfirmed', async () => {
		const panel = await createPanel();

		await save(panel, submission(panel));

		const ballots = await db.selectFrom('ballot').select('audit').where('panel', '=', panel.panel.id).execute();
		expect(ballots.map(ballot => ballot.audit)).toEqual([0, 0]);
	});

	it('replaces the scores on a resubmit', async () => {
		const panel = await createPanel();

		await save(panel, submission(panel));
		const resaved = await save(panel, submission(panel, {
			winner: panel.negBallot.id,
			points: [{ student: panel.ana.id, points: 27 }, { student: panel.ben.id, points: 28 }],
		}));

		expect(resaved.result).toBe('saved');
		expect(await scores(panel)).toEqual([
			{ ballot: panel.affBallot.id, student: panel.ana.id, tag: 'point', value: 27, content: null },
			{ ballot: panel.negBallot.id, student: panel.ben.id, tag: 'point', value: 28, content: null },
			{ ballot: panel.affBallot.id, student: 0, tag: 'winloss', value: 0, content: null },
			{ ballot: panel.negBallot.id, student: 0, tag: 'winloss', value: 1, content: null },
		]);
	});

	describe('feedback sent with the ballot', () => {
		it('saves it with the scores', async () => {
			const panel = await createPanel();

			await save(panel, submission(panel, {
				feedback: { rfd: '<p>Framework</p>', Entries: [{ ballot: panel.negBallot.id, comments: '<p>Slow down</p>' }] },
			}));

			expect((await scores(panel)).filter(score => score.tag === 'rfd' || score.tag === 'comments')).toEqual([
				{ ballot: panel.negBallot.id, student: 0, tag: 'comments', value: 0, content: '<p>Slow down</p>' },
				{ ballot: panel.affBallot.id, student: 0, tag: 'rfd', value: 0, content: '<p>Framework</p>' },
				{ ballot: panel.negBallot.id, student: 0, tag: 'rfd', value: 0, content: '<p>Framework</p>' },
			]);
		});

		it('replaces the autosaved drafts, deleting feedback that wasn\'t sent', async () => {
			const panel = await createPanel();
			await factories.score.create({ ballot: panel.affBallot.id, tag: 'rfd', value: 0, content: '<p>Draft</p>' });
			await factories.score.create({ ballot: panel.affBallot.id, tag: 'comments', value: 0, content: '<p>Draft for Aff</p>' });
			await factories.score.create({ ballot: panel.negBallot.id, tag: 'comments', value: 0, content: '<p>Draft for Neg</p>' });

			await save(panel, submission(panel, {
				feedback: { rfd: null, Entries: [{ ballot: panel.negBallot.id, comments: '<p>Final for Neg</p>' }] },
			}));

			expect((await scores(panel)).filter(score => score.tag === 'rfd' || score.tag === 'comments')).toEqual([
				{ ballot: panel.negBallot.id, student: 0, tag: 'comments', value: 0, content: '<p>Final for Neg</p>' },
			]);
		});

		it('checks word minimums against the text sent', async () => {
			const panel = await createPanel({ eventSettings: { rfd_plz: '3' } });

			const saved = await save(panel, submission(panel, { feedback: { rfd: '<p>Aff won the framework</p>', Entries: [] } }));

			expect(saved.result).toBe('saved');
		});

		it('ignores an autosaved draft that wasn\'t sent', async () => {
			const panel = await createPanel({ eventSettings: { rfd_plz: '3' } });
			await factories.score.create({ ballot: panel.affBallot.id, tag: 'rfd', value: 0, content: '<p>Aff won the framework</p>' });

			const saved = await save(panel, submission(panel));

			expect(saved).toMatchObject({ result: 'invalid', errors: [{ field: 'rfd' }] });
		});

		it('counts an entry left out as having no comments', async () => {
			const panel = await createPanel({ eventSettings: { comments_plz: '2' } });

			const saved = await save(panel, submission(panel, {
				feedback: { rfd: null, Entries: [{ ballot: panel.affBallot.id, comments: '<p>Nice cross</p>' }] },
			}));

			expect(saved).toMatchObject({ result: 'invalid', errors: [{ field: 'comments', ballot: panel.negBallot.id }] });
		});

		it('rejects comments for entries that aren\'t on the ballot', async () => {
			const panel = await createPanel();
			const other = await factories.ballot.create();

			const saved = await save(panel, submission(panel, { feedback: { rfd: null, Entries: [{ ballot: other.id, comments: '<p>Hi</p>' }] } }));

			expect(saved).toEqual({
				result: 'invalid',
				errors: [{ field: 'comments', ballot: other.id, message: 'That entry isn\'t on your ballot.' }],
			});
		});

		it.each([
			['an invalid ballot', { winner: null }, false],
			['a dry run', {}, true],
		] as const)('saves nothing for %s', async (_case, overrides, dryRun) => {
			const panel = await createPanel();

			await save(panel, submission(panel, { ...overrides, feedback: { rfd: '<p>Framework</p>', Entries: [] } }), dryRun);

			expect(await scores(panel)).toEqual([]);
		});
	});

	it('reports a confirmed low-point win in the review', async () => {
		const panel = await createPanel();

		const saved = await save(panel, submission(panel, {
			points: [{ student: panel.ana.id, points: 27 }, { student: panel.ben.id, points: 28 }],
			lowPointWin: true,
		}));

		expect(saved).toMatchObject({ result: 'saved', review: { lowPointWin: true } });
	});

	it('only validates on a dry run', async () => {
		const panel = await createPanel();

		const saved = await save(panel, submission(panel), true);

		expect(saved).toMatchObject({ result: 'valid', review: { saved: false, winner: panel.affBallot.id } });
		expect(await scores(panel)).toEqual([]);
		expect(await changeLogs(panel)).toEqual([]);
	});

	it('returns the errors and writes nothing for an invalid ballot', async () => {
		const panel = await createPanel();

		const saved = await save(panel, submission(panel, { winner: null }));

		expect(saved).toEqual({
			result: 'invalid',
			errors: [{ field: 'winner', message: 'You didn\'t choose a winner. There are no ties in debate, though there are sometimes tears. Be strong.' }],
		});
		expect(await scores(panel)).toEqual([]);
	});

	it('refuses a confirmed ballot', async () => {
		const panel = await createPanel();
		await db.updateTable('ballot').set({ audit: 1 }).where('panel', '=', panel.panel.id).execute();

		expect(await save(panel, submission(panel))).toEqual({ result: 'confirmed' });
		expect(await scores(panel)).toEqual([]);
	});

	it('refuses a ballot the beta can\'t handle', async () => {
		const panel = await createPanel({ eventSettings: { ballot_rubric: '1' } });

		expect(await save(panel, submission(panel))).toEqual({ result: 'unsupported', reasons: ['event setting ballot_rubric'] });
	});

	it('refuses when the ballot changed after it was loaded', async () => {
		const panel = await createPanel();
		const inputs = await loadBallotInputs(db, panel.judge.id, panel.panel.id);
		if (!inputs) throw new Error('No inputs');
		await db.updateTable('ballot').set({ audit: 1 }).where('id', '=', panel.negBallot.id).execute();

		expect(await saveBallot(db, inputs, submission(panel), { person: panel.person.id })).toEqual({ result: 'changed' });
		expect(await scores(panel)).toEqual([]);
	});

	it('rolls back every write when one fails', async () => {
		const panel = await createPanel();
		const spy = vi.spyOn(changeLogRepo, 'createChangeLog').mockRejectedValueOnce(new Error('boom'));

		await expect(save(panel, submission(panel))).rejects.toThrow('boom');

		spy.mockRestore();
		expect(await scores(panel)).toEqual([]);
	});

	describe('classic cleanup', () => {
		it('closes ballots for inactive entries and doesn\'t score them', async () => {
			const panel = await createPanel();
			// active is set by a trigger from dropped, waitlist and unconfirmed
			await db.updateTable('entry').set({ dropped: 1 }).where('id', '=', panel.neg.id).execute();

			const saved = await save(panel, submission(panel, { points: [{ student: panel.ana.id, points: 29 }] }));

			expect(saved).toMatchObject({ result: 'saved', review: { Entries: [{ ballot: panel.affBallot.id }] } });
			expect(await scores(panel)).toEqual([
				{ ballot: panel.affBallot.id, student: panel.ana.id, tag: 'point', value: 29, content: null },
				{ ballot: panel.affBallot.id, student: 0, tag: 'winloss', value: 1, content: null },
			]);
			const neg = await db.selectFrom('ballot').select('audit').where('id', '=', panel.negBallot.id).executeTakeFirst();
			expect(neg?.audit).toBe(1);
		});

		it('deletes the judge\'s ballot rows with no entry', async () => {
			const panel = await createPanel();
			const empty = await factories.ballot.create({ judge: panel.judge.id, panel: panel.panel.id, entry: null });

			await save(panel, submission(panel));

			expect(await db.selectFrom('ballot').select('id').where('id', '=', empty.id).executeTakeFirst()).toBeUndefined();
		});
	});
});

describe('saveBallotFeedback', () => {
	// A judge with ballots for two entries on a reviewed panel, in a tournament ending 2026-10-04
	const createFeedbackPanel = async () => {
		const tourn = await factories.tourn.create({ end: new Date('2026-10-04T23:00:00Z') });
		const event = await factories.event.create({ tourn: tourn.id });
		const round = await factories.round.create({ event: event.id });
		const panel = await factories.panel.create({ round: round.id, settings: { comments_reviewed: '1' } });
		const judge = await factories.judge.create();
		const aff = await factories.entry.create();
		const neg = await factories.entry.create();
		const affBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: aff.id, side: 1 });
		const negBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: neg.id, side: 2 });

		return { judge, panel, affBallot, negBallot };
	};

	type FeedbackPanel = Awaited<ReturnType<typeof createFeedbackPanel>>;

	const during = new Date('2026-10-03T15:00:00Z');

	const saveFeedback = async (panel: FeedbackPanel, body: Parameters<typeof saveBallotFeedback>[2], now = during) =>
		await saveBallotFeedback(db, { judge: panel.judge.id, panel: panel.panel.id, now }, body);

	const textScores = async (panel: FeedbackPanel) => await db.selectFrom('score')
		.select(['ballot', 'tag', 'student', 'content'])
		.where('ballot', 'in', [panel.affBallot.id, panel.negBallot.id])
		.orderBy('tag').orderBy('ballot')
		.execute();

	const reviewed = async (panel: FeedbackPanel) => await db.selectFrom('panel_setting')
		.select('value')
		.where('panel', '=', panel.panel.id)
		.where('tag', '=', 'comments_reviewed')
		.executeTakeFirst();

	it('saves the RFD on every one of the judge\'s ballots', async () => {
		const panel = await createFeedbackPanel();

		const saved = await saveFeedback(panel, { rfd: '<p>Aff won on framework</p>' });

		expect(saved).toEqual({
			result: 'saved',
			feedback: {
				rfd: '<p>Aff won on framework</p>',
				Entries: [
					{ ballot: panel.affBallot.id, comments: null },
					{ ballot: panel.negBallot.id, comments: null },
				],
			},
		});
		expect(await textScores(panel)).toEqual([
			{ ballot: panel.affBallot.id, tag: 'rfd', student: 0, content: '<p>Aff won on framework</p>' },
			{ ballot: panel.negBallot.id, tag: 'rfd', student: 0, content: '<p>Aff won on framework</p>' },
		]);
	});

	it('saves comments on only their entry\'s ballot', async () => {
		const panel = await createFeedbackPanel();

		await saveFeedback(panel, { Entries: [{ ballot: panel.negBallot.id, comments: '<p>Slow down</p>' }] });

		expect(await textScores(panel)).toEqual([
			{ ballot: panel.negBallot.id, tag: 'comments', student: 0, content: '<p>Slow down</p>' },
		]);
	});

	it('updates saved text and leaves fields that were left out', async () => {
		const panel = await createFeedbackPanel();
		await saveFeedback(panel, { rfd: '<p>First</p>', Entries: [{ ballot: panel.affBallot.id, comments: '<p>Nice</p>' }] });

		await saveFeedback(panel, { rfd: '<p>Second</p>' });

		expect(await textScores(panel)).toEqual([
			{ ballot: panel.affBallot.id, tag: 'comments', student: 0, content: '<p>Nice</p>' },
			{ ballot: panel.affBallot.id, tag: 'rfd', student: 0, content: '<p>Second</p>' },
			{ ballot: panel.negBallot.id, tag: 'rfd', student: 0, content: '<p>Second</p>' },
		]);
	});

	it.each([
		null,
		'',
		'<p></p>',
		'<p>&nbsp;</p>',
		'<p> </p><br>',
		'<script>alert(1)</script>',
	])('deletes text saved as %j, which has no words', async (empty) => {
		const panel = await createFeedbackPanel();
		await saveFeedback(panel, { rfd: '<p>First</p>', Entries: [{ ballot: panel.affBallot.id, comments: '<p>Nice</p>' }] });

		await saveFeedback(panel, { rfd: empty, Entries: [{ ballot: panel.affBallot.id, comments: empty }] });

		expect(await textScores(panel)).toEqual([]);
	});

	it('sanitizes the HTML', async () => {
		const panel = await createFeedbackPanel();

		const saved = await saveFeedback(panel, { rfd: '<p onclick="x()">Hi</p><script>alert(1)</script>' });

		expect(saved).toMatchObject({ feedback: { rfd: '<p>Hi</p>' } });
	});

	it('marks the panel\'s comments unreviewed when anything changes', async () => {
		const panel = await createFeedbackPanel();

		await saveFeedback(panel, { rfd: '<p>Framework</p>' });

		expect(await reviewed(panel)).toBeUndefined();
	});

	it('leaves the panel reviewed when nothing changes', async () => {
		const panel = await createFeedbackPanel();
		await saveFeedback(panel, { rfd: '<p>Framework</p>' });
		await db.insertInto('panel_setting').values({ panel: panel.panel.id, tag: 'comments_reviewed', value: '1' }).execute();

		await saveFeedback(panel, { rfd: '<p>Framework</p>' });

		expect(await reviewed(panel)).toEqual({ value: '1' });
	});

	it('stays editable after the ballot is confirmed', async () => {
		const panel = await createFeedbackPanel();
		await db.updateTable('ballot').set({ audit: 1 }).where('panel', '=', panel.panel.id).execute();

		expect(await saveFeedback(panel, { rfd: '<p>Framework</p>' })).toMatchObject({ result: 'saved' });
	});

	it('refuses changes after the tournament ends', async () => {
		const panel = await createFeedbackPanel();

		expect(await saveFeedback(panel, { rfd: '<p>Late</p>' }, new Date('2026-10-05T00:00:00Z'))).toEqual({ result: 'closed' });
		expect(await textScores(panel)).toEqual([]);
	});

	it('rejects comments for entries that aren\'t on the ballot, and saves nothing', async () => {
		const panel = await createFeedbackPanel();
		const other = await factories.ballot.create();

		const saved = await saveFeedback(panel, {
			rfd: '<p>Framework</p>',
			Entries: [{ ballot: other.id, comments: '<p>Hi</p>' }],
		});

		expect(saved).toEqual({
			result: 'invalid',
			errors: [{ field: 'comments', ballot: other.id, message: 'That entry isn\'t on your ballot.' }],
		});
		expect(await textScores(panel)).toEqual([]);
	});

	it('rejects comments sent twice for one entry', async () => {
		const panel = await createFeedbackPanel();

		const saved = await saveFeedback(panel, { Entries: [
			{ ballot: panel.affBallot.id, comments: '<p>One</p>' },
			{ ballot: panel.affBallot.id, comments: '<p>Two</p>' },
		] });

		expect(saved).toMatchObject({ result: 'invalid', errors: [{ ballot: panel.affBallot.id, message: 'Comments were sent twice for that entry.' }] });
	});

	it('rolls back every write when one fails', async () => {
		const panel = await createFeedbackPanel();
		// The RFD's first ballot saves, then the second fails
		const createScores = scoreRepo.createScores;
		const spy = vi.spyOn(scoreRepo, 'createScores')
			.mockImplementationOnce(createScores)
			.mockRejectedValueOnce(new Error('boom'));

		await expect(saveFeedback(panel, { rfd: '<p>Framework</p>' })).rejects.toThrow('boom');

		spy.mockRestore();
		expect(await textScores(panel)).toEqual([]);
	});
});
