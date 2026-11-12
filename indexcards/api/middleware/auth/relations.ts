import type { SelectQueryBuilder } from 'kysely';
import type { Database } from '../../data/database.js';
import type { DB } from '../../data/schema.js';

// each relation joins different tables, so the builder's table set can't be one type
// oxlint-disable-next-line typescript/no-explicit-any
type Query = SelectQueryBuilder<DB, any, object>;

/**
 * A way a person relates to a resource. query holds only the joins and fixed conditions;
 * the engine filters on the resource and person columns, so one definition answers can, who, and which.
 */
export type Relation = {
	query: (db: Database) => Query;
	/** the column holding the resource's id, or a column per named part for a composite id like a ballot's */
	resource: string | Record<string, string>;
	/** the column holding the related person's id */
	person: string;
	/** the column holding the tourn the resource belongs to, which bounds which(). Unset for resources outside a tourn */
	tourn?: string;
};

/**
 * Who holds each kind of permission, defined once. Each takes a query and the column holding the
 * scope's id, and joins `permission` on it, so a relation built on one names permission.person.
 * How a resource reaches that column is the relation's business.
 */
const roles = {
	/** anyone on the tourn's staff: an owner, tabber, or checker of the whole tourn or of one of its events or categories */
	tournStaff: (query: Query, tourn: string) => query
		.innerJoin('permission', 'permission.tourn', tourn)
		.where('permission.tag', 'in', ['owner', 'tabber', 'checker']),
	/** tourn-wide owners and tabbers. Event and category scoped rows of these tags are eventTab and categoryTab */
	tournTab: (query: Query, tourn: string) => query
		.innerJoin('permission', 'permission.tourn', tourn)
		.where('permission.tag', 'in', ['owner', 'tabber'])
		.where('permission.event', 'is', null)
		.where('permission.category', 'is', null),
	tournOwner: (query: Query, tourn: string) => query
		.innerJoin('permission', 'permission.tourn', tourn)
		.where('permission.tag', '=', 'owner')
		.where('permission.event', 'is', null)
		.where('permission.category', 'is', null),
	tournChecker: (query: Query, tourn: string) => query
		.innerJoin('permission', 'permission.tourn', tourn)
		.where('permission.tag', '=', 'checker')
		.where('permission.event', 'is', null)
		.where('permission.category', 'is', null),
	eventTab: (query: Query, event: string) => query
		.innerJoin('permission', 'permission.event', event)
		.where('permission.tag', 'in', ['owner', 'tabber']),
	eventChecker: (query: Query, event: string) => query
		.innerJoin('permission', 'permission.event', event)
		.where('permission.tag', '=', 'checker'),
	categoryTab: (query: Query, category: string) => query
		.innerJoin('permission', 'permission.category', category)
		.where('permission.tag', 'in', ['owner', 'tabber']),
	categoryChecker: (query: Query, category: string) => query
		.innerJoin('permission', 'permission.category', category)
		.where('permission.tag', '=', 'checker'),
	circuitAdmin: (query: Query, circuit: string) => query
		.innerJoin('permission', 'permission.circuit', circuit)
		.where('permission.tag', '=', 'circuit'),
	coach: (query: Query, chapter: string) => query
		.innerJoin('permission', 'permission.chapter', chapter)
		.where('permission.tag', '=', 'chapter'),
	prefsCoach: (query: Query, chapter: string) => query
		.innerJoin('permission', 'permission.chapter', chapter)
		.where('permission.tag', '=', 'prefs'),
	regionAdmin: (query: Query, region: string) => query
		.innerJoin('permission', 'permission.region', region)
		.where('permission.tag', '=', 'region'),
	districtChair: (query: Query, district: string) => query
		.innerJoin('permission', 'permission.district', district)
		.where('permission.tag', '=', 'chair'),
	districtMember: (query: Query, district: string) => query
		.innerJoin('permission', 'permission.district', district)
		.where('permission.tag', '=', 'member'),
	districtWsdc: (query: Query, district: string) => query
		.innerJoin('permission', 'permission.district', district)
		.where('permission.tag', '=', 'wsdc'),
};

