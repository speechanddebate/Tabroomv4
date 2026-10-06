import { NotFound, NotImplemented, UnexpectedError } from '../../../helpers/problem.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';

export async function getRPool(req, res) {
	const rpool = await summon(kdb, 'rpool',req.params.rpoolId);
	return res.status(200).json(rpool);
}
// Never worked: it called update() on a plain object.
export async function createRPool(req, res) {
	return NotImplemented(req, res, 'Updating a room pool is not yet implemented');
};
export async function deleteRPool(req, res) {
	try {
		await kdb.deleteFrom('rpool')
			.where('id', '=', req.params.rpoolId)
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	return res.status(200).json({
		error: false,
		message: 'Room pool deleted',
	});
};

// CRUD for the rooms in the rpool.  Almost entirely consists of removing
// or creating rpool_room relationships.

// Update a single room.  Only POST and DELETE needed here.
export async function createRPoolRoom(req, res) {
	try {
		await kdb.insertInto('rpool_room')
			.ignore()
			.values({ rpool: req.params.rpoolId, room: req.params.roomId })
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	return res.status(200).json({
		error   : false,
		message : 'Room added to pool',
	});
}
export async function deleteRPoolRoom(req, res) {
	await kdb.deleteFrom('rpool_room')
		.where('rpool', '=', req.params.rpoolId)
		.where('room', '=', req.params.roomId)
		.execute();

	return res.status(200).json({
		error: false,
		message: 'Room removed from pool',
	});
}

export async function getRPoolRooms(req, res) {
	const { rows: rooms } = await sql`
		select room.* from room, rpool_room rpj
			where room.id = rpj.room
			and rpj.rpool = ${req.params.rpoolId}
	`.execute(kdb);

	return res.status(200).json(rooms);
};
export async function createRPoolRooms(req, res) {
	let errs = '';

	req.body.rooms.forEach( async (roomId) => {
		try {
			await kdb.insertInto('rpool_room')
				.ignore()
				.values({ rpool: req.params.rpoolId, room: roomId })
				.execute();

		} catch (err) {
			errs += err;
		}
	});

	if (errs) {
		return UnexpectedError(req, res, errs);
	}

	return res.status(200).json('Rooms added to pool');
};
export async function deleteRPoolRooms(req, res) {
	await kdb.deleteFrom('rpool_room')
		.where('rpool', '=', req.params.rpoolId)
		.execute();

	return res.status(200).json('All rooms removed from pool');
};

// CRUD for the rounds in the rpool.  Almost entirely consists of removing
// or creating rpool_round relationships.

// Update a single round.  Only POST and DELETE needed here.

export async function createRPoolRound(req, res) {
	try {
		await kdb.insertInto('rpool_round')
			.ignore()
			.values({ rpool: req.params.rpoolId, round: req.params.roundId })
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	return res.status(200).json('Round added to pool');
}
export async function deleteRPoolRound(req, res) {
	await kdb.deleteFrom('rpool_round')
		.where('rpool', '=', req.params.rpoolId)
		.where('round', '=', req.params.roundId)
		.execute();

	return res.status(200).json({
		error: false,
		message: 'Round removed from pool',
	});
};

// Update a bunch of rounds

export async function getRPoolRounds(req, res) {
	const { rows: rounds } = await sql`
		select round.* from round, rpool_round rpr
		where round.id = rpr.round
			and rpr.rpool = ${req.params.rpoolId}
	`.execute(kdb);

	return res.status(200).json(rounds);
};
export async function createRPoolRounds(req, res) {

	let errs = '';
	let reply = '';

	if (req.body.property_value) {

		const { rows: rounds } = await sql`
			select round.id, round.label, round.name, event.abbr
			from round, event
			where round.id = ${req.body.property_value}
			and round.event = event.id
		`.execute(kdb);

		if (!rounds || rounds.length < 1) {
			return NotFound(req, res,`No round found with ID ${req.body.property_value}`);
		}

		const round = rounds.shift();

		try {
			await kdb.insertInto('rpool_round')
				.ignore()
				.values({ rpool: req.params.rpoolId, round: parseInt(req.body.property_value) })
				.execute();

		} catch (err) {
			errs += err;
		}

		// oh for the day when I have a real framework running and no longer
		// have to do this
		reply                 = `
			<span class       = "quarter nospace">
			<a value          = "1"
				id            = "${round.id}_${req.params.rpoolId}"
				property_name = "delete"
				round_id      = "${round.id}"
				rpool_id      = "${req.params.rpoolId}"
				on_success    = "destroy"
				onclick       = "postSwitch(this, 'rpool_round_rm.mhtml'); fixVisual();"
				class         = "full white nowrap hover marno smallish"
				title         = "Remove this round"
			>${round.abbr} ${round.name}</a>
			</span>
		`;

	} else if (req.body.rounds) {

		req.body.rounds.forEach( async (roundId) => {
			try {
				await kdb.insertInto('rpool_round')
					.ignore()
					.values({ rpool: req.params.rpoolId, round: roundId })
					.execute();

			} catch (err) {
				errs += err;
			}
		});
	}

	if (errs) {
		return UnexpectedError(req, res, errs);
	}

	if (reply) {
		return res.status(200).json({
			error        : false,
			message      : 'Rounds added to pool',
			reply_append : `${req.params.rpoolId}_rounds`,
			reply,
		});
	}

	return res.status(200).json('Rounds added to pool');
};
export async function deleteRPoolRounds(req, res) {
	await kdb.deleteFrom('rpool_round')
		.where('rpool', '=', req.params.rpoolId)
		.execute();

	res.status(200).json('All rounds removed from pool');
};
