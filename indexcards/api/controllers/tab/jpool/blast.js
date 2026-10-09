import { notify } from '../../../helpers/blast.js';
import { BadRequest, UnexpectedError } from '../../../helpers/problem.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/index.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

export async function blastJudges(req, res) {
	if (!req.body.message) {
		return BadRequest(req, res, 'No message to blast sent');
	}

	const jpool = await summon(kdb, 'jpool',req.params.jpoolId);

	let query = sql``;

	if (req.body.free) {
		query = sql`
			select distinct person.id
				from (person, judge, jpool_judge jpj, jpool_round jpr, round)
			where round.timeslot = ${jpool.settings.standby_timeslot}
				and round.id = jpr.round
				and jpr.jpool = jpj.jpool
				and round.site = ${jpool.site}
				and jpj.judge = judge.id
				and judge.person = person.id

			and NOT EXISTS (
					select b2.id
					from (ballot b2, panel p2, round r2)
					where r2.timeslot = round.timeslot
					and r2.id = p2.round
					and p2.id = b2.panel
					and b2.judge = judge.id
			)

			and not exists (
				select jpj.id
				from jpool_judge jpj
				where jpj.jpool = ${req.params.jpoolId}
				and jpj.judge = judge.id
			)
		`;

	} else {
		query = sql`
			select distinct person.id
				from (person, judge, jpool_judge jpj)
			where jpj.jpool = ${req.params.jpoolId}
				and jpj.judge = judge.id
				and judge.person = person.id
				and not exists (
					select ballot.id
						from ballot, panel, round, jpool_setting jps
					where ballot.judge = judge.id
						and ballot.panel = panel.id
						and panel.round = round.id
						and round.timeslot = jps.value
						and jps.tag = 'standby_timeslot'
						and jps.jpool = ${req.params.jpoolId}
				)
		`;
	}

	const { rows: jpoolJudgeIds } = await query.execute(kdb);

	const jpoolJudgeArray = [];

	jpoolJudgeIds.forEach( (jpj) => {
		jpoolJudgeArray.push(jpj.id);
	});

	const tourn = await summon(kdb, 'tourn',req.params.tournId);
	const seconds = Math.floor(Date.now() / 1000);
	const numberwang = seconds.toString().substring(-5);

	const from = `${tourn.name} <${tourn.webname}_${numberwang}@www.tabroom.com>`;
	const fromAddress = `<${tourn.webname}_${numberwang}@www.tabroom.com>`;

	const blastResponse = await notify({
		ids     : jpoolJudgeArray,
		text    : req.body.message,
		subject : req.body.subject || `Message to ${jpool.name} judges`,
		from,
		fromAddress,
	});

	const { rows: rawRounds } = await sql`
		select distinct round.id
			from round, jpool_round jpr
		where jpr.jpool = ${req.params.jpoolId}
			and jpr.round = round.id
	`.execute(kdb);

	const promises = [];

	rawRounds.forEach( async (round) => {
		promises.push(changeLogRepo.createChangeLog(kdb, {
			tag         : 'blast',
			description : `${req.body.message} sent to ${jpoolJudgeIds.length} judges in ${jpool.name}`,
			person      : req.person?.id,
			round       : round.id,
		}));
	});

	await Promise.all(promises);

	if (blastResponse.error) {
		return UnexpectedError(req, res, blastResponse.message);
	}

	res.status(200).json(blastResponse);
};
