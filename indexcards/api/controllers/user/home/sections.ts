import type { CurrentBallot, Fine, HomeEntry, HomeJudge, HomePrefSheet, HomeRound, HomeSchool, HomeTab, Strike } from '@tabroom/types';
import type ballotRepo from '../../../repos/ballotRepo.js';
import type categoryRepo from '../../../repos/categoryRepo.js';
import type entryRepo from '../../../repos/entryRepo.js';
import type eventRepo from '../../../repos/eventRepo.js';
import type fineRepo from '../../../repos/fineRepo.js';
import type jpoolRepo from '../../../repos/jpoolRepo.js';
import type judgeRepo from '../../../repos/judgeRepo.js';
import type panelRepo from '../../../repos/panelRepo.js';
import type permissionRepo from '../../../repos/permissionRepo.js';
import type roundRepo from '../../../repos/roundRepo.js';
import type schoolRepo from '../../../repos/schoolRepo.js';
import type scoreRepo from '../../../repos/scoreRepo.js';
import type strikeRepo from '../../../repos/strikeRepo.js';
import { flightNumber, isOn, roundStart, sideNames, sideVisible } from '../../../services/ballots/ballotRules.js';
import { flipChoices, isFlipOpen, flipStatus, flipTurn, parseFlip } from '../../../services/flips/flipRules.js';
import { isRunning, judgeAnonymous, judgeQuizzes, requiredQuizIds, roundListed, roundVisibility, scoreVisible, sqlDatetime, strikeWindow, trainingDue, type QuizRequirement } from '../../../services/home/homeRules.js';

type Rows<T extends (...args: never[]) => Promise<unknown[]>> = Awaited<ReturnType<T>>;
type Settings = Record<string, string> | null | undefined;

const iso = (value: Date | string | null | undefined) => sqlDatetime(value)?.toISOString() ?? null;

const STRIKE_TYPES: readonly string[] = ['school', 'entry', 'departure', 'time'];

export function toFine(row: Rows<typeof fineRepo.getFines>[number]): Fine {
	return {
		id: row.id,
		reason: row.reason,
		amount: row.amount === null ? null : Number(row.amount),
		currency: row.currency,
		school: row.school,
		schoolName: row.schoolName,
		judge: row.judge,
		Judge: row.judge === null ? null : { first: row.judgeFirst, last: row.judgeLast },
		leviedAt: (row.leviedAt ?? new Date(0)).toISOString(),
	};
}

export type JudgeSectionData = {
	now: Date;
	person: number;
	judges: Rows<typeof judgeRepo.getPersonJudges>;
	pools: Rows<typeof jpoolRepo.getJudgePools>;
	counts: Awaited<ReturnType<typeof ballotRepo.getJudgeBallotCounts>>;
	strikes: Rows<typeof strikeRepo.getJudgeStrikes>;
	categories: Rows<typeof categoryRepo.getCategories>;
	events: Rows<typeof eventRepo.getEvents>;
	quizzes: Map<number, { id: number; label: string | null; approval: number }>;
	attempts: Map<number, { completed: number; approved_by: number | null; pending: number }>;
	currentBallots: CurrentBallot[];
	fines: Rows<typeof fineRepo.getFines>;
};

export type EntrySectionData = {
	now: Date;
	entries: Rows<typeof entryRepo.getPersonEntries>;
	students: Rows<typeof entryRepo.getEntryStudents>;
	categories: Rows<typeof categoryRepo.getCategories>;
	events: Rows<typeof eventRepo.getEvents>;
	/** the person's entries' ballots */
	entryRounds: Rows<typeof ballotRepo.getEntryRounds>;
	/** every ballot on those panels */
	panelBallots: Rows<typeof ballotRepo.getEntryRounds>;
	scores: Rows<typeof scoreRepo.getPanelScores>;
	rounds: Rows<typeof roundRepo.getRounds>;
	panels: Rows<typeof panelRepo.getPanels>;
};