// A ballot is a judge's rows on a panel. Every ballot relation starts from the ballot table,
// so both ids must name a real ballot and staff can't act on a judge the panel doesn't have
const BALLOT = { judgeId: 'ballot.judge', panelId: 'ballot.panel' };

export const relations = {
	tourn: {
		tournStaff: {
			query: db => roles.tournStaff(db.selectFrom('tourn'), 'tourn.id'),
			resource: 'tourn.id',
			person: 'permission.person',
			tourn: 'tourn.id',
		},
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('tourn'), 'tourn.id'),
			resource: 'tourn.id',
			person: 'permission.person',
			tourn: 'tourn.id',
		},
		tournOwner: {
			query: db => roles.tournOwner(db.selectFrom('tourn'), 'tourn.id'),
			resource: 'tourn.id',
			person: 'permission.person',
			tourn: 'tourn.id',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('tourn'), 'tourn.id'),
			resource: 'tourn.id',
			person: 'permission.person',
			tourn: 'tourn.id',
		},
		// read-only: admins of a circuit the tourn is listed in, once the listing is approved
		circuitAdmin: {
			query: db => roles.circuitAdmin(
				db.selectFrom('tourn_circuit').where('tourn_circuit.approved', '=', 1),
				'tourn_circuit.circuit',
			),
			resource: 'tourn_circuit.tourn',
			person: 'permission.person',
			tourn: 'tourn_circuit.tourn',
		},
	},
	category: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('category'), 'category.tourn'),
			resource: 'category.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('category'), 'category.tourn'),
			resource: 'category.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryTab: {
			query: db => roles.categoryTab(db.selectFrom('category'), 'category.id'),
			resource: 'category.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryChecker: {
			query: db => roles.categoryChecker(db.selectFrom('category'), 'category.id'),
			resource: 'category.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
	},
	event: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('event'), 'event.tourn'),
			resource: 'event.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('event'), 'event.tourn'),
			resource: 'event.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventTab: {
			query: db => roles.eventTab(db.selectFrom('event'), 'event.id'),
			resource: 'event.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventChecker: {
			query: db => roles.eventChecker(db.selectFrom('event'), 'event.id'),
			resource: 'event.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
	},
	round: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('round').innerJoin('event', 'event.id', 'round.event'), 'event.tourn'),
			resource: 'round.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('round').innerJoin('event', 'event.id', 'round.event'), 'event.tourn'),
			resource: 'round.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventTab: {
			query: db => roles.eventTab(db.selectFrom('round'), 'round.event'),
			resource: 'round.id',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
		eventChecker: {
			query: db => roles.eventChecker(db.selectFrom('round'), 'round.event'),
			resource: 'round.id',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
	},
	panel: {
		tournTab: {
			query: db => roles.tournTab(
				db.selectFrom('panel')
					.innerJoin('round', 'round.id', 'panel.round')
					.innerJoin('event', 'event.id', 'round.event'),
				'event.tourn',
			),
			resource: 'panel.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(
				db.selectFrom('panel')
					.innerJoin('round', 'round.id', 'panel.round')
					.innerJoin('event', 'event.id', 'round.event'),
				'event.tourn',
			),
			resource: 'panel.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventTab: {
			query: db => roles.eventTab(db.selectFrom('panel').innerJoin('round', 'round.id', 'panel.round'), 'round.event'),
			resource: 'panel.id',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
		eventChecker: {
			query: db => roles.eventChecker(db.selectFrom('panel').innerJoin('round', 'round.id', 'panel.round'), 'round.event'),
			resource: 'panel.id',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
	},
	timeslot: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('timeslot'), 'timeslot.tourn'),
			resource: 'timeslot.id',
			person: 'permission.person',
			tourn: 'timeslot.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('timeslot'), 'timeslot.tourn'),
			resource: 'timeslot.id',
			person: 'permission.person',
			tourn: 'timeslot.tourn',
		},
		// event staff see a timeslot through their events' rounds in it, as in classic's timeslots.mas
		eventTab: {
			query: db => roles.eventTab(db.selectFrom('round'), 'round.event'),
			resource: 'round.timeslot',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
		eventChecker: {
			query: db => roles.eventChecker(db.selectFrom('round'), 'round.event'),
			resource: 'round.timeslot',
			person: 'permission.person',
			tourn: 'permission.tourn',
		},
	},
	// entry.tourn is null or wrong on some rows, so entry relations reach the tourn through the event (or, for coaches, the school)
	entry: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('entry').innerJoin('event', 'event.id', 'entry.event'), 'event.tourn'),
			resource: 'entry.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('entry').innerJoin('event', 'event.id', 'entry.event'), 'event.tourn'),
			resource: 'entry.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventTab: {
			query: db => roles.eventTab(db.selectFrom('entry').innerJoin('event', 'event.id', 'entry.event'), 'entry.event'),
			resource: 'entry.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventChecker: {
			query: db => roles.eventChecker(db.selectFrom('entry').innerJoin('event', 'event.id', 'entry.event'), 'entry.event'),
			resource: 'entry.id',
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		// a student on the entry, linked to an account and not retired
		competitor: {
			query: db => db.selectFrom('entry')
				.innerJoin('event', 'event.id', 'entry.event')
				.innerJoin('entry_student', 'entry_student.entry', 'entry.id')
				.innerJoin('student', 'student.id', 'entry_student.student')
				.where('student.retired', '=', 0),
			resource: 'entry.id',
			person: 'student.person',
			tourn: 'event.tourn',
		},
		// coaches of the school that entered it, not of each competitor's own chapter.
		// The event's tourn is the more correct path semantically, but the coach relations bound which() by the school's:
		// MariaDB can then start from the coach's permission rows instead of walking every entry
		// at the tourn and is much faster. The two should always match.
		coach: {
			query: db => roles.coach(
				db.selectFrom('entry')
					.innerJoin('event', 'event.id', 'entry.event')
					.innerJoin('school', 'school.id', 'entry.school'),
				'school.chapter',
			),
			resource: 'entry.id',
			person: 'permission.person',
			tourn: 'school.tourn',
		},
		prefsCoach: {
			query: db => roles.prefsCoach(
				db.selectFrom('entry')
					.innerJoin('event', 'event.id', 'entry.event')
					.innerJoin('school', 'school.id', 'entry.school'),
				'school.chapter',
			),
			resource: 'entry.id',
			person: 'permission.person',
			// the school's tourn, as for coach above
			tourn: 'school.tourn',
		},
		// a competitor doing their own prefs, which their school's chapter allows with the self_prefs setting
		selfPrefs: {
			query: db => db.selectFrom('entry')
				.innerJoin('event', 'event.id', 'entry.event')
				.innerJoin('school', 'school.id', 'entry.school')
				.innerJoin('chapter_setting', 'chapter_setting.chapter', 'school.chapter')
				.innerJoin('entry_student', 'entry_student.entry', 'entry.id')
				.innerJoin('student', 'student.id', 'entry_student.student')
				.where('chapter_setting.tag', '=', 'self_prefs')
				.where('chapter_setting.value', '=', '1')
				.where('student.retired', '=', 0),
			resource: 'entry.id',
			person: 'student.person',
			tourn: 'event.tourn',
		},
	},
	school: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('school'), 'school.tourn'),
			resource: 'school.id',
			person: 'permission.person',
			tourn: 'school.tourn',
		},
		coach: {
			query: db => roles.coach(db.selectFrom('school'), 'school.chapter'),
			resource: 'school.id',
			person: 'permission.person',
			tourn: 'school.tourn',
		},
		schoolContact: {
			query: db => db.selectFrom('school').innerJoin('contact', 'contact.school', 'school.id'),
			resource: 'school.id',
			person: 'contact.person',
			tourn: 'school.tourn',
		},
	},
	chapter: {
		coach: {
			query: db => roles.coach(db.selectFrom('chapter'), 'chapter.id'),
			resource: 'chapter.id',
			person: 'permission.person',
		},
		prefsCoach: {
			query: db => roles.prefsCoach(db.selectFrom('chapter'), 'chapter.id'),
			resource: 'chapter.id',
			person: 'permission.person',
		},
	},
	student: {
		coach: {
			query: db => roles.coach(db.selectFrom('student'), 'student.chapter'),
			resource: 'student.id',
			person: 'permission.person',
		},
		self: {
			query: db => db.selectFrom('student').where('student.retired', '=', 0),
			resource: 'student.id',
			person: 'student.person',
		},
	},
	judge: {
		// category is joined only for which()'s tourn bound; a left join keeps a judge with no category their own access
		self: {
			query: db => db.selectFrom('judge').leftJoin('category', 'category.id', 'judge.category'),
			resource: 'judge.id',
			person: 'judge.person',
			tourn: 'category.tourn',
		},
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('judge').innerJoin('category', 'category.id', 'judge.category'), 'category.tourn'),
			resource: 'judge.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryTab: {
			query: db => roles.categoryTab(db.selectFrom('judge').innerJoin('category', 'category.id', 'judge.category'), 'judge.category'),
			resource: 'judge.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('judge').innerJoin('category', 'category.id', 'judge.category'), 'category.tourn'),
			resource: 'judge.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryChecker: {
			query: db => roles.categoryChecker(db.selectFrom('judge').innerJoin('category', 'category.id', 'judge.category'), 'judge.category'),
			resource: 'judge.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
	},
	circuit: {
		circuitAdmin: {
			query: db => roles.circuitAdmin(db.selectFrom('circuit'), 'circuit.id'),
			resource: 'circuit.id',
			person: 'permission.person',
		},
	},
	region: {
		regionAdmin: {
			query: db => roles.regionAdmin(db.selectFrom('region'), 'region.id'),
			resource: 'region.id',
			person: 'permission.person',
		},
		circuitAdmin: {
			query: db => roles.circuitAdmin(db.selectFrom('region'), 'region.circuit'),
			resource: 'region.id',
			person: 'permission.person',
		},
	},
	district: {
		districtChair: {
			query: db => roles.districtChair(db.selectFrom('district'), 'district.id'),
			resource: 'district.id',
			person: 'permission.person',
		},
		districtMember: {
			query: db => roles.districtMember(db.selectFrom('district'), 'district.id'),
			resource: 'district.id',
			person: 'permission.person',
		},
		districtWsdc: {
			query: db => roles.districtWsdc(db.selectFrom('district'), 'district.id'),
			resource: 'district.id',
			person: 'permission.person',
		},
	},
	jpool: {
		tournTab: {
			query: db => roles.tournTab(db.selectFrom('jpool').innerJoin('category', 'category.id', 'jpool.category'), 'category.tourn'),
			resource: 'jpool.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		tournChecker: {
			query: db => roles.tournChecker(db.selectFrom('jpool').innerJoin('category', 'category.id', 'jpool.category'), 'category.tourn'),
			resource: 'jpool.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryTab: {
			query: db => roles.categoryTab(db.selectFrom('jpool').innerJoin('category', 'category.id', 'jpool.category'), 'jpool.category'),
			resource: 'jpool.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
		categoryChecker: {
			query: db => roles.categoryChecker(db.selectFrom('jpool').innerJoin('category', 'category.id', 'jpool.category'), 'jpool.category'),
			resource: 'jpool.id',
			person: 'permission.person',
			tourn: 'category.tourn',
		},
	},
	ballot: {
		// a left join on category, as for judge.self
		judgeSelf: {
			query: db => db.selectFrom('ballot')
				.innerJoin('judge', 'judge.id', 'ballot.judge')
				.leftJoin('category', 'category.id', 'judge.category'),
			resource: BALLOT,
			person: 'judge.person',
			tourn: 'category.tourn',
		},
		tournTab: {
			query: db => roles.tournTab(
				db.selectFrom('ballot')
					.innerJoin('panel', 'panel.id', 'ballot.panel')
					.innerJoin('round', 'round.id', 'panel.round')
					.innerJoin('event', 'event.id', 'round.event'),
				'event.tourn',
			),
			resource: BALLOT,
			person: 'permission.person',
			tourn: 'event.tourn',
		},
		eventTab: {
			query: db => roles.eventTab(
				db.selectFrom('ballot')
					.innerJoin('panel', 'panel.id', 'ballot.panel')
					.innerJoin('round', 'round.id', 'panel.round')
					.innerJoin('event', 'event.id', 'round.event'),
				'round.event',
			),
			resource: BALLOT,
			person: 'permission.person',
			tourn: 'event.tourn',
		},
	},
} satisfies Record<string, Record<string, Relation>>;
