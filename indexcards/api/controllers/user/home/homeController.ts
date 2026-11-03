import type { Response } from 'express';
import type { HomeLiveDoc, HomeResponse, HomeTourn } from '@tabroom/types';
import { db } from '../../../data/database.js';
import { getPerson } from '../../../middleware/auth/authorization.js';
import type { ValidatedRequest } from '../../../middleware/validation.js';
import categoryRepo from '../../../repos/categoryRepo.js';
import entryRepo from '../../../repos/entryRepo.js';
import eventRepo from '../../../repos/eventRepo.js';
import judgeRepo from '../../../repos/judgeRepo.js';
import permissionRepo from '../../../repos/permissionRepo.js';
import personRepo from '../../../repos/personRepo.js';
import schoolRepo from '../../../repos/schoolRepo.js';
import tabroomRepo from '../../../repos/tabroomRepo.js';
import tournRepo from '../../../repos/tournRepo.js';
import { compareTourns, groupBy, homeWindow, isOnline, paradigmReview, rolesFor, sqlDatetime } from '../../../services/home/homeRules.js';

// The settings each card reads, fetched once per table for every tourn on the page
const TOURN_SETTINGS = ['currency', 'onsite_registration', 'onsite_starts', 'onsite_ends', 'hide_codes', 'legion', 'mock_trial_registration', 'nsda_nats', 'online_rooms', 'campus_zone'];
const EVENT_SETTINGS = ['aff_label', 'neg_label', 'online_mode', 'flight_offset', 'supp', 'anonymous_public', 'sidelock_elims', 'online_ballots', 'start_button', 'start_button_text'];
const CATEGORY_SETTINGS = ['livedoc_url', 'livedoc_caption', 'rounds_per', 'prefs', 'strike_start', 'strike_end', 'required_quizzes', 'paradigm_quiz', 'show_training', 'conflicts'];

const unique = (ids: (number | null)[]) => [...new Set(ids.filter((id): id is number => id !== null))];

/**
 * GET /user/home: every tournament card the person's home page draws, in one response.
 * Queries run in stages; each stage takes the ids the one before found.
 */
export async function getHome(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const current: boolean = req.query.current;
	const now = new Date();

	// the tourn date columns are nullable in the schema but never null in the data
	const tourns = (await tournRepo.getPersonTourns(db, person.id, { ...homeWindow(now, current), settings: TOURN_SETTINGS }))
		.filter((tourn): tourn is typeof tourn & { start: Date; end: Date } => tourn.start !== null && tourn.end !== null);
	const tournIds = tourns.map((tourn) => tourn.id);

	const [judges, entries, schools, permissions, events, Person, tabroomSettings] = await Promise.all([
		judgeRepo.getPersonJudges(db, person.id, { tourns: tournIds }),
		entryRepo.getPersonEntries(db, person.id, { tourns: tournIds }),
		schoolRepo.getCoachedSchools(db, person.id, { tourns: tournIds }),
		permissionRepo.getPermissions(db, { person: person.id, tourns: tournIds }),
		eventRepo.getEvents(db, { tourns: tournIds, settings: EVENT_SETTINGS }),
		personRepo.getPerson(db, person.id, { settings: ['paradigm', 'email_unconfirmed'], withTimestamps: true }),
		tabroomRepo.getSettings(db, ['paradigm_review_start']),
	]);

	const categories = await categoryRepo.getCategories(db, {
		ids: unique([...judges.map((judge) => judge.category), ...entries.map((entry) => entry.category)]),
		settings: CATEGORY_SETTINGS,
	});

	const eventsByTourn = groupBy(events, (event) => event.tourn);
	const categoriesByTourn = groupBy(categories, (category) => category.tourn);

	const cards: HomeTourn[] = [];
	for (const tourn of tourns) {
		const roles = rolesFor({ judges, entries, schools, permissions }, tourn.id);
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
			OnlineRooms: [],
			Judges: [],
			Entries: [],
			Schools: [],
			Tab: null,
		});
	}
	cards.sort((a, b) => compareTourns({ start: new Date(a.start), name: a.name }, { start: new Date(b.start), name: b.name }));

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
