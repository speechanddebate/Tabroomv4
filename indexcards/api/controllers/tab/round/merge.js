import { sql } from 'kysely';
import { db } from '../../../data/database.js';

// The route checks round write on the requested round. TODO: merging still touches every round in the
// timeslot and judge category, including events the user may not write; limit it to
// which('round', 'write', { tourn }) before enabling. Also the frontend needs to change to allow
// it to be invoked; the URL is definitely now broken.

// Merges and unmerges all the rounds in a given timeslot and judge category
// for unified judge placement.  This method should be more robust than the
// stash & store method.

export async function mergeTimeslotRounds(req, res) {
	const roundId = req.params.roundId;

	try {
		await sql`
			update
				panel, round, round r2, event, event e2
			set panel.round = round.id
			where round.id = ${roundId}
				and panel.round = r2.id
				and r2.timeslot = round.timeslot
				and round.event = event.id
				and r2.event = e2.id
				and e2.category = event.category
		`.execute(db);

	} catch (err) {

		res.status(200).json({
			error   : true,
			message : `Error occurred on merge: ${err}`,
		});
	}

	try {
		await db.insertInto('round_setting')
			.values({ round: roundId, tag: 'timeslot_merge', value: '1' })
			.execute();
	} finally {

		res.status(200).json({
			refresh : true,
			error   : false,
			message : `All rounds in this judge category have been merged to this one for judge placement.`,
		});
	}
};

export async function unmergeTimeslotRounds(req,res) {
	const roundId = req.params.roundId;

	try {
		await sql`
			update
				panel, ballot, entry, event, round, round current
			set panel.round = round.id
			where panel.round = ${roundId}
				and panel.id = ballot.panel
				and ballot.entry = entry.id
				and entry.event = event.id
				and event.id = round.event
				and panel.round = current.id
				and current.timeslot = round.timeslot
		`.execute(db);

	} catch (err) {

		res.status(200).json({
			error   : true,
			message : `Error occurred on merge: ${err}`,
		});
	}

	try {
		await db.deleteFrom('round_setting')
			.where('round', '=', roundId)
			.where('tag', '=', 'timeslot_merge')
			.execute();

	} catch (err) {

		res.status(200).json({
			error   : true,
			message : `Error occurred on merge: ${err}`,
		});
	}

	res.status(200).json({
		refresh : true,
		error   : false,
		message : `All rounds have been restored to their original event.`,
	});
};