/** The person's entries at one tourn as the competitor tab shows them */
export function buildEntries(tourn: { id: number; start: Date; end: Date; settings?: Settings }, data: EntrySectionData): HomeEntry[] {
	const ended = tourn.end < data.now;
	const hideCodes = isOn(tourn.settings?.hide_codes);
	const code = (value: string | null) => (hideCodes ? null : value);
	const categoriesById = new Map(data.categories.map((category) => [category.id, category]));
	const eventSettings = new Map(data.events.map((event) => [event.id, event.settings]));
	const roundSettings = new Map(data.rounds.map((round) => [round.id, round.settings]));
	const panelSettings = new Map(data.panels.map((panel) => [panel.id, panel.settings]));
	const ballotsByPanel = Map.groupBy(data.panelBallots, (row) => row.panel);
	const scoresByPanel = Map.groupBy(data.scores, (score) => score.panel);

	return data.entries.filter((entry) => entry.tourn === tourn.id).map((entry) => {
		const category = categoriesById.get(entry.category ?? 0);
		const event = eventSettings.get(entry.event);

		const Rounds: HomeRound[] = [];
		// rounds are drawn once the tourn has started
		if (tourn.start <= data.now) {
			for (const row of data.entryRounds.filter((row) => row.entry === entry.id)) {
				const levels = { published: row.roundPublished, post_primary: row.roundPostPrimary, post_secondary: row.roundPostSecondary, post_feedback: row.roundPostFeedback };
				if (!roundListed(levels, ended)) continue;
				const visible = roundVisibility(levels, ended);
				const panelBallots = ballotsByPanel.get(row.panel) ?? [];
				const results = visible.judges && panelBallots.every((ballot) => ballot.audit === 1);
				const panel = panelSettings.get(row.panel);
				const round = roundSettings.get(row.round);
				const anonymous = judgeAnonymous(tourn.settings, event);
				const sided = visible.pairing && sideVisible({ type: row.roundType }, panel?.flip_status, event, row.audit === 1);
				const status = flipStatus({ settings: panel });
				// classic's flip page needs a deadline too; it prunes flip_at an hour after it passes
				const flipAt = iso(panel?.flip_at);
				const flipLeft = flipChoices(event, parseFlip(panel?.flip));
				const winner = Number(panel?.flip_winner) || null;

				Rounds.push({
					id: row.round,
					name: row.roundName,
					label: row.roundLabel,
					type: row.roundType,
					published: row.roundPublished,
					post_primary: row.roundPostPrimary,
					post_secondary: row.roundPostSecondary,
					post_feedback: row.roundPostFeedback,
					start: row.roundStart ?? row.timeslotStart
						? roundStart({ round: { start_time: row.roundStart }, timeslot: { start: row.timeslotStart }, panel: { flight: row.panelFlight }, event: { settings: event } }).toISOString()
						: null,
					side: sided ? row.side : null,
					speakerorder: sided ? row.speakerorder : null,
					Panel: {
						id: row.panel,
						letter: row.panelLetter,
						flight: flightNumber({ round: { flighted: row.roundFlighted }, panel: { flight: row.panelFlight } }),
						bye: row.panelBye,
						Flip: flipAt && isFlipOpen({ round, bye: row.panelBye, status, ended, audited: row.audit === 1 })
							? {
								deadline: flipAt,
								won: winner === entry.id,
								// isFlipOpen means the flip is pending, so there is a turn
								turn: flipTurn(status, winner, entry.id)!,
								labels: [sideNames(event).aff, sideNames(event).neg],
								teamOrder: isOn(event?.flip_team_order),
								side: flipLeft.side ? null : row.side,
								order: flipLeft.order || !isOn(event?.flip_team_order) ? null : row.speakerorder,
							}
							: null,
					},
					Room: visible.pairing && row.roomName !== null ? { name: row.roomName, url: row.roomUrl } : null,
					Opponents: visible.pairing
						? [...new Map(panelBallots.filter((ballot) => ballot.entry !== entry.id).map((ballot) => [ballot.entry, { entry: ballot.entry, code: code(ballot.entryCode) }])).values()]
						: [],
					Judges: visible.judges
						? [...new Map(panelBallots.filter((ballot) => ballot.judge !== null).map((ballot) => [ballot.judge, {
							id: ballot.judge as number,
							first: anonymous ? null : ballot.judgeFirst,
							last: anonymous ? null : ballot.judgeLast,
							code: ballot.judgeCode,
						}])).values()]
						: [],
					Scores: results
						? (scoresByPanel.get(row.panel) ?? [])
							.filter((score) => score.entry === entry.id && scoreVisible(score.tag, visible, row.eventType))
							.map((score) => ({ judge: score.judge, tag: score.tag, value: score.value, student: score.student || null }))
						: [],
					strikesDue: isOn(round?.strikes_published) ? iso(round?.strikes_due) : null,
				});
			}
		}

		return {
			id: entry.id,
			code: code(entry.code),
			name: entry.name,
			active: entry.active,
			dropped: entry.dropped,
			waitlist: entry.waitlist,
			unconfirmed: entry.unconfirmed,
			supp: isOn(event?.supp),
			event: entry.event,
			Event: { id: entry.event, name: entry.eventName, abbr: entry.eventAbbr, type: entry.eventType },
			school: entry.school,
			Students: data.students
				.filter((student) => student.entry === entry.id && student.id !== entry.student)
				.map((student) => ({ id: student.id, first: student.first, last: student.last })),
			Prefs: category?.settings?.prefs
				? { type: category.settings.prefs, start: iso(category.settings.strike_start), end: iso(category.settings.strike_end) }
				: null,
			Rounds,
		};
	});
}

