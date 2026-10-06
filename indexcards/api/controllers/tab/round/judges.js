import { NotFound } from '../../../helpers/problem.js';
import logger from '../../../helpers/logger.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';
export async function getRoundAvailableJudges (req, res) {

	// Returns a list of judges who can judge this round, filtering out any
	// judge currently judging a non-async round, with a time constraint, or
	// those blocked against the event.

	// This should be the only time I actually resort to the adaptive sql
	// nonsense approach that the predecessor of this code did most foully, but
	// in this case it truly is the most efficient way to do things, both in
	// terms of code density and execution speed. I'm sorry.  I really am.
	// -- CLP

	let round = {};

	if (req.round) {
		round = req.round;
	} else {
		round = await summon(kdb, 'round',req.params.roundId);
	}

	let judgeQuery = sql`
		select
			judge.id, judge.first, judge.middle, judge.last, judge.code,
			judge.hired, judge.obligation,
			judge.person, judge.school school, region.id region, district.id district,
			tab_rating.value tab_rating, chapter.state state, neutral.value neutral
	`;

	if (round.jpool) {
		// Pull judges from the judge pools linked to this round
		judgeQuery = sql` ${judgeQuery}
			from (judge, jpool_judge jpj, jpool_round jpr, round, timeslot)
				left join school on judge.school = school.id
				left join region on school.region = region.id
				left join district on school.district = district.id
				left join chapter on school.chapter = chapter.id
				left join judge_setting tab_rating on tab_rating.tag = 'tab_rating' and tab_rating.judge = judge.id
				left join judge_setting neutral on neutral.tag = 'neutral' and neutral.judge = judge.id
			where jpr.round = ${round.id}
				and jpr.jpool = jpj.jpool
				and jpj.judge = judge.id
				and judge.active = 1
				and jpr.round = round.id
				and round.timeslot = timeslot.id
		`;
	} else {

		// Pull judges from the judge category linked to this round
		judgeQuery = sql` ${judgeQuery}
			from (judge, round, event, timeslot)
				left join school on judge.school = school.id
				left join region on school.region = region.id
				left join district on school.district = district.id
				left join chapter on school.chapter = chapter.id
				left join judge_setting tab_rating on tab_rating.tag = 'tab_rating' and tab_rating.judge = judge.id
				left join judge_setting neutral on neutral.tag = 'neutral' and neutral.judge = judge.id
			where judge.active = 1
				AND (judge.category = event.category OR judge.alt_category = event.category)
				and event.id = round.event
				AND round.id = ${round.id}
				and round.timeslot = timeslot.id
		`;
	}

	// No event constraints please.
	judgeQuery = sql` ${judgeQuery}
		and not exists (
			select evs.id
				from strike evs
			where evs.event = round.event
				and evs.judge = judge.id
				and evs.type = 'event'
		) `;

	// No elim constrained judges if we're not an elim.
	if (round.type === 'prelim') {
		judgeQuery = sql` ${judgeQuery}
			and not exists (
				select els.id
					from strike els
				where els.event = round.event
					and els.type = 'elim'
					and els.judge = judge.id
			) `;
	}

	// No FYOs if we don't allow them
	if (round.no_first_years) {
		judgeQuery = sql` ${judgeQuery}
			and not exists (
				select first_year.id
				from judge_setting first_year
				where first_year.tag = 'first_year'
				and first_year.judge = judge.id
			) `;
	}

	if (round.online_mode !== 'async') {
		// No time constraints that cover the present
		judgeQuery = sql` ${judgeQuery}
			and not exists (
				select strike.id
					from strike
				where strike.type IN ('time', 'departure')
					and strike.start < timeslot.end
					and strike.end > timeslot.start
					and strike.judge = judge.id
			)
		`;
	}

	const { rows: initialJudges } = await judgeQuery.execute(kdb);

	let busyQuery = sql`
		select
			judge.id, judge.person
		from judge, ballot, panel, round, timeslot, timeslot t2

			where judge.id = ballot.judge
				and ballot.panel = panel.id
				and panel.round = round.id
				and round.timeslot = timeslot.id
				and timeslot.tourn = t2.tourn
				and t2.id = ${round.timeslot}
				and not exists (
					select es.id
					from event_setting es
					where es.event = round.event
					and es.tag = 'online_mode'
					and es.value = 'async'
				)
	`;

	if (round.no_back_to_back) {
		busyQuery = sql` ${busyQuery}
			and t2.start <= timeslot.end
			and t2.end >= timeslot.start
		`;
	} else {
		busyQuery = sql` ${busyQuery}
			and t2.start < timeslot.end
			and t2.end > timeslot.start
		`;
	}

	const { rows: busyFolks } = await busyQuery.execute(kdb);

	const busyJudges = {};
	const busyPeople = {};

	busyFolks.forEach( (folk) => {
		if (folk.judge) {
			busyJudges[folk.judge] = true;
		}
		if (folk.person) {
			busyPeople[folk.person] = true;
		}
	});

	const judges = [];

	initialJudges.forEach( (judge) => {
		if (busyJudges[judge.id]) {
			return;
		}
		if (judge.person && busyPeople[judge.person]) {
			return;
		}
		judges.push(judge);
	});

	if (req.return) {
		return judges;
	}

	res.status(200).json(judges);

};

