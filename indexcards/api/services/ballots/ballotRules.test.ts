import type { MockInstance } from 'vitest';
import factories from '../../../tests/factories/index.js';
import logger from '../../helpers/logger.js';
import type { Settings } from '../../repos/utils/index.js';
import { ballotEntries, ballotTimers, otherJudges, settingLines, feedbackScoring, ballotHeader, ballotRules, ballotStatus, ballotTopic, chairLabel, decisionDeadline, isOn, pointsScoring, roundName, roundStart, rulesText, savedWinner, sideLock, winlossScoring, type BallotRulesInput } from './ballotRules.js';

const recent = new Date('2026-10-01T00:00:00Z');
const old = new Date('2020-10-01T00:00:00Z');

const tourn = (settings: Settings | null, start = recent) => factories.tourn.mock({ start, settings });
const event = (settings: Settings | null) => factories.event.mock({ type: 'debate', settings });
const panel = (flight: string | null) => factories.panel.mock({ flight });

// A 14:00 prelim with a tiebreak protocol
const round = (overrides: Parameters<typeof factories.round.mock>[0] = {}) => factories.round.mock({
	type: 'prelim',
	start_time: new Date('2026-10-03T14:00:00Z'),
	protocol: 1,
	...overrides,
});

// One of the judge's ballot rows, ballot 11 for entry 1 on Aff, unopened, not chair, not confirmed
const ballot = (overrides: { id?: number, entry?: number, side?: number, audit?: number, chair?: number, judge_started?: Date | null } = {}) => ({
	id: 11,
	entry: 1,
	side: 1,
	audit: 0,
	chair: 0,
	judge_started: null,
	...overrides,
});

// A saved score on ballot 11
const score = (tag: string, overrides: { ballot?: number, student?: number, value?: number, content?: string | null } = {}) => ({
	ballot: 11,
	student: 0,
	tag,
	value: 1,
	content: null,
	...overrides,
});

// A student row as entryRepo.getEntryStudents returns it
const student = (entry: number, id: number, first: string, last: string, pronoun: string | null = null) => ({ entry, id, first, last, pronoun });

// A 14:00 debate prelim in a 13:00 timeslot, flight 1, with no settings, counting wins and
// speaker points, on an unopened ballot: entry 1 (AFF1) on Aff on ballot 11, entry 2 (NEG2)
// on Neg on ballot 12, two students each
const input = (overrides: Partial<BallotRulesInput> = {}): BallotRulesInput => ({
	tourn: tourn({}),
	judge: { id: 1 },
	category: factories.category.mock(),
	event: event({}),
	round: round(),
	timeslot: factories.timeslot.mock({ start: new Date('2026-10-03T13:00:00Z') }),
	panel: panel('1'),
	ballots: [ballot(), ballot({ id: 12, entry: 2, side: 2 })],
	scores: [],
	entries: [
		{ id: 1, code: 'AFF1', settings: {} },
		{ id: 2, code: 'NEG2', settings: {} },
	],
	students: [
		student(1, 101, 'Ana', 'Adams'),
		student(1, 102, 'Ben', 'Brown'),
		student(2, 201, 'Cai', 'Chen'),
		student(2, 202, 'Dee', 'Diaz'),
	],
	doubled: [],
	panelJudges: [],
	topic: null,
	site: {},
	tbTypes: { winloss: true, point: true },
	dueAff: null,
	...overrides,
});

describe('isOn', () => {
	it('follows perl truthiness for setting values', () => {
		expect(isOn('1')).toBe(true);
		expect(isOn('text')).toBe(true);
		expect(isOn({ a: 1 })).toBe(true);
		expect(isOn('0')).toBe(false);
		expect(isOn('')).toBe(false);
		expect(isOn(null)).toBe(false);
		expect(isOn(undefined)).toBe(false);
	});
});

