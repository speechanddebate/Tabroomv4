import moment from 'moment-timezone';
import { getFollowers, getPairingFollowers } from '../../../helpers/followers.js';
import { notify } from '../../../helpers/blast.js';
import { sendPairingBlast, formatPairingBlast } from '../../../helpers/pairing.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/index.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

export async function blastRoundMessage(req, res) {
	if (!req.body.message) {
		return res.status(200).json({ error: true, message: 'No message to blast sent' });
	}

	const personIds = await getFollowers(req.body);
	const tourn = await summon(kdb, 'tourn',req.params.tournId);

	const seconds = Math.floor(Date.now() / 1000);
	const numberwang = seconds.toString().substring(-5);
	const from = `${tourn.name} <${tourn.webname}_${numberwang}@www.tabroom.com>`;
	const fromAddress = `<${tourn.webname}_${numberwang}@www.tabroom.com>`;

	const blast = await notify({
		ids: personIds,
		text: req.body.message,
		from,
		fromAddress,
	});

	const logMessage = {
		tag: 'blast',
		description: `${req.body.message} sent.  ${blast.message}`,
		round: req.body.roundId,
	};

	if (req.person) {
		logMessage.person = req.person.id;
	} else if (req.body.sender) {
		logMessage.person = req.body.sender;
	}

	await changeLogRepo.createChangeLog(kdb, logMessage);

	const message = `Message sent to whole timeslot. ${blast.inbox || 0} recipients messaged, ${blast.web || 0} by web and ${blast.email || 0} by email`;

	return res.status(200).json({
		error: false,
		message,
	});
}

export async function scheduleAutoFlip(roundId, req) {

	const { rows: roundData } = await sql`
		select round.id, round.flighted, round.type, round.published,
			round.flighted flights,
			round.start_time roundstart, timeslot.start,
			event.id event,
			flip_autopublish.value flip_autopublish,
			flip_before_start.value flip_before_start,
			flip_split_flights.value flip_split_flights,
			flight_offset.value flight_offset,
			flip_published.value flip_published,
			no_side_constraints.value no_side_constraints,
			tourn.tz

		from (round, event, timeslot, tourn)

		left join event_setting flip_autopublish
			on flip_autopublish.event = event.id
			and flip_autopublish.tag = 'flip_autopublish'

		left join event_setting flip_before_start
			on flip_before_start.event = event.id
			and flip_before_start.tag = 'flip_before_start'

		left join event_setting flight_offset
			on flight_offset.event = event.id
			and flight_offset.tag = 'flight_offset'

		left join event_setting flip_split_flights
			on flip_split_flights.event = event.id
			and flip_split_flights.tag = 'flip_split_flights'

		left join round_setting flip_published
			on flip_published.round = round.id
			and flip_published.tag = 'flip_published'

		left join event_setting no_side_constraints
			on no_side_constraints.event = event.id
			and no_side_constraints.tag = 'no_side_constraints'

		where round.id = ${roundId}

			and round.event = event.id
			and round.timeslot = timeslot.id
			and event.tourn = tourn.id
			and not exists (
				select es.id
					from event_setting es
				where es.event = event.id
					and es.tag = 'sidelock_elims'
			)

			and exists (
				select fo.id
					from event_setting fo
				where fo.event = event.id
					and fo.tag = 'flip_online'
			)
			and not exists (
				select fa.id
					from autoqueue fa
				where fa.round = round.id
					and fa.tag like 'flip_%'
			)
		`.execute(kdb);

	if (roundData) {

		const promises = [];

		roundData.forEach( round => {

			if (!round.no_side_constraints
				&& ( round.type !== 'elim'
					&& round.type !== 'final'
					&& round.type !== 'runoff'
				)
			) {
				return;
			}

			if (!round.roundstart) {
				round.roundstart = round.start;
			}

			const flipAt = {};
			let flights = [];

			if (round.flip_split_flights && round.flights > 1) {
				flights = [...Array(round.flights).keys()];
			} else {
				flights = [0];
			}

			if (round.flip_before_start) {

				for (const tick of flights) {
					const flight = tick + 1;
					flipAt[flight] = moment(round.roundstart)
						.add( (parseInt(tick * round.flight_offset) - parseInt(round.flip_before_start)), 'minutes');
				}

			} else if (round.flip_autopublish) {

				for (const tick of flights) {
					const flight = tick + 1;
					flipAt[flight] = moment()
						.add(parseInt((tick * round.flight_offset) + parseInt(round.flip_autopublish)), 'minutes');
				}
			}

			flights.forEach( (tick) => {

				const flight = tick + 1;

				if (round.flip_split_flights && round.flights > 1) {
					const promise = kdb.insertInto('autoqueue').values({
						tag        : `flip_${flight}`,
						round      : round.id,
						active_at  : flipAt[flight]?.toDate(),
						created_by : req.body.sender || 0,
					}).execute();
					promises.push(promise);
				} else {
					const promise = kdb.insertInto('autoqueue').values({
						tag        : `flip`,
						round      : round.id,
						active_at  : flipAt[flight]?.toDate(),
						created_by : req.body.sender || 0,
					}).execute();

					promises.push(promise);
				}
			});
		});

		await Promise.all(promises);
	}
};