export type SchoolSectionData = {
	schools: Rows<typeof schoolRepo.getCoachedSchools>;
	/** every entry of the coached schools */
	schoolEntries: Rows<typeof entryRepo.getEntries>;
	/** the judges entered by the coached schools */
	schoolJudges: Rows<typeof judgeRepo.getJudges>;
	students: Rows<typeof entryRepo.getEntryStudents>;
	events: Rows<typeof eventRepo.getEvents>;
	categories: Rows<typeof categoryRepo.getCategories>;
	strikeCards: Rows<typeof roundRepo.getSchoolStrikeCards>;
	fines: Rows<typeof fineRepo.getFines>;
	/** pending flips on the coached schools' panels, opponents' rows included */
	flips: Rows<typeof panelRepo.getFlips>;
	now: Date;
};

/**
 * The schools the person coaches at one tourn as the school tab shows them. A prefs-only
 * school is listed only while it has a pref sheet to fill: an entry in a category with a
 * strike window
 */
export function buildSchools(tourn: { id: number; settings?: Settings }, data: SchoolSectionData): HomeSchool[] {
	const eventsById = new Map(data.events.map((event) => [event.id, event]));
	const categoriesById = new Map(data.categories.map((category) => [category.id, category]));
	const entriesBySchool = Map.groupBy(data.schoolEntries, (entry) => entry.school);
	const judgesBySchool = Map.groupBy(data.schoolJudges, (judge) => judge.school);
	const studentsByEntry = Map.groupBy(data.students, (student) => student.entry);
	const cardsBySchool = Map.groupBy(data.strikeCards, (card) => card.school);
	const flipsBySchool = Map.groupBy(data.flips.filter((row) => row.settings?.flip_at && isFlipOpen({
		round: row.roundSettings,
		bye: row.bye,
		status: flipStatus(row),
		ended: row.tournEnd !== null && row.tournEnd < data.now,
		audited: row.audit === 1,
	})), (row) => row.school);
	const onsiteWindow = isOn(tourn.settings?.onsite_registration)
		? { start: iso(tourn.settings?.onsite_starts), end: iso(tourn.settings?.onsite_ends) }
		: null;

	const schools: HomeSchool[] = [];
	for (const school of data.schools.filter((school) => school.tourn === tourn.id)) {
		const entries = entriesBySchool.get(school.id) ?? [];
		const active = entries.filter((entry) => entry.active === 1);

		const Prefs: HomePrefSheet[] = [];
		for (const [categoryId, categoryEntries] of Map.groupBy(active, (entry) => eventsById.get(entry.event ?? 0)?.category ?? null)) {
			const category = categoriesById.get(categoryId ?? 0);
			const window = strikeWindow(category?.settings);
			if (!category || !window) continue;
			Prefs.push({
				category: category.id,
				Category: { name: category.name, abbr: category.abbr },
				start: window.start.toISOString(),
				end: window.end.toISOString(),
				entries: categoryEntries.length,
			});
		}

		const base = { id: school.id, name: school.name ?? '', chapter: school.chapter, Prefs };
		if (school.tag === 'prefs') {
			if (Prefs.length) schools.push({ ...base, access: 'prefs' });
			continue;
		}

		schools.push({
			...base,
			access: 'full',
			onsite: school.onsite,
			Counts: {
				entries: active.length,
				events: new Set(active.map((entry) => entry.event)).size,
				judges: (judgesBySchool.get(school.id) ?? []).length,
			},
			Signups: entries
				.filter((entry) => entry.unconfirmed)
				.map((entry) => ({
					entry: entry.id,
					Student: { first: studentsByEntry.get(entry.id)?.[0]?.first ?? null, last: studentsByEntry.get(entry.id)?.[0]?.last ?? null },
					Event: { abbr: eventsById.get(entry.event ?? 0)?.abbr ?? null },
				})),
			Onsite: onsiteWindow,
			StrikeCards: (cardsBySchool.get(school.id) ?? []).map((card) => ({
				round: card.id,
				Round: { name: card.name, label: card.label },
				due: iso(card.settings?.strikes_due),
			})),
			Flips: {
				open: (flipsBySchool.get(school.id) ?? []).length,
				deadline: (flipsBySchool.get(school.id) ?? []).map((row) => iso(row.settings?.flip_at)).sort()[0] ?? null,
			},
			Fines: data.fines.filter((fine) => fine.school === school.id).map(toFine),
		});
	}
	return schools;
}