describe('ballotRules', () => {
	it('supports a debate ballot', () => {
		expect(ballotRules(input()).unsupported).toEqual([]);
	});

	it('flags event types other than debate', () => {
		const rules = ballotRules(input({ event: factories.event.mock({ type: 'speech' }) }));

		expect(rules.unsupported).toContain('event type speech');
	});

	it.each([
		'rank',
		'entryWinloss',
		'entryRank',
		'bestPO',
		'refute',
		'tv',
	] as const)('flags protocols that count %s', (type) => {
		const rules = ballotRules(input({ tbTypes: { winloss: true, point: true, [type]: true } }));

		expect(rules.unsupported).toEqual([`tiebreak type ${type}`]);
	});

	it('flags rounds with no protocol', () => {
		expect(ballotRules(input({ round: round({ protocol: null }) })).unsupported).toEqual(['no protocol']);
	});

	it.each([
		'legion',
		'mock_trial_registration',
	])('flags tourns with %s', (tag) => {
		expect(ballotRules(input({ tourn: tourn({ [tag]: '1' }) })).unsupported).toEqual([`tourn setting ${tag}`]);
	});

	it.each([
		'ballot_rubric',
		'roles_rubric',
		'speakers_rubric',
		'chair_scores',
		'chair_winloss',
		'chair_only_outstanding',
		'big_questions',
		'wsdc_categories',
		'max_style_points',
		'max_content_points',
		'max_strategy_points',
		'max_poi_points',
		'lower_rules',
		'dumb_signature_line',
		'team_total_line',
		'flip_online',
		'show_async_links',
		'online_prep',
		'team_points',
	])('flags events with %s', (tag) => {
		expect(ballotRules(input({ event: event({ [tag]: '1' }) })).unsupported).toEqual([`event setting ${tag}`]);
	});

	it('flags events with no_side_constraints, where the judge also picks sides', () => {
		expect(ballotRules(input({ event: event({ no_side_constraints: '1' }) })).unsupported).toEqual([
			'event setting no_side_constraints',
			'side choice',
		]);
	});

	it('flags elims where the judge picks sides', () => {
		expect(ballotRules(input({ round: round({ type: 'elim' }) })).unsupported).toEqual(['side choice']);
	});

	it('supports elims where the sides are locked', () => {
		expect(ballotRules(input({ round: round({ type: 'elim' }), dueAff: 1 })).unsupported).toEqual([]);
	});

	it.each([
		'ballot_school_codes',
		'ballot_region_codes',
	])('flags categories with %s', (tag) => {
		expect(ballotRules(input({ category: factories.category.mock({ settings: { [tag]: '1' } }) })).unsupported).toEqual([`category setting ${tag}`]);
	});

	it('flags panels with show_async', () => {
		expect(ballotRules(input({ panel: factories.panel.mock({ settings: { show_async: '1' } }) })).unsupported).toEqual(['panel setting show_async']);
	});

	it('ignores tourn and event settings that are set to "0"', () => {
		const rules = ballotRules(input({ tourn: tourn({ legion: '0' }), event: event({ ballot_rubric: '0' }) }));

		expect(rules.unsupported).toEqual([]);
	});

	it('supports protocols that don\'t count win/loss', () => {
		expect(ballotRules(input({ tbTypes: { point: true } })).unsupported).toEqual([]);
	});

	it('ignores tiebreak types that are false', () => {
		const rules = ballotRules(input({ tbTypes: { winloss: true, point: true, rank: false } }));

		expect(rules.unsupported).toEqual([]);
	});

	it('includes the ballot header', () => {
		const rules = ballotRules(input({ tourn: tourn({ bias_statement: '<p>Own</p>' }) }));

		expect(rules.ballotHeader).toBe('<p>Own</p>');
	});

	it('includes the round start', () => {
		expect(ballotRules(input()).roundStart).toEqual(new Date('2026-10-03T14:00:00Z'));
	});

	it('includes the decision deadline', () => {
		const rules = ballotRules(input({ event: event({ prelim_decision_deadline: '90' }) }));

		expect(rules.decisionDeadline).toEqual(new Date('2026-10-03T15:30:00Z'));
	});

	it('reads null settings as none', () => {
		const rules = ballotRules(input({
			tourn: tourn(null),
			event: event(null),
			round: round({ settings: null }),
		}));

		expect(rules.onlineMode).toBeNull();
		expect(rules.decisionDeadline).toBeNull();
	});

	describe('onlineMode', () => {
		const normalRooms = round({ settings: { use_normal_rooms: '1' } });

		it('is the event online_mode', () => {
			expect(ballotRules(input({ event: event({ online_mode: 'nsda_campus' }) })).onlineMode).toBe('nsda_campus');
		});

		it('is null for in-person events', () => {
			expect(ballotRules(input()).onlineMode).toBeNull();
		});

		it.each([
			'async',
			'nsda_campus',
		])('is sync when a %s event\'s round uses normal rooms', (mode) => {
			const rules = ballotRules(input({ event: event({ online_mode: mode }), round: normalRooms }));

			expect(rules.onlineMode).toBe('sync');
		});

		it('is sync when an in-person event\'s round uses normal rooms', () => {
			expect(ballotRules(input({ round: normalRooms })).onlineMode).toBe('sync');
		});
	});
});

describe('ballotStatus', () => {
	const started = new Date('2026-10-03T14:05:00Z');

	it('is not_started before the judge opens the ballot', () => {
		expect(ballotStatus({ ballots: [ballot(), ballot()], scores: [] })).toBe('not_started');
	});

	it('is started once the judge has opened it', () => {
		expect(ballotStatus({ ballots: [ballot({ judge_started: started }), ballot({ judge_started: started })], scores: [] })).toBe('started');
	});

	it.each([
		'winloss',
		'point',
		'rank',
	])('is scored once a %s score is saved', (tag) => {
		expect(ballotStatus({ ballots: [ballot({ judge_started: started }), ballot()], scores: [score(tag)] })).toBe('scored');
	});

	it.each([
		'rfd',
		'comments',
	])('is not scored by a %s draft', (tag) => {
		expect(ballotStatus({ ballots: [ballot({ judge_started: started }), ballot()], scores: [score(tag)] })).toBe('started');
	});

	it('is confirmed once every ballot row is audited', () => {
		expect(ballotStatus({ ballots: [ballot({ audit: 1 }), ballot({ audit: 1 })], scores: [score('winloss')] })).toBe('confirmed');
	});

	it('is not confirmed while any ballot row is unaudited', () => {
		expect(ballotStatus({ ballots: [ballot({ audit: 1 }), ballot()], scores: [score('winloss')] })).toBe('scored');
	});

	it('is included in the rules', () => {
		expect(ballotRules(input({ ballots: [ballot({ audit: 1 }), ballot({ audit: 1 })] })).status).toBe('confirmed');
	});
});

describe('chairLabel', () => {
	const chair = [ballot({ chair: 1 }), ballot({ chair: 1 })];

	it('is null when the judge isn\'t chair', () => {
		expect(chairLabel({ ballots: [ballot(), ballot()], event: event({ chair_label: 'Judge' }) })).toBeNull();
	});

	it('is CHAIR JUDGE by default', () => {
		expect(chairLabel({ ballots: chair, event: event({}) })).toBe('CHAIR JUDGE');
	});

	it('is the event\'s chair_label in capitals', () => {
		expect(chairLabel({ ballots: chair, event: event({ chair_label: 'Chief Justice' }) })).toBe('CHIEF JUSTICE');
	});

	it('is PARLIAMENTARIAN for Congress', () => {
		expect(chairLabel({ ballots: chair, event: factories.event.mock({ type: 'congress' }) })).toBe('PARLIAMENTARIAN');
	});

	it('counts the judge as chair when any of their ballot rows is', () => {
		expect(chairLabel({ ballots: [ballot({ chair: 1 }), ballot()], event: event({}) })).toBe('CHAIR JUDGE');
	});
});

