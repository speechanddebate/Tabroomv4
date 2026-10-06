import { sql } from 'kysely';
import { db as kdb } from '../data/database.js';
import logger from './logger.js';

// Values for an IN (...) list. Accepts a single value or an array, and renders
// an empty list as NULL so the query stays valid.
const inList = (values) => {
	const list = [].concat(values ?? []);
	return list.length > 0 ? sql.join(list) : sql`NULL`;
};

export const getFollowers = async (replacements, options = { recipients: 'all' }) => {

	let whereLimit = sql``;
	let fields = sql``;

	if (replacements.panelId) {
		whereLimit = sql` where panel.id = ${replacements.panelId} `;
		delete replacements.roundId;
	} else if (replacements.sectionId) {
		whereLimit = sql` where panel.id = ${replacements.sectionId} `;
		delete replacements.roundId;
	} else if (replacements.roundId) {
		whereLimit = sql` where panel.round = ${replacements.roundId} `;
	} else if (replacements.timeslotId) {
		whereLimit = sql` where panel.round = round.id and round.timeslot = ${replacements.timeslotId} `;
		fields = sql`,round`;
		if (replacements.eventIds) {
			whereLimit = sql`${whereLimit}  and round.event IN (${inList(replacements.eventIds)}) `;
		}
	} else {
		return { error: true, message: `No round ID to blast sent.` };
	}

	if (replacements.flight) {
		whereLimit = sql`${whereLimit} and panel.flight = ${replacements.flight} `;
	}

	let queryLimits = sql``;

	if (replacements.speaker) {
		queryLimits = sql`${queryLimits} and ballot.speakerorder = ${replacements.speakerOrder} `;
	}

	if (replacements.status === 'unstarted' ) {
		queryLimits = sql`${queryLimits}
			and (ballot.judge_started IS NULL)
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	} else if (replacements.status === 'unentered' ) {
		queryLimits = sql`${queryLimits}
			and NOT EXISTS (
				select score.id from score where score.ballot = ballot.id
			)
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	} else if (replacements.status === 'unconfirmed' ) {
		queryLimits = sql`${queryLimits}
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	}

	if (options.limits?.event ) {
		replacements.eventIds = Object.keys(options.limits.event);
		queryLimits = sql`${queryLimits}
			and round.event IN (${inList(replacements.eventIds)})
		`;
	}

	const persons = [];

	if (replacements.recipients !== 'judges') {
		const { rows: entryIds } = await sql`
			select person.id, person.email, person.no_email
				from (person, entry, entry_student es, student, ballot, panel ${fields})
			${whereLimit}
				and panel.id = ballot.panel
				and ballot.entry = entry.id
				and entry.active = 1
				and entry.id = es.entry
				and es.student = student.id
				and student.person = person.id
				${queryLimits}
		`.execute(kdb);

		persons.push(...entryIds);
	}

	if (replacements.recipients !== 'entries') {

		const { rows: judgeIds } = await sql`
			select person.id, person.email, person.no_email
				from (person, judge, ballot, panel ${fields})
			${whereLimit}
				and ballot.panel = panel.id
				and ballot.judge = judge.id
				and judge.person = person.id
				${queryLimits}
		`.execute(kdb);
		persons.push(...judgeIds);
	}

	if (!replacements.noFollowers && !replacements.no_followers) {

		if (replacements.recipients !== 'entries') {
			const { rows: judgeFollowers } = await sql`
				select person.id, person.email, person.no_email
					from (person, follower, ballot, panel ${fields})
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.judge = follower.judge
					and follower.person = person.id
					${queryLimits}
			`.execute(kdb);

			persons.push(...judgeFollowers);
		}

		if (replacements.recipients !== 'judges') {
			const { rows: entryFollowers } = await sql`
				select person.id, person.email, person.no_email
					from (person, follower, entry, ballot, panel ${fields})
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.entry = entry.id
					and entry.active = 1
					and entry.id = follower.entry
					and follower.person = person.id
					${queryLimits}
			`.execute(kdb);

			persons.push(...entryFollowers);
		}
	}

	if (replacements.sectionFollowers) {
		if (replacements.sectionId) {
			whereLimit = sql` where ps.panel = ${replacements.sectionId} `;
		} else if (replacements.panelId) {
			whereLimit = sql` where ps.panel = ${replacements.panelId} `;
		}

		const { rows: sectionFollowerIds } = await sql`
			select
				ps.id, ps.value_text followers
			from panel_setting ps
			${whereLimit}
				and ps.tag = 'share_followers'
		`.execute(kdb);

		let followerIds = [];

		if (sectionFollowerIds[0]?.followers) {
			try {
				followerIds = JSON.parse(sectionFollowerIds[0].followers);
			} catch (err) {
				logger.error(err);
			}
		}

		const sectionFollowers = followerIds.length < 1 ? [] : await kdb
			.selectFrom('person')
			.select(['person.id', 'person.email', 'person.no_email'])
			.where('person.id', 'in', followerIds)
			.where('person.no_email', '=', 0)
			.execute();

		persons.push(...sectionFollowers);
	}

	if (replacements.returnEmails) {
		const personIds = {};
		const unique = [];
		for (const person of persons) {
			if (!personIds[person.id]) {
				personIds[person.id] = true;
				unique.push(person.email);
			}
		}
		return unique;
	}

	const personIds = [];

	for (const person of persons) {
		personIds.push(person?.id);
	}

	return [...new Set(personIds)];
};

export const getPairingFollowers = async (replacements, options = { recipients: 'all' }) => {

	let whereLimit = sql``;
	let fields = sql``;

	if (replacements.panelId) {
		whereLimit = sql` where panel.id = ${replacements.panelId} `;
		delete replacements.roundId;
	} else if (replacements.sectionId) {
		whereLimit = sql` where panel.id = ${replacements.sectionId} `;
		delete replacements.roundId;
	} else if (replacements.roundId) {
		whereLimit = sql` where panel.round = ${replacements.roundId} `;
	} else if (replacements.timeslotId) {
		whereLimit = sql` where panel.round = round.id and round.timeslot = ${replacements.timeslotId} `;
		fields = sql`,round`;
	} else {
		return { error: true, message: `No round or section to blast sent` };
	}

	if (options.flight) {
		replacements.panelFlight = options.flight;
		whereLimit = sql`${whereLimit} and panel.flight = ${replacements.panelFlight} `;
	}

	let queryLimits = sql``;

	if (options.speaker) {
		replacements.speakerOrder = options.speakerOrder;
		queryLimits = sql`${queryLimits}
			and ballot.speakerorder = ${replacements.speakerOrder}
		`;
	}

	if (options.status === 'unstarted' ) {
		queryLimits = sql`${queryLimits}
			and (ballot.judge_started IS NULL)
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	} else if (options.status === 'unentered' ) {
		queryLimits = sql`${queryLimits}
			and NOT EXISTS (
				select score.id from score where score.ballot = ballot.id
			)
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	} else if (options.status === 'unconfirmed' ) {
		queryLimits = sql`${queryLimits}
			and (ballot.audit = 0 OR ballot.audit IS NULL)
		`;
	}

	if (options.limits?.event ) {
		replacements.eventIds = Object.keys(options.limits.event);
		queryLimits = sql`${queryLimits}
			and round.event IN (${inList(replacements.eventIds)})
		`;
	}

	const blastBy = {
		entries : {},
		judges  : {},
		schools : {},
		error   : false,
	};

	if (options.recipients !== 'judges') {

		const entryPeopleQuery = sql`
			select
				person.id, person.email, person.phone, person.provider, entry.id entry, entry.school school
			from (panel, person, ballot, entry, entry_student es, student ${fields})
			${whereLimit}
				and ballot.panel = panel.id
				and ballot.entry = entry.id
				and entry.active = 1
				and entry.id = es.entry
				and es.student = student.id
				and student.person = person.id
				and person.no_email = 0
			${queryLimits}
		`;

		const { rows: rawEntryPeople } = await entryPeopleQuery.execute(kdb);

		for (const person of rawEntryPeople) {

			if (!blastBy.entries[person.entry]) {
				blastBy.entries[person.entry] = [];
			}
			blastBy.entries[person.entry].push(`${person.id}`);
		}
	}

	if (options.recipients !== 'entries') {

		const judgePeopleQuery = sql`
			select
				person.id, person.email, person.phone, person.provider, judge.id judge, judge.school school
			from (person, ballot, judge, panel ${fields})
			${whereLimit}
				and ballot.panel = panel.id
				and ballot.judge = judge.id
				and judge.person = person.id
				and person.no_email = 0
			${queryLimits}
		`;

		const { rows: rawJudgePeople } = await judgePeopleQuery.execute(kdb);

		for (const person of rawJudgePeople) {

			if (!blastBy.judges[person.judge]) {
				blastBy.judges[person.judge] = [];
			}

			blastBy.judges[person.judge].push(`${person.id}`);
		}
	}

	if (!options.no_followers) {

		if (options.recipients !== 'judges') {

			const entryFollowersQuery = sql`
				select
					person.id, person.email, person.phone, person.provider, entry.id entry
				from (person, ballot, entry, follower, panel ${fields})
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.entry = entry.id
					and entry.active = 1
					and entry.id = follower.entry
					and follower.person = person.id
					and person.no_email = 0
				${queryLimits}
			`;

			const { rows: rawEntryFollowers } = await entryFollowersQuery.execute(kdb);

			for (const person of rawEntryFollowers) {

				if (!blastBy.entries[person.entry]) {
					blastBy.entries[person.entry] = [];
				}

				blastBy.entries[person.entry].push(`${person.id}`);
			}

			const schoolFollowersQuery = sql`
				select
					person.id, person.email, follower.school school
				from (person, ballot, entry, follower, panel ${fields})
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.entry = entry.id
					and entry.active = 1
					and entry.school = follower.school
					and follower.person = person.id
					and person.no_email = 0
				${queryLimits}
			`;

			const { rows: rawSchoolFollowers } = await schoolFollowersQuery.execute(kdb);

			for (const person of rawSchoolFollowers) {
				if (!blastBy.schools[person.school]) {
					blastBy.schools[person.school] = [];
				}
				blastBy.schools[person.school].push(`${person.id}`);
			}
		}

		if (options.recipients !== 'entries') {

			const judgeFollowersQuery = sql`
				select
					person.id, person.email, person.phone, person.provider, ballot.judge judge,
					push_notify.value web
				from (person, ballot, follower, panel ${fields})
					left join person_setting push_notify
						on push_notify.person = person.id
						and push_notify.tag = 'push_notify'
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.judge = follower.judge
					and follower.person = person.id
					and person.no_email = 0
				${queryLimits}
			`;

			const { rows: rawJudgeFollowers } = await judgeFollowersQuery.execute(kdb);

			for (const person of rawJudgeFollowers) {

				if (!blastBy.judges[person.judge]) {
					blastBy.judges[person.judge] = [];
				}

				blastBy.judges[person.judge].push(`${person.id}`);
			}

			const schoolFollowersQuery = sql`
				select
					person.id, person.email, ballot.judge judge
				from (person, judge, ballot, follower, panel ${fields})
				${whereLimit}
					and ballot.panel = panel.id
					and ballot.judge = judge.id
					and judge.school = follower.school
					and judge.school > 0
					and follower.person = person.id
					and person.no_email = 0
				${queryLimits}
			`;

			const { rows: rawSchoolFollowers } = await schoolFollowersQuery.execute(kdb);

			for (const person of rawSchoolFollowers) {

				if (!blastBy.schools[person.school]) {
					blastBy.schools[person.school] = [];
				}

				blastBy.schools[person.school].push(`${person.id}`);
			}
		}
	}

	return blastBy;

};

// Get the acccounts linked to judges in the follower pools.  This function
// only works in judge-specific 'only' mode since releases etc must be tagged
// to an individual judge name and not to the pool as a whole.

export const getJPoolJudges = async (replacements, options = { recipients: 'all' }) => {

	const judges = {};

	const judgePeopleQuery = sql`
		select
			person.id, judge.id judgeId, judge.first, judge.last
		from (person, judge, jpool_judge jpj, jpool)
		where jpool.id = ${replacements.jpoolId}
			and jpool.id = jpj.jpool
			and jpj.judge = judge.id
			and judge.person = person.id
			and person.no_email = 0
	`;

	const { rows: rawJudgePeople } = await judgePeopleQuery.execute(kdb);

	for await (const person of rawJudgePeople) {
		if (!person.judgeId) {
			return;
		}

		if (!judges[person.judgeId]) {
			judges[person.judgeId] = {
				first      : person.first,
				last       : person.last,
				recipients : [person.id],
			};
		}
	}

	if (!options.no_followers) {
		const judgeFollowersQuery = sql`
			select
				person.id, judge.id judgeId, judge.first, judge.last
			from (person, judge, jpool_judge jpj, jpool, follower)
			where jpool.id = ${replacements.jpoolId}
				and jpool.id        = jpj.jpool
				and jpj.judge       = judge.id
				and judge.id        = follower.judge
				and follower.person = person.id
				and person.no_email = 0
		`;

		const { rows: rawJudgeFollowers } = await judgeFollowersQuery.execute(kdb);

		for await (const person of rawJudgeFollowers) {
			if (!person.judgeId) {
				return;
			}

			if (!judges[person.judgeId]) {
				judges[person.judgeId].first = person.first;
				judges[person.judgeId].last = person.last;
				judges[person.judgeId].recipients = [];
			}

			judges[person.judgeId].recipients.push(person.id);
		}
	}

	return judges;
};

export const getTimeslotJudges = async (replacements, options = { recipients: 'all' }) => {

	const blastBy = {
		entry  : {},
		judge  : {},
		school : {},
	};

	const judgePeopleQuery = sql`
		select
			person.id, person.email, person.phone, person.provider, judge.id judge, judge.school school
		from (person, judge, jpool_judge jpj, jpool, jpool_round jpr, round)
		where round.timeslot = ${replacements.timeslotId}
			and round.site = ${replacements.siteId}
			and round.id = jpr.round
			and jpr.jpool = jpool.id
			and jpool.id = jpj.jpool
			and jpj.judge = judge.id
			and judge.person = person.id
			and judge.active = 1
			and person.no_email = 0
	`;

	const { rows: rawJudgePeople } = await judgePeopleQuery.execute(kdb);

	for await (const person of rawJudgePeople) {
		if (!person.judge) {
			return;
		}

		if (!blastBy.judges[person.judge]) {
			blastBy.judges[person.judge] = {
				phone : [],
				email : [],
			};
		}

		if (person.provider && person.phone) {
			blastBy.judges[person.judge].phone.push(`${person.phone}@${person.provider}`);
		}

		blastBy.judges[person.judge].email.push(person.email);
	}

	if (!options.no_followers) {

		const judgeFollowersQuery = sql`
			select
				person.id, person.email, person.phone, person.provider, jpj.judge judge
			from (person, judge, jpool_judge jpj, jpool, jpool_round jpr, round, follower)
			where round.timeslot = ${replacements.timeslotId}
				and round.site = ${replacements.siteId}
				and round.id = jpr.round
				and jpr.jpool = jpool.id
				and jpool.id = jpj.jpool
				and jpj.judge = judge.id
				and judge.id = follower.judge
				and judge.active = 1
				and follower.person = person.id
				and person.no_email = 0
		`;

		const { rows: rawJudgeFollowers } = await judgeFollowersQuery.execute(kdb);

		for await (const person of rawJudgeFollowers) {
			if (!person.judge) {
				return;
			}
			if (!blastBy.judges[person.judge]) {
				blastBy.judges[person.judge] = {
					phone : [],
					email : [],
				};
			}

			if (person.phone && person.provider) {
				blastBy.judges[person.judge].phone.push(`${person.phone}@${person.provider}`);
			}

			blastBy.judges[person.judge].email.push(`${person.email}`);
		}
	}

	const blastAll = {
		phone      : [],
		email      : [],
		only       : { ...blastBy },
		recipients : options.recipients,
		error      : false,
	};

	return blastAll;

};

export default getFollowers;
