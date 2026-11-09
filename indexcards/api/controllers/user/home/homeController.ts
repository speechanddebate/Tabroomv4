import type { Response } from 'express';
import type { HomeLiveDoc, HomeResponse, HomeTourn, TournRoom } from '@tabroom/types';
import { db } from '../../../data/database.js';
import { getPerson } from '../../../middleware/auth/authorization.js';
import type { Actor } from '../../../middleware/auth/types.js';
import type { ValidatedRequest } from '../../../middleware/validation.js';
import ballotRepo from '../../../repos/ballotRepo.js';
import categoryRepo from '../../../repos/categoryRepo.js';
import entryRepo from '../../../repos/entryRepo.js';
import eventRepo from '../../../repos/eventRepo.js';
import fineRepo from '../../../repos/fineRepo.js';
import jpoolRepo from '../../../repos/jpoolRepo.js';
import judgeRepo from '../../../repos/judgeRepo.js';
import panelRepo from '../../../repos/panelRepo.js';
import permissionRepo from '../../../repos/permissionRepo.js';
import personRepo from '../../../repos/personRepo.js';
import quizRepo from '../../../repos/quizRepo.js';
import roundRepo from '../../../repos/roundRepo.js';
import schoolRepo from '../../../repos/schoolRepo.js';
import scoreRepo from '../../../repos/scoreRepo.js';
import strikeRepo from '../../../repos/strikeRepo.js';
import tabroomRepo from '../../../repos/tabroomRepo.js';
import tournRepo from '../../../repos/tournRepo.js';
import { buildCurrentBallots, CURRENT_BALLOT_SETTINGS, settingsById } from '../../../services/judges/currentBallots.js';
import { compareTourns, homeWindow, isOnline, isRunning, paradigmReview, requiredQuizIds, rolesFor, sqlDatetime } from '../../../services/home/homeRules.js';
import { getEntryPrepRooms, getSchoolRooms, getUtilityRooms } from '../../../services/onlineRooms/onlineRoomService.js';
import { buildEntries, buildJudges, buildSchools, buildTab, type EntrySectionData, type JudgeSectionData, type SchoolSectionData, type TabSectionData } from './sections.js';

function unique<T>(values: (T | null)[]): T[] {
	return [...new Set(values.filter((value): value is T => value !== null))];
}

/** The rooms the person may enter at a running online tourn: squad rooms, prep rooms, and the tourn's utility rooms */
async function onlineRooms(tournId: number, actor: Actor, mine: { schools: number[]; entries: number[] }): Promise<TournRoom[]> {
	const [squad, prep, utility] = await Promise.all([
		getSchoolRooms(db, tournId, mine.schools, actor),
		getEntryPrepRooms(db, tournId, mine.entries, actor),
		getUtilityRooms(db, tournId, actor),
	]);
	return [
		...mine.schools.flatMap((school) => {
			const room = squad.get(school);
			return room ? [{ ...room.display, kind: 'school' as const, id: school }] : [];
		}),
		...mine.entries.flatMap((entry) => {
			const room = prep.get(entry);
			return room ? [{ ...room.display, kind: 'prep' as const, id: entry }] : [];
		}),
		...(utility ?? []).map((room) => room.display),
	];
}

// The settings each card reads, fetched once per table for every tourn on the page
const TOURN_SETTINGS = unique([...CURRENT_BALLOT_SETTINGS.tourn, 'currency', 'onsite_registration', 'onsite_starts', 'onsite_ends', 'onsite_registration_nodash', 'hide_codes', 'ncfl', 'mock_trial_registration', 'nsda_nats', 'online_rooms', 'campus_zone']);
const EVENT_SETTINGS = unique([...CURRENT_BALLOT_SETTINGS.event, 'supp', 'anonymous_public', 'no_anon_dashboard', 'flip_team_order']);
const CATEGORY_SETTINGS = ['livedoc_url', 'livedoc_caption', 'rounds_per', 'prefs', 'strike_start', 'strike_end', 'required_quizzes', 'paradigm_quiz', 'show_training', 'conflicts'];
const JPOOL_SETTINGS = ['registrant', 'show_judges', 'standby', 'required_quizzes', 'paradigm_quiz', 'message'];
const ROUND_SETTINGS = unique([...CURRENT_BALLOT_SETTINGS.round, 'strikes_published', 'strikes_due', 'flip_published']);
const PANEL_SETTINGS = unique([...CURRENT_BALLOT_SETTINGS.panel, 'flip_at', 'flip_winner', 'flip']);