describe('ballotTopic', () => {
	const published = round({ settings: { motion_publish: '1', motion: 'This House would ban homework' } });

	it('is the event\'s topic, with line breaks as <br />', () => {
		const topic = { topic_text: 'Resolved: A.\r\nResolved: B.' };

		expect(ballotTopic({ event: event({}), round: round(), topic })).toEqual({ label: 'Topic', text: 'Resolved: A.<br />Resolved: B.' });
	});

	it('prefers the topic over a published motion and a resolution', () => {
		const topic = { topic_text: 'Resolved: A.' };

		expect(ballotTopic({ event: event({ resolution: 'Resolved: B.' }), round: published, topic })?.label).toBe('Topic');
	});

	it('is the round\'s motion once it\'s published', () => {
		expect(ballotTopic({ event: event({ resolution: 'Resolved: B.' }), round: published, topic: null }))
			.toEqual({ label: 'Motion', text: 'This House would ban homework' });
	});

	it('ignores a motion that isn\'t published', () => {
		const unpublished = round({ settings: { motion: 'This House would ban homework' } });

		expect(ballotTopic({ event: event({}), round: unpublished, topic: null })).toBeNull();
	});

	it('is the event\'s resolution', () => {
		expect(ballotTopic({ event: event({ resolution: 'Resolved: B.' }), round: round(), topic: null }))
			.toEqual({ label: 'Resolution', text: 'Resolved: B.' });
	});

	it('skips a topic with no text', () => {
		expect(ballotTopic({ event: event({ resolution: 'Resolved: B.' }), round: round(), topic: { topic_text: null } })?.label).toBe('Resolution');
	});

	it('is null when there is none', () => {
		expect(ballotTopic({ event: event({}), round: round(), topic: null })).toBeNull();
	});
});

describe('rulesText', () => {
	const judge = [ballot(), ballot()];
	const chair = [ballot({ chair: 1 }), ballot({ chair: 1 })];
	const both = { ballot_rules: 'No tied points.', ballot_rules_chair: 'Announce the decision.' };

	it('is the event\'s ballot_rules', () => {
		expect(rulesText({ ballots: judge, event: event(both) })).toEqual(['No tied points.']);
	});

	it('puts the chair rules first for the chair', () => {
		expect(rulesText({ ballots: chair, event: event(both) })).toEqual(['Announce the decision.', 'No tied points.']);
	});

	it('hides ballot_rules from the chair with chair_ballot_only', () => {
		expect(rulesText({ ballots: chair, event: event({ ...both, chair_ballot_only: '1' }) })).toEqual(['Announce the decision.']);
	});

	it('still shows ballot_rules to other judges with chair_ballot_only', () => {
		expect(rulesText({ ballots: judge, event: event({ ...both, chair_ballot_only: '1' }) })).toEqual(['No tied points.']);
	});

	it('is empty when the event has no rules', () => {
		expect(rulesText({ ballots: chair, event: event({}) })).toEqual([]);
	});
});

describe('sideLock', () => {
	const elim = round({ type: 'elim' });

	it('is tab for prelims', () => {
		expect(sideLock({ event: event({}), round: round(), dueAff: null })).toBe('tab');
	});

	it('is tab for prelims even when an entry is due Aff', () => {
		expect(sideLock({ event: event({}), round: round(), dueAff: 1 })).toBe('tab');
	});

	it.each([
		'elim',
		'final',
		'runoff',
	])('is history for a %s when an entry is due Aff', (type) => {
		expect(sideLock({ event: event({}), round: round({ type }), dueAff: 1 })).toBe('history');
	});

	it('is pick for an elim when no entry is due Aff', () => {
		expect(sideLock({ event: event({}), round: elim, dueAff: null })).toBe('pick');
	});

	it('is tab for elims with sidelock_elims', () => {
		expect(sideLock({ event: event({ sidelock_elims: '1' }), round: elim, dueAff: null })).toBe('tab');
	});

	it('is pick for elims with no_elim_sidelocks, even when an entry is due Aff', () => {
		expect(sideLock({ event: event({ no_elim_sidelocks: '1' }), round: elim, dueAff: 1 })).toBe('pick');
	});

	it.each([
		['prelims', round()],
		['elims', elim],
	])('is pick for %s with no_side_constraints', (_label, round) => {
		expect(sideLock({ event: event({ no_side_constraints: '1', sidelock_elims: '1' }), round, dueAff: 1 })).toBe('pick');
	});

	it('ignores sidelock_elims set to "0"', () => {
		expect(sideLock({ event: event({ sidelock_elims: '0' }), round: elim, dueAff: null })).toBe('pick');
	});
});

describe('debate details', () => {
	it('labels the sides Aff and Neg by default', () => {
		expect(ballotRules(input()).debate).toEqual({ affLabel: 'Aff', negLabel: 'Neg', sides: 'locked', winner: null });
	});

	it('uses the event\'s side labels', () => {
		const rules = ballotRules(input({ event: event({ aff_label: 'Pro', neg_label: 'Con' }) }));

		expect(rules.debate).toMatchObject({ affLabel: 'Pro', negLabel: 'Con' });
	});

	it('lets the judge pick sides in an elim where no entry is due Aff', () => {
		expect(ballotRules(input({ round: round({ type: 'elim' }) })).debate.sides).toBe('pick');
	});

	it('locks sides in an elim where an entry is due Aff', () => {
		expect(ballotRules(input({ round: round({ type: 'elim' }), dueAff: 1 })).debate.sides).toBe('locked');
	});

	describe('due Aff check', () => {
		let warn: MockInstance<typeof logger.warn>;
		beforeEach(() => { warn = vi.spyOn(logger, 'warn'); });
		afterEach(() => { warn.mockRestore(); });

		it('warns when the due Aff entry isn\'t on Aff', () => {
			const rules = input({ round: round({ type: 'elim' }), dueAff: 2 });

			ballotRules(rules);

			expect(warn).toHaveBeenCalledWith('Due Aff entry is not on side 1', { panel: rules.panel.id, entry: 2, side: 2 });
		});

		it('doesn\'t warn when the due Aff entry is on Aff', () => {
			ballotRules(input({ round: round({ type: 'elim' }), dueAff: 1 }));

			expect(warn).not.toHaveBeenCalled();
		});

		it('doesn\'t warn about prelim sides, which don\'t follow due Aff', () => {
			ballotRules(input({ dueAff: 2 }));

			expect(warn).not.toHaveBeenCalled();
		});
	});
});

