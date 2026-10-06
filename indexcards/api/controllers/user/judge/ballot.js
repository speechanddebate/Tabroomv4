import { checkJudgePerson } from '../../../helpers/auth.js';
import logger from '../../../helpers/logger.js';
import { db } from '../../../data/database.js';
import { ballotRepo } from '../../../repos/ballotRepo.js';
import scoreRepo from '../../../repos/scoreRepo.js';

export async function checkActive(req, res) {
	const judgeId = parseInt(req.params.judgeId);

	const judges = await db.selectFrom('judge')
		.where('judge.id', '=', judgeId)
		.select(['judge.active', 'judge.id', 'judge.person as personId'])
		.execute();

	if (judges && judges[0].person === req.person?.id) {
		return (judges[0].active);
	}
};

export async function checkBallotAccess (req, res) {
	const judgeId = parseInt(req.params.judgeId);
	const sectionId = parseInt(req.params.sectionId);

	const access = await db.selectFrom('ballot')
		.innerJoin('judge', 'ballot.judge', 'judge.id')
		.where('ballot.judge', '=', judgeId)
		.where('ballot.panel', '=', sectionId)
		.select(['ballot.id', 'ballot.audit', 'ballot.judge','judge.person as personId'])
		.execute();

	if (access && access.length > 0) {

		let ok = false;
		let stop = 0;

		for (const ballot of access) {
			if (stop < 1) {
				if (!req.person
					|| (ballot.personId !== req.person.id && !req.person.site_admin)
				) {
					stop++;
					return res.status(200).json({
						error   : false,
						message : `Your Tabroom account is not linked to that judge!`,
						refresh : true,
					});
				}

				if (!ballot.audit) {
					ok = true;
				}
			}
		}

		if (ok) {
			return res.status(200).json({
				refresh: false,
			});
		}

		return res.status(200).json({
			error   : false,
			message : `Your ballot has already been marked confirmed.`,
			refresh : true,
		});

	}

	return res.status(200).json({
		error   : false,
		message : `You no longer have access to this ballot.  Check on Tabroom or with tournament staff to see whether you have been reassigned.`,
		refresh : true,
	});
};

export async function getBallotSides(req, res) {
	const judgeId = parseInt(req.params.judgeId);
	const sectionId = parseInt(req.params.sectionId);

	const ballots = await db.selectFrom('ballot')
		.where('ballot.judge', '=', judgeId)
		.where('ballot.panel', '=', sectionId)
		.select(['ballot.id', 'ballot.entry', 'ballot.side'])
		.execute();

	const ballotData = {
		affBallot: 0,
		negBallot: 0,
	};

	for (const ballot of ballots) {
		if (ballot.side === 1) {
			ballotData.affBallot = ballot.id;
		}

		if (ballot.side === 2) {
			ballotData.negBallot = ballot.id;
		}
	}

	return res.status(200).json(ballotData);
};

export async function saveRubric(req, res) {
	const autoSave = req.body;
	const judgeId = parseInt(req.params.judgeId);

	// putting the judgeId into parameters and not the body because
	// eventually I'll want to put these access checks up the chain

	if (!req.person) {
		return res.status(200).json({
			error   : true,
			message : 'You do not appear to be logged in with a current active session',
		});
	}

	const judgeOK = await checkJudgePerson(req, judgeId);

	if (!judgeOK) {
		return res.status(200).json({
			error: true,
			message: 'You do not have permission to change that ballot',
		});
	}

	const ballot = await ballotRepo.getBallot(db,autoSave.ballot);

	if (ballot?.judge !== judgeId) {
		return res.status(200).json({
			error   : true,
			message : `You are not the listed judge for that ballot.  ${ballot?.judge} vs ${judgeId}`,
		});
	}

	const score = await db.selectFrom('score')
		.where('score.ballot', '=', ballot.id)
		.where('score.tag', '=', 'rubric')
		.selectAll()
		.executeTakeFirst();
	delete autoSave.ballot;

	if (score && score.id) {

		try {
			await db.updateTable('score')
				.set({ content: JSON.stringify(autoSave) })
				.where('id', '=', score.id)
				.execute();
		} catch (err) {
			logger.error(`Error encountered in savings scores ${err} ballot ${ballot.id} score ${score.id}`);
		}

	} else {

		try {
			await scoreRepo.createScore(db,{
				ballot  : ballot.id,
				tag     : 'rubric',
				value   : 0,
				content : JSON.stringify(autoSave)
			});
		} catch (err) {
			logger.error(`Error encountered in savings scores ${err} ballot ${ballot?.id} score ${score?.id}`);
			logger.error(req.params);
		}
	}

	return res.status(200).json({
		error: false,
		message: `Scores auto-saved!`,
	});
};

export default saveRubric;
