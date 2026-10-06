// Common helper functions that attach to rounds & schematics
import fetch from 'node-fetch';
import logger from './logger.js';
import objectify from './objectify.js';
import { sql } from 'kysely';
import { db } from '../data/database.js';

// Inserts a row and returns it with its new id, like the old ORM create()
const createRow = async (table, values) => {
	const result = await db.insertInto(table).values(values).executeTakeFirstOrThrow();
	return { id: Number(result.insertId), ...values };
};

// Takes a created round object with sections and writes it into the database

export const writeRound = async (round) => {

	await db.deleteFrom('panel').where('round', '=', round.id).execute();
	let letter = 1;

	if (round.type === 'debate') {

		round.sections.forEach( async (section) => {

			const judge = section.j || null;
			round.panels = [];

			if (section.b) {

				const panel = await createRow('panel',{
					round   : round.id,
					letter,
					flight  : 1,
					bye     : 1,
				});

				const ballot = await createRow('ballot',{
					panel : panel.id,
					side  : 1,
					entry : section.b,
					audit : 1,
					judge,
				});

				panel.ballots = [ballot];
				round.panels.push(panel);

			} else if (section.a && section.n) {

				const panel = await createRow('panel',{
					round   : round.id,
					letter,
					flight  : 1,
				});

				const affBallot = {
					panel : panel.id,
					side  : 1,
					entry : section.a,
					judge,
				};

				const negBallot = {
					panel : panel.id,
					side  : 2,
					entry : section.n,
					judge,
				};

				const aff = await createRow('ballot',affBallot);
				const neg = await createRow('ballot',negBallot);

				panel.ballots = [aff, neg];
				round.panels.push(panel);
			}

			letter++;
		});

	} else if (round.type === 'pf') {

		round.sections.forEach( async (section) => {
			if (section.length === 1) {
				const panel = await createRow('panel',{
					round   : round.id,
					letter,
					flight  : 1,
					bye     : 1,
				});

				const ballot = await createRow('ballot',{
					panel : panel.id,
					side  : 1,
					entry : section.b,
					audit : 1,
				});

				panel.ballots = [ballot];
				round.panels.push(panel);

			} else {

				const panel = await createRow('panel',{
					round   : round.id,
					letter,
					flight  : 1,
				});

				let side = 1;
				panel.ballots = [];

				section.forEach( async (entry) => {
					const ballot = await createRow('ballot',{
						panel : panel.id,
						side,
						entry,
					});
					panel.ballots.push(ballot);
					side++;
				});
				round.panels.push(panel);
			}
			letter++;
		});

	} else {

		round.sections.forEach( async (section) => {

			const panel = await createRow('panel',{
				round   : round.id,
				letter,
				flight  : 1,
			});

			let speakerorder = 1;
			panel.ballots = [];

			section.forEach( async (entry) => {
				const ballot = await createRow('ballot',{
					panel : panel.id,
					speakerorder,
					entry,
				});
				panel.ballots.push(ballot);
				speakerorder++;
			});
			round.panels.push(panel);

			letter++;
		});
	}

	return round;
};

export const sidelocks = async (roundId) => {

	const sidelockQuery = sql`
		select
			section.id,
			count(other.id) count,
				neg_bo.side aff_ok,
				aff_bo.side neg_ok

		from panel section, ballot aff_b, ballot neg_b, entry aff_e, entry neg_e,
			panel other, ballot aff_bo, ballot neg_bo

		where section.round = ${roundId}
			and section.id = aff_b.panel
			and aff_b.side = 1
			and aff_b.entry = aff_e.id

			and section.id = neg_b.panel
			and neg_b.side = 2
			and neg_b.entry = neg_e.id

			and section.round != other.round

			and other.id = aff_bo.panel
			and aff_bo.entry = aff_e.id

			and other.id = neg_bo.panel
			and neg_bo.entry = neg_e.id
	`;

	const { rows: sideLocks } = await sidelockQuery.execute(db);

	if (sideLocks) {
		return objectify(sideLocks);
	}
};

export const flightTimes = async (roundId) => {

	const { rows: roundSettings } = await sql`
		select
			round.id, round.name, round.start_time, round.flighted, round.type,
			tourn.tz,
			flight_offset.value flight_offset,
			prelim_decision_deadline.value prelim_deadline,
			elim_decision_deadline.value elim_deadline

		from (round, event, tourn)

			left join event_setting flight_offset
				on flight_offset.event = event.id
				and flight_offset.tag = 'flight_offset'

			left join event_setting prelim_decision_deadline
				on prelim_decision_deadline.event = event.id
				and prelim_decision_deadline.tag = 'prelim_decision_deadline'

			left join event_setting elim_decision_deadline
				on elim_decision_deadline.event = event.id
				and elim_decision_deadline.tag = 'elim_decision_deadline'

		where round.id = ${roundId}
			and round.event = event.id
			and event.tourn = tourn.id

	`.execute(db);

	const round = roundSettings.shift();
	const times = { tz: round.tz };
	const roundStart = new Date(round.start_time);

	if (round.flighted < 1) {
		round.flighted = 1;
	}

	for (let f = 1; f <= round.flighted; f++) {

		times[f] = { };

		if (round.flight_offset) {
			times[f].start = new Date(roundStart.getTime()
				+ ((f - 1) * round.flight_offset * 60000)
			);

		} else {
			times[f].start = new Date(roundStart.getTime());
		}

		if (round.type === 'final' || round.type === 'elim' || round.type === 'runoff') {

			if (round.elim_deadline) {
				if (round.flight_offset) {

					times[f].deadline = new Date(
						roundStart.getTime()
						+ ((f - 1) * round.flight_offset * 60000)
						+ (round.elim_deadline * 60000)
					);

				} else {

					times[f].deadline = new Date(
						roundStart.getTime()
						+ (round.elim_deadline * 60000)
					);
				}
			}
		} else {

			if (round.prelim_deadline) {
				if (round.flight_offset) {

					times[f].deadline = new Date(
						roundStart.getTime()
						+ ((f - 1) * round.flight_offset * 60000)
						+ (round.prelim_deadline * 60000)
					);

				} else {
					times[f].deadline = new Date(
						roundStart.getTime()
						+ (round.prelim_deadline * 60000)
					);
				}
			}
		}
	}

	return times;
};

// Pulls the cache invalidator for the legacy Mason code for now
export const invalidateCache = async (tournId, roundId) => {

	const urlPath = `/index/tourn/postings/round.mhtml?tourn_id=${tournId}&round_id=${roundId}&invalidate=1`;
	const promises = [];

	for (let server = 1; server < 21; server++) {
		const serverName = `tabweb${server}`;

		try {
			const promise = fetch(
				`http://${serverName}:8001${urlPath}`,
				{
					Method: 'GET',
				}
			);
			promises.push(promise);
		} catch (err) {
			logger.error(err);
		}
	}

	await Promise.all(promises);
	return `Invalidated cache for ${roundId}`;
};

export default writeRound;