describe('ballotEntries', () => {
	it('lists the entries in side order with their students', () => {
		expect(ballotEntries(input({ ballots: [ballot({ id: 12, entry: 2, side: 2 }), ballot()] }))).toEqual([
			{
				ballot: 11, entry: 1, code: 'AFF1', side: 1, notes: null, doubled: 0, comments: null, points: null,
				Students: [
					{ id: 101, first: 'Ana', last: 'Adams', pronoun: null, points: null },
					{ id: 102, first: 'Ben', last: 'Brown', pronoun: null, points: null },
				],
			},
			{
				ballot: 12, entry: 2, code: 'NEG2', side: 2, notes: null, doubled: 0, comments: null, points: null,
				Students: [
					{ id: 201, first: 'Cai', last: 'Chen', pronoun: null, points: null },
					{ id: 202, first: 'Dee', last: 'Diaz', pronoun: null, points: null },
				],
			},
		]);
	});

	it('is included in the rules', () => {
		expect(ballotRules(input()).Entries.map(entry => entry.code)).toEqual(['AFF1', 'NEG2']);
	});

	it('skips ballot rows with no entry', () => {
		const entries = ballotEntries(input({ ballots: [ballot(), ballot({ id: 13, entry: null as unknown as number, side: 2 })] }));

		expect(entries.map(entry => entry.ballot)).toEqual([11]);
	});

	it('includes the entry\'s accommodations note', () => {
		const entries = ballotEntries(input({ entries: [{ id: 1, code: 'AFF1', settings: { ballot_notes: 'Needs a ramp' } }] }));

		expect(entries[0].notes).toBe('Needs a ramp');
	});

	it('counts the distinct other entries an entry is doubled with', () => {
		const doubled = [{ entry: 1, other: 7 }, { entry: 1, other: 8 }, { entry: 1, other: 8 }, { entry: 2, other: 9 }];

		expect(ballotEntries(input({ doubled })).map(entry => entry.doubled)).toEqual([2, 1]);
	});

	describe('students', () => {
		it('sorts by last name', () => {
			const students = [student(1, 102, 'Ben', 'Brown'), student(1, 101, 'Ana', 'Adams')];

			expect(ballotEntries(input({ students }))[0].Students.map(s => s.id)).toEqual([101, 102]);
		});

		// Three students: 1S, 2A (second speaker on Aff, first on Neg), and one with no position
		const trio = [student(1, 101, 'Ana', 'Adams'), student(1, 102, 'Ben', 'Brown'), student(1, 103, 'Cy', 'Cole')];
		const positions = { 101: '2A', 102: '1S' };
		const entries = [{ id: 1, code: 'AFF1', settings: { positions } }];

		it('orders debate entries with more than two students by position, unset first', () => {
			const onAff = ballotEntries(input({ students: trio, entries, ballots: [ballot({ side: 1 })] }));

			expect(onAff[0].Students.map(s => s.id)).toEqual([103, 102, 101]);
		});

		it('flips 2A and 2N by side', () => {
			const onNeg = ballotEntries(input({ students: trio, entries, ballots: [ballot({ side: 2 })] }));

			expect(onNeg[0].Students.map(s => s.id)).toEqual([103, 101, 102]);
		});

		it('ignores positions for two-student entries', () => {
			const pair = [student(1, 101, 'Ana', 'Adams'), student(1, 102, 'Ben', 'Brown')];

			expect(ballotEntries(input({ students: pair, entries }))[0].Students.map(s => s.id)).toEqual([101, 102]);
		});

		it('shows pronouns', () => {
			const students = [student(1, 101, 'Ana', 'Adams', 'she/her')];

			expect(ballotEntries(input({ students }))[0].Students[0].pronoun).toBe('she/her');
		});

		it.each([
			'',
			'0',
		])('skips the pronoun %j', (pronoun) => {
			const students = [student(1, 101, 'Ana', 'Adams', pronoun)];

			expect(ballotEntries(input({ students }))[0].Students[0].pronoun).toBeNull();
		});

		it('hides pronouns when the tourn sets limit_info', () => {
			const students = [student(1, 101, 'Ana', 'Adams', 'she/her')];

			expect(ballotEntries(input({ students, tourn: tourn({ limit_info: '1' }) }))[0].Students[0].pronoun).toBeNull();
		});
	});

	describe('saved points', () => {
		const saved = [
			score('point', { ballot: 11, student: 101, value: 28.5 }),
			score('point', { ballot: 11, student: 102, value: 29 }),
		];

		it('puts speaker points on the students', () => {
			const [aff] = ballotEntries(input({ scores: saved }));

			expect(aff.points).toBeNull();
			expect(aff.Students.map(s => s.points)).toEqual([28.5, 29]);
		});

		it('puts team points on the entry', () => {
			const team = [score('point', { ballot: 11, student: 101, value: 57 }), score('point', { ballot: 11, student: 102, value: 57 })];
			const [aff] = ballotEntries(input({ scores: team, event: event({ team_points: '1' }) }));

			expect(aff.points).toBe(57);
			expect(aff.Students.map(s => s.points)).toEqual([null, null]);
		});

		it('ignores other ballots\' points', () => {
			const [, neg] = ballotEntries(input({ scores: saved }));

			expect(neg.Students.map(s => s.points)).toEqual([null, null]);
		});
	});
});