// Blast a single round with a pairing
export async function blastRoundPairing(req, res) {
	let sender = '';
	if (req.body?.sender) {
		sender = req.body?.sender;
	} else if (req.person) {
		sender = req.person.id;
	}

	const roundId = req.params.roundId;

	const queryData = {};
	queryData.replacements = { roundId };
	queryData.where = sql`where section.round = ${roundId}`;
	queryData.fields = sql``;

	let promises = [];

	if (req.body.publish) {
		const publish = kdb.updateTable('round')
			.set({ published: 1 })
			.where('round.id', '=', roundId)
			.execute();

		const log = changeLogRepo.createChangeLog(kdb, {
			tag: 'publish',
			description: `Round published`,
			person: sender,
			round: roundId,
		});

		const flip = scheduleAutoFlip(roundId, req);

		promises = [flip, log, publish];
	}

	const rmBlasted = kdb.deleteFrom('round_setting')
		.where('round', '=', roundId)
		.where('tag', '=', 'blasted')
		.execute();

	promises.push(rmBlasted);

	const mkBlasted = sql`
		insert into round_setting (tag, round, value_date, value)
        values ('blasted', ${roundId}, now(), 'date')
        ON DUPLICATE KEY UPDATE value_date = now()
    `.execute(kdb);

	promises.push(mkBlasted);
	await Promise.all(promises);

	const blastData = await formatPairingBlast(queryData, req);
	blastData.sender = sender;
	const followers = await getPairingFollowers(
		queryData.replacements,
		{ ...req.body },
	);

	if (req.body.message) {
		blastData.append = req.body.message;
	}
	if (req.body.append) {
		blastData.append = req.body.append;
	}

	const { rows: tourns } = await sql`
    select
      tourn.id, tourn.name, tourn.webname
    from tourn
      where tourn.id = ${req.params.tournId}
  `.execute(kdb);

	const tourn = tourns.shift();
	const seconds = Math.floor(Date.now() / 1000);
	const numberwang = seconds.toString().substring(-5);

	blastData.from = `${tourn.name} <${tourn.webname}_${numberwang}@www.tabroom.com>`;
	blastData.fromAddress = `<${tourn.webname}_${numberwang}@www.tabroom.com>`;
	blastData.tourn = tourn.id;

	const blast = sendPairingBlast(followers, blastData, req, res);

	const blastPromise = new Promise((resolve) => {
		Promise.resolve(blast).then((blastResponse) => {
			const replacements = {
				tournId: req.params.tournId,
				personId: req.person?.id || '',
				description: `Pairing blast sent. ${blastResponse?.message} ${req.person ? '' : 'by autoblast'} `,
				roundId,
			};

			const logPromise = kdb.insertInto('change_log')
				.values({
					tag         : 'tabbing',
					description : replacements.description,
					person      : replacements.personId,
					round       : replacements.roundId,
					tourn       : replacements.tournId,
				})
				.execute();

			Promise.resolve(logPromise).then(() => {
				resolve(blastResponse);
			});

			resolve(blastResponse);
		});
	});

	if (req.params.timeslotId || (!res.status)) {
		return blastPromise;
	}

	Promise.resolve(blastPromise).then((blastResponse) => {
		return res.status(200).json(blastResponse);
	});
}

export async function roundBlastStatus(req, res) {
	const { rows: publish } = await sql`
    select
      aq.id,
      aq.tag, aq.message,
      person.id personId, person.email, person.first, person.last,
      aq.active_at activeAt,
      aq.created_at createdAt
    from (autoqueue aq, round)
      left join person on person.id = aq.created_by
    where 1=1
      and round.id  = ${req.params.roundId}
      and round.id = aq.round
      and aq.tag IN ('blast', 'publish', 'blast_publish')
  `.execute(kdb);

	return res.status(200).json([...publish]); // always deliver an array, even when blank
}

// No default export; use named exports