export async function getRoundJudgeConflicts(req, res) {
	let round = {};

	if (req.round) {
		round = req.round;
	} else {
		round = await summon(kdb, 'round',req.params.roundId);
	}

	const judgeConflicts = {};

	const { rows: roundEntries } = await sql`
		select
			entry.id, school.id school, region.id region, district.id district, hybrid.school hybrid, ballot.side side
		from (entry, ballot, panel)
			left join school on entry.school = school.id
			left join region on school.region = region.id
			left join district on school.district = district.id
			left join strike hybrid on hybrid.type = 'hybrid' and hybrid.entry = entry.id
		where entry.id = ballot.entry
			and ballot.panel = panel.id
			and panel.round = ${round.id}
	`.execute(kdb);

	const entriesBy    = {};

	entriesBy.school   = {};
	entriesBy.region   = {};
	entriesBy.dioregion   = {};
	entriesBy.district = {};
	entriesBy.side     = {};

	roundEntries.forEach( (entry) => {

		if (entry.school) {
			entriesBy.school[entry.school] = [entry.id, ...entriesBy.school[entry.school] ?? []];
		}

		if (entry.hybrid) {
			entriesBy.school[entry.hybrid] = [entry.id, ...entriesBy.school[entry.hybrid] ?? []];
		}

		if (round.conflict_dioregion_judges && round.dioregions[entry.region]) {
			entry.dioregion = round.dioregions[entry.region];
			entriesBy.dioregion[entry.dioregion] = [
				entry.id,
				...entriesBy.dioregion[entry.dioregion] ?? [],
			];
		}

		if (entry.region) {
			entriesBy.region[entry.region] = [entry.id, ...entriesBy.region[entry.region] ?? []];
		}

		if (entry.district) {
			entriesBy.district[entry.district] = [
				entry.id,
				...entriesBy.district[entry.district] ?? [],
			];
		}

		if (entry.side) {
			entriesBy.side[entry.id] = entry.side;
		}
	});

	if (!round.allow_repeat_judging) {
		const { rows: ballotConflicts } = await sql`
			select
				entry.id entry, ballot.judge, ballot.side, winloss.id winloss, winloss.value winner
			from (entry, ballot, panel, round)
				left join score winloss on winloss.tag = 'winloss' and winloss.ballot = ballot.id
			where exists (
					select b1.id
					from ballot b1, panel p1
					where b1.entry = entry.id
					and b1.panel = p1.id
					and p1.round = ${round.id}
				)
				and entry.id = ballot.entry
				and ballot.panel = panel.id
				and panel.round != ${round.id}
				and panel.round = round.id
				and ballot.judge > 0
		`.execute(kdb);

		ballotConflicts.forEach( (ballot) => {

			if (!judgeConflicts[ballot.judge]) {
				judgeConflicts[ballot.judge] = [];
			}

			if (round.type === 'elim') {
				if (round.allow_repeat_elims) {
					if (!round.disallow_repeat_drop
						|| ballot.winner
					) {
						// No conflict because either I won or it doesn't matter
						return;
					}
				}
				judgeConflicts[ballot.judge] = [ballot.entry, ...judgeConflicts[ballot.judge] ?? []];
			} else {
				if (round.allow_repeat_prelim_side && entriesBy.side[ballot.entry] === ballot.side) {
					judgeConflicts[ballot.judge].push(ballot.entry);
				} else if (!round.allow_repeat_prelim_side) {
					judgeConflicts[ballot.judge].push(ballot.entry);
				}
			}
		});
	}

	// Process any entry, school, region or district strikes against the judges available
	let judgeStrikesQuery = sql`
		select
			judge.id judge, strike.type, strike.entry, strike.school, strike.district, strike.region
	`;

	if (round.jpool) {
		// Pull judges from the judge pools linked to this round
		judgeStrikesQuery = sql` ${judgeStrikesQuery}
			from (judge, jpool_judge jpj, jpool_round jpr, strike)
			where judge.id = strike.judge
				and jpj.judge = judge.id
				and jpr.round = ${round.id}
				and jpr.jpool = jpj.jpool
				and judge.active = 1
		`;
	} else {
		// Pull judges from the judge category linked to this round
		judgeStrikesQuery = sql` ${judgeStrikesQuery}
			from (judge, strike, round, event)
			where judge.id = strike.judge
				and round.id = ${round.id}
				and round.event = event.id
				and event.category = judge.category
				and judge.active = 1
		`;
	}

	const { rows: judgeStrikes } = await judgeStrikesQuery.execute(kdb);

	judgeStrikes.forEach( (strike) => {

		if (!judgeConflicts[strike.judge]) {
			judgeConflicts[strike.judge] = [];
		}

		if (strike.type === 'school' && entriesBy.school[strike.school]) {
			judgeConflicts[strike.judge] = [
				...entriesBy.school[strike.school],
				...judgeConflicts[strike.judge] ?? [],
			];

		} else if (strike.type === 'region' && entriesBy.region[strike.region]) {
			judgeConflicts[strike.judge] = [
				...entriesBy.region[strike.region],
				...judgeConflicts[strike.judge] ?? [],
			];

		} else if (strike.type === 'district' && entriesBy.district[strike.district]) {
			judgeConflicts[strike.judge] = [
				...entriesBy.district[strike.district],
				...judgeConflicts[strike.judge] ?? [],
			];
		} else if (strike.type === 'entry') {
			judgeConflicts[strike.judge] = [
				strike.entry,
				...judgeConflicts[strike.judge] ?? [],
			];
		}
	});

	if (round.auto_conflict_hires) {

		const { rows: judgeHires } = await sql`
			select judge_hire.judge, judge_hire.school
				from (judge_hire, school, entry, ballot, panel)
			where panel.round = ${round.id}
				and panel.id = ballot.panel
				and ballot.entry = entry.id
				and entry.school = school.id
				and school.id = judge_hire.school
			group by judge_hire.id
		`.execute(kdb);

		judgeHires.forEach( (hire) => {
			if (!judgeConflicts[hire.judge]) {
				judgeConflicts[hire.judge] = [];
			}

			if (hire.school && entriesBy.school[hire.school]) {
				judgeConflicts[hire.judge] = [
					...entriesBy.school[hire.school],
					...judgeConflicts[hire.judge] ?? [],
				];
			}
		});
	}

	if (!round.allow_judge_own) {

		// Conflict any entries from one's own school if that's required.

		round.judges.forEach( (judge) => {

			if (judge.school && entriesBy.school[judge.school]) {
				judgeConflicts[judge.id] = [
					...entriesBy.school[judge.school],
					...judgeConflicts[judge.id] ?? [],
				];
			}

			if (round.region_judge_forbid && judge.school && entriesBy.school[judge.school]) {
				judgeConflicts[judge.id] = [
					...entriesBy.region[judge.region],
					...judgeConflicts[judge.id] ?? [],
				];
			}

			if (round.conflict_dioregion_judges && round.dioregions[judge.region]) {
				judgeConflicts[judge.id] = [
					...entriesBy.dioregion[judge.dioregion],
					...judgeConflicts[judge.id] ?? [],
				];
			}
		});
	}

	if (req.return) {
		return judgeConflicts;
	}

	res.status(200).json(judgeConflicts);
};