describe('feedbackScoring', () => {
	const end = new Date('2026-10-04T23:00:00Z');

	it('has nothing saved and no minimums by default', () => {
		expect(feedbackScoring({ tourn: tourn({}), event: event({}), scores: [] }))
			.toMatchObject({ rfd: null, minWords: { rfd: null, comments: null } });
	});

	it('is the saved reason for decision from any of the judge\'s ballots', () => {
		const scores = [score('rfd', { ballot: 12, content: '<p>Aff won on the framework.</p>' })];

		expect(feedbackScoring({ tourn: tourn({}), event: event({}), scores })?.rfd).toBe('<p>Aff won on the framework.</p>');
	});

	it('ignores an empty saved reason for decision', () => {
		const scores = [score('rfd', { ballot: 11, content: '' }), score('rfd', { ballot: 12, content: '<p>Neg.</p>' })];

		expect(feedbackScoring({ tourn: tourn({}), event: event({}), scores })?.rfd).toBe('<p>Neg.</p>');
	});

	it('reads the word minimums', () => {
		const feedback = feedbackScoring({ tourn: tourn({}), event: event({ rfd_plz: '50', comments_plz: '25' }), scores: [] });

		expect(feedback?.minWords).toEqual({ rfd: 50, comments: 25 });
	});

	it.each([
		['"0"', '0'],
		['""', ''],
		['not a number', 'fifty'],
	])('has no minimum when the setting is %s', (_label, value) => {
		const feedback = feedbackScoring({ tourn: tourn({}), event: event({ rfd_plz: value, comments_plz: value }), scores: [] });

		expect(feedback?.minWords).toEqual({ rfd: null, comments: null });
	});

	it('is editable until the tourn ends', () => {
		const feedback = feedbackScoring({ tourn: factories.tourn.mock({ end, settings: {} }), event: event({}), scores: [] });

		expect(feedback?.editableUntil).toEqual(end);
	});

	it('puts each entry\'s saved comments on the entry', () => {
		const scores = [score('comments', { ballot: 12, content: '<p>Slow down.</p>' })];

		expect(ballotEntries(input({ scores })).map(entry => entry.comments)).toEqual([null, '<p>Slow down.</p>']);
	});

	it('is included in the rules\' scoring', () => {
		expect(ballotRules(input()).scoring.feedback).toMatchObject({ rfd: null });
	});

	it('is undefined for Congress', () => {
		expect(feedbackScoring({ tourn: tourn({}), event: factories.event.mock({ type: 'congress' }), scores: [] })).toBeUndefined();
	});

	it('is undefined for mock trial without mock_trial_feedback', () => {
		expect(feedbackScoring({ tourn: tourn({}), event: factories.event.mock({ type: 'mock_trial' }), scores: [] })).toBeUndefined();
	});

	it('is present for mock trial with mock_trial_feedback', () => {
		const event = factories.event.mock({ type: 'mock_trial', settings: { mock_trial_feedback: '1' } });

		expect(feedbackScoring({ tourn: tourn({}), event, scores: [] })).toBeDefined();
	});

	it('is present for speech', () => {
		expect(feedbackScoring({ tourn: tourn({}), event: factories.event.mock({ type: 'speech' }), scores: [] })).toBeDefined();
	});
});

describe('otherJudges', () => {
	const panelJudge = (id: number, last: string, chair: number, pronoun: string | null = null) => ({ id, code: null, first: 'J', middle: null, last, pronoun, chair });
	const panelJudges = [panelJudge(1, 'Me', 0), panelJudge(2, 'Zed', 0), panelJudge(3, 'Able', 0, 'he/him'), panelJudge(4, 'Moss', 1)];
	const panelRound = round({ settings: { num_judges: '3' } });

	it('lists the other judges, chair first then by last name', () => {
		expect(otherJudges({ round: panelRound, judge: { id: 1 }, panelJudges })).toEqual([
			{ first: 'J', middle: null, last: 'Moss', chair: true, pronoun: null },
			{ first: 'J', middle: null, last: 'Able', chair: false, pronoun: 'he/him' },
			{ first: 'J', middle: null, last: 'Zed', chair: false, pronoun: null },
		]);
	});

	it.each([
		['unset', {}],
		['1', { num_judges: '1' }],
	])('is empty when num_judges is %s', (_label, settings) => {
		expect(otherJudges({ round: round({ settings }), judge: { id: 1 }, panelJudges })).toEqual([]);
	});

	it('skips empty and "0" pronouns', () => {
		const judges = [panelJudge(2, 'Zed', 0, ''), panelJudge(3, 'Able', 0, '0')];

		expect(otherJudges({ round: panelRound, judge: { id: 1 }, panelJudges: judges }).map(j => j.pronoun)).toEqual([null, null]);
	});
});

describe('ballotTimers', () => {
	it('defaults to a 5 minute speech timer and 4 minutes of prep for debate', () => {
		expect(ballotTimers({ event: event({}) })).toEqual({ speech: 5, prep: 4 });
	});

	it('reads default_time and prep_time', () => {
		expect(ballotTimers({ event: event({ default_time: '8', prep_time: '3' }) })).toEqual({ speech: 8, prep: 3 });
	});

	it.each([
		['speech', { speech: 10, prep: null }],
		['congress', { speech: 3, prep: null }],
	])('has no prep timer for %s', (type, timers) => {
		expect(ballotTimers({ event: factories.event.mock({ type: type as 'speech' | 'congress', settings: {} }) })).toEqual(timers);
	});

	it('is null with no_timers', () => {
		expect(ballotTimers({ event: event({ no_timers: '1' }) })).toBeNull();
	});

	it('is null for mock trial', () => {
		expect(ballotTimers({ event: factories.event.mock({ type: 'mock_trial', settings: {} }) })).toBeNull();
	});
});