export type TabSectionData = {
	permissions: Rows<typeof permissionRepo.getPermissions>;
	schoolCounts: Map<number | null, number>;
	entryCounts: Map<number | null, number>;
	/** the tourns with any published result set */
	publishedTourns: Set<number>;
};

/** The person's tab staff permission at one tourn, or null */
export function buildTab(tourn: { id: number }, data: TabSectionData): HomeTab | null {
	const permission = data.permissions.find((permission) => permission.tourn === tourn.id);
	if (!permission) return null;
	return {
		tag: permission.tag,
		details: permission.details,
		Counts: { schools: data.schoolCounts.get(tourn.id) ?? 0, entries: data.entryCounts.get(tourn.id) ?? 0 },
		resultsPublished: data.publishedTourns.has(tourn.id),
	};
}

/** The person's judge rows at one tourn as the judge tab shows them */
export function buildJudges(tourn: { id: number; start: Date; end: Date }, data: JudgeSectionData): HomeJudge[] {
	const running = isRunning(tourn, data.now);
	const categoriesById = new Map(data.categories.map((category) => [category.id, category]));

	return data.judges.filter((judge) => judge.tourn === tourn.id).map((judge) => {
		const category = categoriesById.get(judge.category);
		const pools = data.pools.filter((pool) => pool.judge === judge.id);

		const requirements: QuizRequirement[] = requiredQuizIds(category?.settings).map((quiz) => ({ quiz, requiredBy: category?.name ?? '' }));
		for (const pool of pools) {
			requirements.push(...requiredQuizIds(pool.settings).map((quiz) => ({ quiz, requiredBy: pool.name ?? '' })));
		}

		const shown = pools
			.filter((pool) => isOn(pool.settings?.registrant) || isOn(pool.settings?.show_judges))
			.map((pool) => ({
				...pool,
				Site: pool.site ? { name: pool.siteName } : null,
				message: isOn(pool.settings?.message) ? String(pool.settings?.message) : null,
			}));
		const trainingEvent = trainingDue(judge, category?.settings, tourn.end, data.now)
			? data.events.find((event) => event.category === judge.category)
			: undefined;

		return {
			id: judge.id,
			code: judge.code,
			obligation: judge.obligation,
			hired: judge.hired,
			active: judge.active,
			category: judge.category,
			Category: { id: judge.category, name: judge.categoryName, abbr: judge.categoryAbbr },
			school: judge.school,
			School: judge.school === null ? null : { id: judge.school, name: judge.schoolName },
			Jpools: shown
				.filter((pool) => !isOn(pool.settings?.standby))
				.map((pool) => ({ id: pool.id, name: pool.name, site: pool.site || null, Site: pool.Site, message: pool.message })),
			Standbys: running
				? shown
					.filter((pool): pool is typeof pool & { standbyName: string; standbyStart: Date; standbyEnd: Date } => isOn(pool.settings?.standby) && !!pool.standbyEnd && data.now < pool.standbyEnd)
					.map((pool) => ({
						jpool: pool.id,
						name: pool.name,
						Site: pool.Site,
						message: pool.message,
						Timeslot: { name: pool.standbyName, start: pool.standbyStart.toISOString(), end: pool.standbyEnd.toISOString() },
					}))
				: [],
			Training: trainingEvent ? { event: trainingEvent.id, Event: { abbr: trainingEvent.abbr, type: trainingEvent.type } } : null,
			roundsJudged: data.counts.get(judge.id)?.panels ?? 0,
			ballotsEntered: data.counts.get(judge.id)?.ballots ?? 0,
			feedbackUntil: running ? tourn.end.toISOString() : null,
			Strikes: data.strikes
				.filter((strike): strike is typeof strike & { type: Strike['type'] } => strike.judge === judge.id && STRIKE_TYPES.includes(strike.type ?? ''))
				.map((strike) => ({
					id: strike.id,
					type: strike.type,
					start: strike.start?.toISOString() ?? null,
					end: strike.end?.toISOString() ?? null,
					school: strike.school,
					School: strike.school === null ? null : { name: strike.schoolName },
					entry: strike.entry,
					Entry: strike.entry === null ? null : { code: strike.entryCode },
				})),
			Quizzes: judgeQuizzes(requirements, data.quizzes, data.attempts),
			CurrentBallots: running ? data.currentBallots.filter((ballot) => ballot.JudgeId === judge.id) : [],
			Fines: data.fines
				.filter((fine) => fine.judge === judge.id || (fine.judge === null && fine.person === data.person && fine.tourn === tourn.id))
				.map(toFine),
		};
	});
}
