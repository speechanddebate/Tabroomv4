import { getFollowers } from '../../../helpers/followers.js';
import logger from '../../../helpers/logger.js';
import { notify } from '../../../helpers/blast.js';
import { blastRoundPairing } from '../round/blast.js';
import { BadRequest, Forbidden } from '../../../helpers/problem.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

// Refactor this so that it will allow an event/category only user to blast only those
// events which they personally have access to.  Also remove all the deps and instead
// just have it cycle through the rounds because that actually makes sense.

export async function blastTimeslotMessage(req, res) {

	if (!req.body.message) {
		return BadRequest(req, res,`No message to blast was input`);
	}

	req.body.timeslotId = req.session.timeslot?.id;

	if (!req.body.timeslotId) {
		return BadRequest(req, res, `No timeslot to blast was sent`);
	}

	delete req.body.roundId;
	const options = {};

	if (
		req.session.perms.tourn[req.session.tourn.id] !== 'owner'
		&& req.session.perms.tourn[req.session.tourn.id] !== 'tabber'
	) {
		if (req.session.perms.event) {
			options.limits = { event: req.session.perms.event };
		} else {
			return Forbidden(req, res, 'You do not have access to any rounds to blast');
		}
	}

	const personIds = await getFollowers(req.body, options);
	const tourn = await summon(kdb, 'tourn',req.params.tournId);

	const notifyResponse = await notify({
		from        : `${tourn.name} <${tourn.webname}@www.tabroom.com>` ,
		fromAddress : `<${tourn.webname}@www.tabroom.com>`               ,
		ids         : personIds                                           ,
		text        : req.body.message                                    ,
	});

	if (notifyResponse.error) {
		logger.error(notifyResponse.message);
		return res.status(200).json(notifyResponse);
	}

	let roundQuery = kdb.selectFrom('round')
		.select('id')
		.where('timeslot', '=', req.params.timeslotId);

	if (req.events?.length) {
		roundQuery = roundQuery.where('event', 'in', req.events);
	}

	const rounds = await roundQuery.execute();

	const promises = [];

	rounds.forEach( (round) => {

		const pushPromise = changeLogRepo.createChangeLog(kdb, {
			tag    : 'blast',
			person : req.person?.id,
			count  : notifyResponse.push?.count || 0,
			round  : round.id,
			description : `${req.body.message} sent to whole timeslot. ${notifyResponse.inbox || 0} recipients`,
		});

		promises.push(pushPromise);
	});

	await Promise.all(promises);

	const message = `Message sent to whole timeslot. ${notifyResponse.inbox || 0} recipients messaged, ${notifyResponse.web || 0} by web and ${notifyResponse.email || 0} by email`;
	return res.status(200).json({
		error: false,
		message,
	});
};

// Blast a whole timeslot's rounds with pairings
export async function blastTimeslotPairings(req, res) {

	const replacements = {
		eventIds   : req.events,
		timeslotId : req.params.timeslotId,
	};

	let queryLimit = sql``;

	if (req.events?.length > 0) {
		queryLimit = sql` and round.event IN (${sql.join(replacements.eventIds)}) `;
	}

	if (
		req.session.perms.tourn[req.session.tourn.id] !== 'owner'
		&& req.session.perms.tourn[req.session.tourn.id] !== 'tabber'
	) {

		if (req.session.perms.event) {
			replacements.permEvents = Object.keys(req.session.perms.event);
			const permEvents = replacements.permEvents.length > 0
				? sql.join(replacements.permEvents)
				: sql`NULL`;
			queryLimit = sql`${queryLimit} and round.event IN (${permEvents}) `;
		} else {
			return Forbidden(req, res, 'You do not have access to any rounds to blast');
		}
	}

	const { rows: rounds } = await sql`
		select distinct round.id
			from round
		where round.timeslot = ${replacements.timeslotId}
			${queryLimit}
	`.execute(kdb);

	const totals = {
		web   : 0,
		email : 0,
	};

	const responses = [];

	rounds.forEach( (round) => {
		req.params.roundId = round.id;
		const response = blastRoundPairing.POST(req, res);
		responses.push(response);
	});

	const replies = await Promise.all(responses);

	for (const response of replies) {
		totals.web += parseInt(response.web);
		totals.email += parseInt(response.email);
		totals.inbox += parseInt(response.inbox);
	}

	return res.status(200).json({
		message: `Timeslot-wide pairing blast sent to ${totals.web} web blast and ${totals.email} email recipients`,
		...totals,
	});
};

// Refactor this one to also work and remove all that objectify nonsense, and
// to use the notify() interface for messaging and blasting.