describe('settingLines', () => {
	it('splits paragraphs into lines on the first "..."', () => {
		expect(settingLines('<p>29-30...Outstanding</p>\r\n<p>27-28...Above Average</p>')).toEqual([
			['29-30', 'Outstanding'],
			['27-28', 'Above Average'],
		]);
	});

	it('keeps lines without "..." whole', () => {
		expect(settingLines('<p>Think of points as letter grades.</p><p>30=A+</p>')).toEqual([
			[null, 'Think of points as letter grades.'],
			[null, '30=A+'],
		]);
	});

	it('breaks lines on <br> and bare line breaks, and drops empty ones', () => {
		expect(settingLines('1AC...8 min<br />CX...3 min\n\n<p></p>1NC...8 min')).toEqual([
			['1AC', '8 min'],
			['CX', '3 min'],
			['1NC', '8 min'],
		]);
	});

	it('decodes entities and keeps non-ASCII characters', () => {
		expect(settingLines('<p>1AC &ndash; First Aff…8&nbsp;min</p>')).toEqual([[null, '1AC – First Aff…8 min']]);
	});

	it('keeps any later "..." in the second half', () => {
		expect(settingLines('<p>20...Rude... or worse</p>')).toEqual([['20', 'Rude... or worse']]);
	});

	it('keeps a link\'s text and drops its url', () => {
		expect(settingLines('<p>Use the <a href="https://example.com/rubric">rubric</a></p>')).toEqual([[null, 'Use the rubric']]);
	});

	it('is empty when unset', () => {
		expect(settingLines(undefined)).toEqual([]);
	});
});

describe('sidebar', () => {
	it('splits the point scale into points and descriptions', () => {
		expect(ballotRules(input({ event: event({ point_scale: '<p>29-30...Outstanding</p>' }) })).pointScale)
			.toEqual([{ points: '29-30', description: 'Outstanding' }]);
	});

	it('splits speech times into speeches and times', () => {
		expect(ballotRules(input({ event: event({ speech_times: '<p>1AC...6 min</p><p>Prep is 4 minutes</p>' }) })).speechTimes)
			.toEqual([{ speech: '1AC', time: '6 min' }, { speech: 'Prep is 4 minutes', time: null }]);
	});

	it('includes the round\'s ballot topics', () => {
		expect(ballotRules(input({ round: round({ settings: { ballot_topics: '<p>Topic A</p>' } }) })).ballotTopics).toBe('<p>Topic A</p>');
	});

	it('links the panel\'s doc share', () => {
		expect(ballotRules(input({ panel: factories.panel.mock({ settings: { share: 'abc123' } }) })).docShare).toBe('https://share.tabroom.com/abc123');
	});

	it('links the tourn logo', () => {
		const rules = ballotRules(input({ tourn: factories.tourn.mock({ id: 42, start: recent, settings: { logo: 'logo.png' } }) }));

		expect(rules.logo).toMatch(/\/42\/logo\.png$/);
	});

	it('is empty when nothing is set', () => {
		expect(ballotRules(input())).toMatchObject({ pointScale: [], speechTimes: [], ballotTopics: null, docShare: null, logo: null, otherJudges: [] });
	});
});

describe('savedWinner', () => {
	it('is the ballot with a winloss of 1', () => {
		const scores = [score('winloss', { ballot: 11, value: 0 }), score('winloss', { ballot: 12, value: 1 })];

		expect(savedWinner({ ballots: input().ballots, scores })).toBe(12);
	});

	it('is null before a winner is saved', () => {
		expect(savedWinner({ ballots: input().ballots, scores: [] })).toBeNull();
	});

	it('is on the debate details', () => {
		expect(ballotRules(input({ scores: [score('winloss', { ballot: 11 })] })).debate.winner).toBe(11);
	});
});

describe('online mode support', () => {
	it.each([
		'nsda_campus',
		'nsda_campus_observers',
		'public_jitsi',
		'public_jitsi_observers',
	])('flags %s, whose join links need online_room ported', (mode) => {
		expect(ballotRules(input({ event: event({ online_mode: mode }) })).unsupported).toEqual([`online mode ${mode}`]);
	});

	it('flags async, whose entries have video links', () => {
		expect(ballotRules(input({ event: event({ online_mode: 'async' }) })).unsupported).toEqual(['online mode async']);
	});

	it('supports sync', () => {
		expect(ballotRules(input({ event: event({ online_mode: 'sync' }) })).unsupported).toEqual([]);
	});

	it('supports campus events whose round uses normal rooms', () => {
		const rules = ballotRules(input({
			event: event({ online_mode: 'nsda_campus' }),
			round: round({ settings: { use_normal_rooms: '1' } }),
		}));

		expect(rules.unsupported).toEqual([]);
	});
});

describe('roundName', () => {
	it('is "Round" and the number', () => {
		expect(roundName({ round: round({ name: 3, label: null }), event: event({}) })).toBe('Round 3');
	});

	it('is the label when there is one', () => {
		expect(roundName({ round: round({ name: 6, label: 'Quarters' }), event: event({}) })).toBe('Quarters');
	});

	it('ignores a label that is just the number', () => {
		expect(roundName({ round: round({ name: 3, label: '3' }), event: event({}) })).toBe('Round 3');
	});

	it('ignores an empty label', () => {
		expect(roundName({ round: round({ name: 3, label: '' }), event: event({}) })).toBe('Round 3');
	});

	it('is "Session" and the number for Congress', () => {
		expect(roundName({ round: round({ name: 2, label: null }), event: factories.event.mock({ type: 'congress' }) })).toBe('Session 2');
	});
});

describe('flight', () => {
	it.each([
		[null, '1'],
		[1, '1'],
	])('is null when the round is not flighted (flighted %j)', (flighted, flight) => {
		expect(ballotRules(input({ round: round({ flighted }), panel: panel(flight) })).flight).toBeNull();
	});

	it('is the panel\'s flight when the round is flighted', () => {
		expect(ballotRules(input({ round: round({ flighted: 2 }), panel: panel('2') })).flight).toBe(2);
	});

	it.each([
		null,
		'0',
	])('is null when a flighted round\'s panel has flight %j', (flight) => {
		expect(ballotRules(input({ round: round({ flighted: 2 }), panel: panel(flight) })).flight).toBeNull();
	});
});