export async function placeJudges(req, res) {
	const { rows: [round] } = await sql`
		select
			round.id, round.name, round.type, round.flighted,
			event.id eventId, event.type eventType,
			event.tourn tournId,
			num_judges.value num_judges,
			tab_ratings_priority.value ratings_priority,
			category.id categoryId,
			GROUP_CONCAT(jpool.id) as jpoolIds,
			timeslot.id timeslotId, timeslot.start timeslotStart, timeslot.end timeslotEnd

		from (round, event, category, timeslot)

			left join jpool_round jpr
				on jpr.round = round.id
				and jpr.jpool = jpool.id

			left join jpool on jpr.jpool = jpool.id

		where 1=1
			and round.id = ${req.params.roundId}
			and round.event = event.id
			and event.category = category.id
			and round.timeslot = timeslot.id
	`.execute(kdb);

	if (round) {
		return NotFound(req, res, 'No such round found');
	}

	const sections = sql`
		select
			panel.id, panel.letter, panel.flight, panel.room,
			GROUP_CONCAT(ballot.judge) as judges,
			GROUP_CONCAT(entry.id) as entries,
			GROUP_CONCAT(school.id) as schools,
			GROUP_CONCAT(region.id) as regions,
			GROUP_CONCAT(district.id) as districts,

		from (entry, school, ballot, panel)

			left join region on school.region = region.id
			left join district on school.district = district.id

		where 1=1
			and panel.round = ${req.params.roundId}
			and panel.id = ballot.panel
			and ballot.entry = entry.id
			and ballot.bye != 1
			and ballot.forefit != 1
			and panel.bye != 1
		group by panel.id
	`.execute(kdb).then((result) => result.rows);

	let judgeFields = sql``;
	let judgeLimit = sql``;

	if (round.jpools) {
		judgeFields = sql` judge, jpool_judge jpj`;
		judgeLimit  = sql` and jpj.jpool in (${round.jpoolIds}) and jpj.judge = judge.id `;
	} else {
		judgeFields = sql` judge `;
		judgeLimit  = sql` and judge.category = ${round.categoryId} `;
	}

	const judges = sql`
		select judge.id, judge.obligation, judge.hired,
			school.id as schoolId,
			region.id as regionId,
			district.id as districtId,
			COUNT(distinct panel.id) as panels,
			GROUP_CONCAT(ballot.entry) as entries,
			GROUP_CONCAT(round.event) as events

		from (${judgeFields})
			left join school on school.id = judge.school
			left join region on region.id = school.region
			left join district on district.id = school.district
			left join ballot on ballot.judge = judge.id
			left join panel on ballot.panel =  panel.id
			left join round on panel.round = round.id

		where 1=1
			${judgeLimit}
			and judge.active = 1

			AND NOT EXISTS (
				select bt.id
					from ballot bt, panel pt, round rt, timeslot t2
				where bt.judge = judge.id
					and bt.panel = pt.id
					and pt.round = rt.id
					and rt.timeslot = t2.id
					and t2.start <= ${round.timeslotEnd}
					and t2.end >= ${round.timeslotStart}
					and t2.tourn = ${round.tournId}
				limit 1
			)
	`.execute(kdb).then((result) => result.rows);

	const strikes = sql`
		select
			strike.*
		from (strike, ${judgeFields})
		where 1=1
			${judgeLimit}
			and judge.id = strike.judge
	`.execute(kdb).then((result) => result.rows);

	const judgeById = {};

	// Pulls the judges and creates arrays of the Forbidden Constraints.
	for (const judge of judges) {
		judge.schools = [judge.schoolId];
		judge.regions = [judge.regionId];
		judge.districts = [judge.districtId];
		judgeById[judge.id] = judge;
	}

	// Process the strikes and dump whatever is struck/constrained against
	// into the judges object as forbidden.
	for (const strike of strikes) {

		if (judgeById[strike.judge]) {

			// Time based strikes pull me out of the pool altogether
			if (strike.start) {

				const strikeStart = new Date(strike.start);
				const strikeEnd = new Date(strike.end);

				if (!round.roundStart) {
					round.roundStart = new Date(round.timeslotStart);
					round.roundEnd = new Date(round.timeslotEnd);
				}

				if (strike.type === 'departure') {
					if (strikeStart < round.roundEnd) {
						delete judgeById[strike.judge];
					}
				} else {
					if (
						strikeStart < round.roundEnd
						&& strikeEnd > round.roundStart
					) {
						delete judgeById[strike.judge];
					}
				}
			}

			// Event based strikes pull me out of the pool unless it's specific to prelims.
			if (strike.event) {
				if (strike.type === 'elim') {
					if (round.type !== 'elim' && round.type !== 'final') {
						delete judgeById[strike.judge];
					}
				} else {
					delete judgeById[strike.judge];
				}
			}

			if (strike.entry) {
				judgeById[strike.judge].entries.push(strike.entry);
			}
			if (strike.school) {
				judgeById[strike.judge].schools.push(strike.school);
			}
			if (strike.district) {
				judgeById[strike.judge].districts.push(strike.district);
			}
			if (strike.region) {
				judgeById[strike.judge].regions.push(strike.region);
			}
		}
	}

	for (const section of sections) {
		// hush, linter, I am working on it.
		logger.info('section', { section });
	}
};