export async function messageFreeJudges(req, res) {

	// Given a timeslot ID and site ID, the aim here is to individually
	// message every judge who IS in the pools that the rounds tied to that
	// timeslot pull from, but who is NOT either judging, or in a standby
	// timeslot attached to this timeslot.  In other words, they are
	// completely free to go and frolic or whatever.

	// Yes I just used the world frolic.  Fight me.

	if (!req.body.message) {
		return res.status(200).json({ error: true, message: 'No message to blast sent' });
	}

	if (!req.body.timeslotId) {
		return BadRequest(req, res, `No timeslot to blast was sent`);
	}

	const freeJudgesQuery = sql`
		select
			judge.id, judge.first, judge.last, judge.person,
			GROUP_CONCAT(follower.person SEPARATOR ',') as followers
		from judge, jpool_judge jpj, jpool_round jpr, round, person
			left join follower on follower.judge = judge.id
		where round.timeslot = ${req.body.timeslotId}
			and round.site   = ${req.body.siteId}
			and round.id     = jpr.round
			and jpr.jpool    = jpj.jpool
			and jpj.judge    = judge.id
			and judge.active = 1
			and judge.person = person.id
			and not exists (
				select ballot.id
					from ballot, panel, round r2
				where ballot.judge = judge.id
					and ballot.panel = panel.id
					and panel.round = r2.id
					and r2.timeslot = and round.timeslot
			)
			and not exists (
				select
					jpjs.id
				from jpool_judge jpjs, jpool_setting jps
					where jps.value = round.timeslot
					and jps.tag = 'standby_timeslot'
					and jps.jpool = jpjs.jpool
					and jpjs.judge = judge.id
			)
	`;

	const { rows: freeJudges } = await freeJudgesQuery.execute(kdb);

	const totals = {
		judges : 0 ,
		web    : 0 ,
		emails : 0 ,
	};

	const tourn = await summon(kdb, 'tourn',req.params.tournId);
	const promises = [];

	for (const judge of freeJudges) {

		totals.judges++;
		const ids = [judge.person];

		if (judge.followers) {
			ids.push(...judge.followers.split(','));
		}

		const subject = `Judge ${judge.first} ${judge.last} Released`;
		let text = `\n\nJudge: ${judge.first} ${judge.last}\n`;
		text += `${req.body.message}`;

		const promise = notify({
			ids,
			text,
			subject,
			from        : `${tourn.name} <${tourn.webname}@www.tabroom.com>` ,
			fromAddress : `<${tourn.webname}@www.tabroom.com>`               ,
		});

		promises.push(promise);
	}

	await Promise.all(promises);
	for (const promise of promises) {
		totals.web += promise.web;
		totals.email += promise.email;
	}

	const rounds = await kdb.selectFrom('round')
		.select('id')
		.where('timeslot', '=', req.body.timeslotId)
		.execute();

	const logs = [];

	rounds.forEach( (round) => {
		const promise = changeLogRepo.createChangeLog(kdb, {
			tag         : 'blast',
			description : `${req.body.message} sent to ${totals.judges} people: ${totals.web} push and ${totals.email} emails`,
			person      : req.person?.id,
			round       : round.id,
		});

		logs.push(promise);
	});

	await Promise.all(logs);
	return res.status(200).json(`Free Message sent to ${totals.web} push and ${totals.email} email recipients about ${totals.judges} judges`);
};

export async function messageReleasedJudges(req, res) {

	// This is intended to tell members of a standby pool that do not have a
	// ballot assignment that they are released, given a timeslot ID and a site ID.

	// Given a timeslot ID and site ID, the aim here is to individually
	// message every judge who IS in standby but who is not judging

	if (!req.body.message) {
		return res.status(200).json({ error: true, message: 'No message to blast sent' });
	}

	if (!req.body.timeslotId) {
		return BadRequest(req, res, `No timeslot to blast was sent`);
	}

	const releasedJudgesQuery = sql`
		select
			judge.id, judge.first, judge.last, judge.person,
			GROUP_CONCAT(follower.person SEPARATOR ',') as followers
		from judge, jpool_judge jpj, jpool_round jpr, round, person
			left join follower on follower.judge = judge.id
		where round.timeslot = ${req.body.timeslotId}
			and round.site   = ${req.body.siteId}
			and round.id     = jpr.round
			and jpr.jpool    = jpj.jpool
			and jpj.judge    = judge.id
			and judge.active = 1
			and judge.person = person.id
			and not exists (
				select ballot.id
					from ballot, panel, round r2
				where ballot.judge = judge.id
					and ballot.panel = panel.id
					and panel.round = r2.id
					and r2.timeslot = and round.timeslot
			)
			and exists (
				select
					jpjs.id
				from jpool_judge jpjs, jpool_setting jps
					where jps.value = round.timeslot
					and jps.tag = 'standby_timeslot'
					and jps.jpool = jpjs.jpool
					and jpjs.judge = judge.id
			)
	`;

	const { rows: releasedJudges } = await releasedJudgesQuery.execute(kdb);

	const totals = {
		judges : 0 ,
		web    : 0 ,
		emails : 0 ,
	};

	const promises = [];

	for (const judge of releasedJudges) {

		totals.judges++;
		const ids = [judge.person];

		if (judge.followers) {
			ids.push(...judge.followers.split(','));
		}

		const subject = `Judge ${judge.first} ${judge.last} Released`;
		let text = `\n\nJudge: ${judge.first} ${judge.last}\n`;
		text += `${req.body.message}`;

		const notifyResponse = notify({
			ids,
			text,
			subject,
		});

		promises.push(notifyResponse);
	}

	await Promise.all(promises);

	for (const promise of promises) {
		totals.web += promise.web;
		totals.email += promise.email;
	}

	const rounds = await kdb.selectFrom('round')
		.select('id')
		.where('timeslot', '=', req.body.timeslotId)
		.execute();

	const logs = [];

	for (const round of rounds) {
		const log = changeLogRepo.createChangeLog(kdb, {
			tag         : 'blast',
			description : `${req.body.message} sent to ${totals.web + totals.email}
					judges ${totals.web} push and ${totals.email} emails`,
			person      : req.person?.id,
			count       : totals.web + totals.emails,
			round       : round.id,
		});

		logs.push(log);
	}

	await Promise.all(logs);

	return res.status(200).json(`Free Message sent to ${totals.web} push and ${totals.email}
		email recipients about ${totals.judges} judges`,
	);
};