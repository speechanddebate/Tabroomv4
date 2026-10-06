// Assigning a round robin.  For now this is used only for defined pattern
// round robins that have preset patterns in the global settings.
import { BadRequest } from '../../../helpers/problem.js';
import { writeRound } from '../../../helpers/round.js';
import { db } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';

export async function sectionTemplateRobin(req, res) {
	const division = await summon(db, 'event',req.params.eventId);

	if (!division || !division.id) {
		return res.status(200).json(`No event found with ID ${req.params.eventId}`);
	}

	const entries = await db.selectFrom('entry')
		.selectAll()
		.where('event', '=', division.id)
		.where('active', '=', 1)
		.execute();

	const rrTag = `round_robin_${entries.length}`;

	const rrSetting = await db.selectFrom('tabroom_setting')
		.selectAll()
		.where('tag', '=', rrTag)
		.executeTakeFirst();

	const rrPattern = JSON.parse(rrSetting.value_text);

	if (!rrPattern) {
		return res.status(200).json({ error: true, message: `No pattern found for ${entries.length}` });
	}

	const rounds = await db.selectFrom('round')
		.selectAll()
		.where('event', '=', division.id)
		.execute();

	if (rounds.length !== rrPattern.rounds) {
		return BadRequest(req, res,`Incorrect round count for pattern. ${rrPattern.rounds} rounds required`);
	}

	const judges = await db.selectFrom('judge')
		.selectAll()
		.where('category', '=', division.category)
		.where('active', '=', 1)
		.execute();

	const positions = {};
	let index = 1;

	entries.sort(() => Math.random() - 0.5).forEach( (entry) => {

		positions[index] = {};
		positions[index].entry = entry.id;
		judges.forEach( (judge) => {
			if (judge.school === entry.school) {
				positions[index].judge = judge.id;
			}
		});
		index++;
	});

	rounds.forEach( async (round) => {

		round.sections = [];

		Object.keys(rrPattern[round.name]).forEach( async (letter) => {

			const template = rrPattern[round.name][letter];
			const section = {};

			if (template.b) {
				section.b = positions[template.b].entry;
			} else {
				section.j = positions[template.j].judge;
				section.a = positions[template.a].entry;
				section.n = positions[template.n].entry;
			}
			round.sections.push(section);
		});

		round.type = 'debate';
		await writeRound(round);
	});

	return res.status(200).json({ error: false, message: `${rounds.length} paired for the round robin`, refresh: true });
};