describe('roundNotes', () => {
	it('is the round\'s notes setting', () => {
		expect(ballotRules(input({ round: round({ settings: { notes: 'Bring timers' } }) })).roundNotes).toBe('Bring timers');
	});

	it.each([
		['unset', {}],
		['""', { notes: '' }],
		['"0"', { notes: '0' }],
	])('is null when notes are %s', (_label, settings) => {
		expect(ballotRules(input({ round: round({ settings }) })).roundNotes).toBeNull();
	});
});

describe('pointsScoring', () => {
	const scored = { winloss: true, point: true };
	const defaults = { min: 0, max: 30, step: 1, ties: false, team: false };

	it('is included in the rules\' scoring', () => {
		expect(ballotRules(input()).scoring.points).toEqual(defaults);
	});

	it('is undefined when the protocol doesn\'t count points', () => {
		expect(pointsScoring({ event: event({ max_points: '30' }), tbTypes: { winloss: true } })).toBeUndefined();
	});

	it('defaults to whole points from 0 to 30', () => {
		expect(pointsScoring({ event: event({}), tbTypes: scored })).toEqual(defaults);
	});

	it('reads the event\'s range', () => {
		expect(pointsScoring({ event: event({ min_points: '25', max_points: '30' }), tbTypes: scored })).toMatchObject({ min: 25, max: 30 });
	});

	it('reads decimal ranges', () => {
		expect(pointsScoring({ event: event({ min_points: '26.5', max_points: '29.5' }), tbTypes: scored })).toMatchObject({ min: 26.5, max: 29.5 });
	});

	it.each([
		['"0"', '0'],
		['""', ''],
		['not a number', 'thirty'],
	])('uses the default range when the settings are %s', (_label, value) => {
		expect(pointsScoring({ event: event({ min_points: value, max_points: value }), tbTypes: scored })).toMatchObject({ min: 0, max: 30 });
	});

	it.each([
		['whole', 1],
		['half', 0.5],
		['fourths', 0.25],
		['tenths', 0.1],
	])('maps point_increments %s to a step of %d', (increments, step) => {
		expect(pointsScoring({ event: event({ point_increments: increments }), tbTypes: scored })?.step).toBe(step);
	});

	it('uses whole points for an unknown point_increments', () => {
		expect(pointsScoring({ event: event({ point_increments: 'thirds' }), tbTypes: scored })?.step).toBe(1);
	});

	it('allows ties with point_ties', () => {
		expect(pointsScoring({ event: event({ point_ties: '1' }), tbTypes: scored })?.ties).toBe(true);
	});

	it('scores entries instead of speakers with team_points', () => {
		expect(pointsScoring({ event: event({ team_points: '1' }), tbTypes: scored })?.team).toBe(true);
	});
});

describe('winlossScoring', () => {
	const scored = { winloss: true, point: true };

	it('is included in the rules\' scoring', () => {
		expect(ballotRules(input()).scoring.winloss).toEqual({ lpw: 'confirm' });
	});

	it('is undefined when the protocol doesn\'t count wins', () => {
		expect(winlossScoring({ event: event({}), tbTypes: { point: true } })).toBeUndefined();
	});

	it('has no low-point win rule when the protocol doesn\'t count points', () => {
		expect(winlossScoring({ event: event({ no_lpw: '1' }), tbTypes: { winloss: true } })).toEqual({ lpw: null });
	});

	it('makes the judge confirm low-point wins by default', () => {
		expect(winlossScoring({ event: event({}), tbTypes: scored })).toEqual({ lpw: 'confirm' });
	});

	it('forbids low-point wins with no_lpw', () => {
		expect(winlossScoring({ event: event({ no_lpw: '1' }), tbTypes: scored })).toEqual({ lpw: 'forbid' });
	});

	it('lets allow_lowpoints override no_lpw', () => {
		expect(winlossScoring({ event: event({ no_lpw: '1', allow_lowpoints: '1' }), tbTypes: scored })).toEqual({ lpw: 'confirm' });
	});

	it('confirms when allow_lowpoints is set on its own', () => {
		expect(winlossScoring({ event: event({ allow_lowpoints: '1' }), tbTypes: scored })).toEqual({ lpw: 'confirm' });
	});

	it('ignores no_lpw set to "0"', () => {
		expect(winlossScoring({ event: event({ no_lpw: '0' }), tbTypes: scored })).toEqual({ lpw: 'confirm' });
	});
});

describe('roundStart', () => {
	const noStartTime = round({ start_time: null });
	const offset = event({ flight_offset: '45' });

	it('is the round start_time', () => {
		expect(roundStart(input())).toEqual(new Date('2026-10-03T14:00:00Z'));
	});

	it('falls back to the timeslot start', () => {
		expect(roundStart(input({ round: noStartTime }))).toEqual(new Date('2026-10-03T13:00:00Z'));
	});

	it('throws when there is no start at all', () => {
		expect(() => roundStart(input({ round: noStartTime, timeslot: factories.timeslot.mock({ start: null }) }))).toThrow();
	});

	it('adds flight_offset for each flight after the first', () => {
		expect(roundStart(input({ event: offset, panel: panel('1') }))).toEqual(new Date('2026-10-03T14:00:00Z'));
		expect(roundStart(input({ event: offset, panel: panel('2') }))).toEqual(new Date('2026-10-03T14:45:00Z'));
		expect(roundStart(input({ event: offset, panel: panel('3') }))).toEqual(new Date('2026-10-03T15:30:00Z'));
	});

	it.each([
		null,
		'0',
	])('adds no flight_offset for flight %j', (flight) => {
		expect(roundStart(input({ event: offset, panel: panel(flight) }))).toEqual(new Date('2026-10-03T14:00:00Z'));
	});

	it('adds flight_offset to the timeslot start', () => {
		expect(roundStart(input({ event: offset, round: noStartTime, panel: panel('2') }))).toEqual(new Date('2026-10-03T13:45:00Z'));
	});

	it('ignores flights when there is no flight_offset', () => {
		expect(roundStart(input({ panel: panel('2') }))).toEqual(new Date('2026-10-03T14:00:00Z'));
	});
});