/**
 * GET /user/home: every tournament card the person's home page draws, in one response.
 * Queries run in stages; each stage takes the ids the one before found.
 */
export async function getHome(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const current: boolean = req.query.current;
	const now = new Date();

	// the tourn date columns are nullable in the schema but never null in the data, so the filter is mostly just for types
	const tourns = (await tournRepo.getPersonTourns(db, person.id, { ...homeWindow(now, current), settings: TOURN_SETTINGS }))
		.filter((tourn): tourn is typeof tourn & { start: Date; end: Date } => tourn.start !== null && tourn.end !== null);
	const tournIds = tourns.map((tourn) => tourn.id);

	const [judges, entries, schools, permissions, events, Person, tabroomSettings, attempts] = await Promise.all([
		judgeRepo.getPersonJudges(db, person.id, { tourns: tournIds, settings: ['ballot_trained'] }),
		entryRepo.getPersonEntries(db, person.id, { tourns: tournIds }),
		schoolRepo.getCoachedSchools(db, person.id, { tourns: tournIds }),
		permissionRepo.getPermissions(db, { person: person.id, tourns: tournIds }),
		eventRepo.getEvents(db, { tourns: tournIds, settings: EVENT_SETTINGS }),
		personRepo.getPerson(db, person.id, { settings: ['paradigm', 'email_unconfirmed'], withTimestamps: true }),
		tabroomRepo.getSettings(db, ['paradigm_review_start']),
		quizRepo.getPersonQuizzes(db, { person: person.id }),
	]);

	const judgeIds = judges.map((judge) => judge.id);
	const fullSchoolIds = schools.filter((school) => school.tag === 'chapter').map((school) => school.id);
	const tabTournIds = unique(permissions.map((permission) => permission.tourn));
	const runningTourns = new Set(tourns.filter((tourn) => isRunning(tourn, now)).map((tourn) => tourn.id));
	const [categories, pools, counts, strikes, panelRows, fines, entryRounds, schoolEntries, schoolJudges, strikeCards, schoolFlips, schoolCounts, entryCounts, publishedTourns] = await Promise.all([
		categoryRepo.getCategories(db, { ids: unique([...judges, ...entries, ...events].map((row) => row.category)), settings: CATEGORY_SETTINGS }),
		jpoolRepo.getJudgePools(db, { judges: judgeIds, settings: JPOOL_SETTINGS }),
		ballotRepo.getJudgeBallotCounts(db, { judges: judgeIds }),
		strikeRepo.getJudgeStrikes(db, { judges: judgeIds }),
		ballotRepo.getJudgePanels(db, { judges: judges.filter((judge) => judge.tourn !== null && runningTourns.has(judge.tourn)).map((judge) => judge.id) }),
		fineRepo.getFines(db, { person: person.id, tourns: tournIds, judges: judgeIds, schools: fullSchoolIds }),
		ballotRepo.getEntryRounds(db, { entries: entries.filter((entry) => tourns.some((tourn) => tourn.id === entry.tourn && tourn.start <= now)).map((entry) => entry.id) }),
		entryRepo.getEntries(db, { schools: schools.map((school) => school.id) }),
		judgeRepo.getJudges(db, { schools: fullSchoolIds }),
		roundRepo.getSchoolStrikeCards(db, { schools: fullSchoolIds }),
		panelRepo.getFlips(db, { schools: fullSchoolIds }),
		schoolRepo.countByTourn(db, { tourns: tabTournIds }),
		entryRepo.countByTourn(db, { tourns: tabTournIds, active: true }),
		tournRepo.getTourns(db, { ids: tabTournIds, hasPublishedResults: true }),
	]);

	const panelIds = unique(entryRounds.map((row) => row.panel));
	const [quizzes, rounds, panels, panelBallots, scores, students] = await Promise.all([
		quizRepo.getQuizzes(db, { ids: unique([...categories, ...pools].flatMap((owner) => requiredQuizIds(owner.settings))) }),
		roundRepo.getRounds(db, {}, { ids: unique([...panelRows, ...entryRounds].map((row) => row.round)), settings: ROUND_SETTINGS, unpublished: true }),
		panelRepo.getPanels(db, { ids: unique([...panelRows.map((row) => row.panel), ...panelIds]), settings: PANEL_SETTINGS }),
		ballotRepo.getEntryRounds(db, { panels: panelIds }),
		scoreRepo.getPanelScores(db, panelIds, { tags: ['winloss', 'rank', 'point', 'refute'] }),
		entryRepo.getEntryStudents(db, unique([...entries.map((entry) => entry.id), ...schoolEntries.filter((entry) => entry.unconfirmed).map((entry) => entry.id)])),
	]);

	const currentBallots = buildCurrentBallots(panelRows, {
		now,
		tourns: new Map(tourns.map((tourn) => [tourn.id, tourn])),
		events: settingsById(events),
		rounds: settingsById(rounds),
		panels: settingsById(panels),
	});

	const judgeSection: JudgeSectionData = {
		now,
		person: person.id,
		judges,
		pools,
		counts,
		strikes,
		categories,
		events,
		quizzes: new Map(quizzes.map((quiz) => [quiz.id, quiz])),
		attempts: new Map(attempts.map((attempt) => [attempt.quiz, attempt])),
		currentBallots,
		fines,
	};
	const entrySection: EntrySectionData = { now, entries, students, categories, events, entryRounds, panelBallots, scores, rounds, panels };
	const schoolSection: SchoolSectionData = { now, schools, schoolEntries, schoolJudges, students, events, categories, strikeCards, fines, flips: schoolFlips };
	const tabSection: TabSectionData = { permissions, schoolCounts, entryCounts, publishedTourns: new Set(publishedTourns.map((tourn) => tourn.id)) };

	const eventsByTourn = Map.groupBy(events, (event) => event.tourn);
	const categoriesByTourn = Map.groupBy(categories, (category) => category.tourn);

	const cards: HomeTourn[] = [];
	for (const tourn of tourns) {
		const Schools = buildSchools(tourn, schoolSection);
		const roles = rolesFor({ judges, entries, schools: Schools.map(() => ({ tourn: tourn.id })), permissions }, tourn.id);
		if (!roles.length) continue;

		const LiveDocs: HomeLiveDoc[] = [];
		for (const category of categoriesByTourn.get(tourn.id) ?? []) {
			const url = category.settings?.livedoc_url;
			if (!url) continue;
			LiveDocs.push({
				category: category.id,
				Category: { name: category.name, abbr: category.abbr },
				url,
				caption: category.settings?.livedoc_caption ?? null,
			});
		}

		cards.push({
			id: tourn.id,
			name: tourn.name,
			city: tourn.city,
			state: tourn.state,
			country: tourn.country,
			tz: tourn.tz ?? 'UTC',
			webname: tourn.webname ?? '',
			start: tourn.start.toISOString(),
			end: tourn.end.toISOString(),
			reg_start: (tourn.reg_start ?? tourn.start).toISOString(),
			reg_end: (tourn.reg_end ?? tourn.start).toISOString(),
			online: isOnline(eventsByTourn.get(tourn.id) ?? []),
			roles,
			LiveDocs,
			TournRooms: [],
			Judges: buildJudges(tourn, judgeSection),
			Entries: buildEntries(tourn, entrySection),
			Schools,
			Tab: buildTab(tourn, tabSection),
		});
	}
	cards.sort((a, b) => compareTourns({ start: new Date(a.start), name: a.name }, { start: new Date(b.start), name: b.name }));

	// The online rooms service resolves one room at a time, so this runs only for running
	// online tourns, normally none or one
	await Promise.all(cards.filter((card) => card.online && runningTourns.has(card.id)).map(async (card) => {
		card.TournRooms = await onlineRooms(card.id, req.actor, {
			schools: card.Schools.filter((school) => school.access === 'full').map((school) => school.id),
			entries: entries.filter((entry) => entry.tourn === card.id).map((entry) => entry.id),
		});
	}));

	return res.json({
		now: now.toISOString(),
		Alerts: {
			paradigmReview: paradigmReview(
				tabroomSettings.find((setting) => setting.tag === 'paradigm_review_start')?.value_date ?? null,
				{ exists: !!Person?.settings?.paradigm, lastReviewed: sqlDatetime(Person?.settingsTimestamps?.paradigm?.timestamp) },
			),
			emailUnconfirmed: !!Person?.settings?.email_unconfirmed,
			tzMissing: !Person?.tz && cards.some((card) => new Date(card.end) >= now),
		},
		Tourns: cards,
	} satisfies HomeResponse);
}

export default {
	getHome,
};