describe('decisionDeadline', () => {
	const deadlines = { prelim_decision_deadline: '90', elim_decision_deadline: '120' };

	it('is the prelim deadline after the round start', () => {
		expect(decisionDeadline(input({ event: event(deadlines) }))).toEqual(new Date('2026-10-03T15:30:00Z'));
	});

	it.each([
		'elim',
		'final',
		'runoff',
	])('uses the elim deadline for %s rounds', (type) => {
		expect(decisionDeadline(input({ event: event(deadlines), round: round({ type }) }))).toEqual(new Date('2026-10-03T16:00:00Z'));
	});

	it.each([
		'highlow',
		'snaked_prelim',
		null,
	])('uses the prelim deadline for %s rounds', (type) => {
		expect(decisionDeadline(input({ event: event(deadlines), round: round({ type }) }))).toEqual(new Date('2026-10-03T15:30:00Z'));
	});

	it('counts from the flight\'s start', () => {
		const rules = input({ event: event({ ...deadlines, flight_offset: '45' }), panel: panel('2') });

		expect(decisionDeadline(rules)).toEqual(new Date('2026-10-03T16:15:00Z'));
	});

	it.each([
		['unset', {}],
		['"0"', { prelim_decision_deadline: '0' }],
		['""', { prelim_decision_deadline: '' }],
		['not a number', { prelim_decision_deadline: 'soon' }],
	])('is null when the deadline is %s', (_label, settings) => {
		expect(decisionDeadline(input({ event: event(settings) }))).toBeNull();
	});

	it('is null for an elim when only the prelim deadline is set', () => {
		const rules = input({ event: event({ prelim_decision_deadline: '90' }), round: round({ type: 'elim' }) });

		expect(decisionDeadline(rules)).toBeNull();
	});
});

describe('ballotHeader', () => {
	const site = {
		nsda_district_ballot_header: '<p>NSDA</p>',
		bias_statement: '<p>Default</p>',
	};

	describe('tourn bias statement', () => {
		it('wins over the NSDA header', () => {
			expect(ballotHeader({ tourn: tourn({ nsda_nats: '1', bias_statement: '<p>Own</p>' }), site })).toBe('<p>Own</p>');
		});

		it('wins over the site default', () => {
			expect(ballotHeader({ tourn: tourn({ bias_statement: '<p>Own</p>' }), site })).toBe('<p>Own</p>');
		});

		it('shows for old tourns', () => {
			expect(ballotHeader({ tourn: tourn({ bias_statement: '<p>Own</p>' }, old), site })).toBe('<p>Own</p>');
		});

		it.each([
			'&nbsp;',
			'<p></p>\r\n<p></p>',
			'<p>.</p>',
			'<p>-</p>\r\n<p></p>',
			'<p>..........</p>',
			'<p>⠀</p>',
			'',
		])('is blanked out by %j, without falling back', (value) => {
			expect(ballotHeader({ tourn: tourn({ nsda_nats: '1', bias_statement: value }), site })).toBeNull();
		});

		it('shows short statements with real text', () => {
			expect(ballotHeader({ tourn: tourn({ bias_statement: '<p>Be biased</p>' }), site })).toBe('<p>Be biased</p>');
		});

		it('falls back when null', () => {
			expect(ballotHeader({ tourn: tourn({ bias_statement: null }), site })).toBe('<p>Default</p>');
		});
	});

	describe('NSDA header', () => {
		it.each([
			'nsda_district',
			'nsda_nats',
			'nsda_ms_nats',
			'nsda_billing',
		])('shows for %s tourns', (tag) => {
			expect(ballotHeader({ tourn: tourn({ [tag]: '1' }), site })).toBe('<p>NSDA</p>');
		});

		it('shows for old NSDA tourns', () => {
			expect(ballotHeader({ tourn: tourn({ nsda_district: '1' }, old), site })).toBe('<p>NSDA</p>');
		});

		it('ignores NSDA settings that are set to "0"', () => {
			expect(ballotHeader({ tourn: tourn({ nsda_nats: '0' }), site })).toBe('<p>Default</p>');
		});

		it('falls back to the site default when the header is missing', () => {
			expect(ballotHeader({ tourn: tourn({ nsda_nats: '1' }), site: { bias_statement: '<p>Default</p>' } })).toBe('<p>Default</p>');
		});

		it('blanks out the site default when the header has no text', () => {
			expect(ballotHeader({ tourn: tourn({ nsda_nats: '1' }), site: { ...site, nsda_district_ballot_header: '' } })).toBeNull();
		});
	});

	describe('site default', () => {
		it('shows for tourns after 2021-08-01', () => {
			expect(ballotHeader({ tourn: tourn({}), site })).toBe('<p>Default</p>');
		});

		it('is null for older tourns', () => {
			expect(ballotHeader({ tourn: tourn({}, old), site })).toBeNull();
		});

		it('is null for tourns starting exactly on 2021-08-01', () => {
			expect(ballotHeader({ tourn: tourn({}, new Date('2021-08-01T00:00:00Z')), site })).toBeNull();
		});

		it('shows for older tourns with bias_saved', () => {
			expect(ballotHeader({ tourn: tourn({ bias_saved: '1' }, old), site })).toBe('<p>Default</p>');
		});

		it('is null when the site default has no text', () => {
			expect(ballotHeader({ tourn: tourn({}), site: { bias_statement: '<p>&nbsp;</p>' } })).toBeNull();
		});

		it('is null when the site has no default', () => {
			expect(ballotHeader({ tourn: tourn({}), site: {} })).toBeNull();
		});
	});
});
