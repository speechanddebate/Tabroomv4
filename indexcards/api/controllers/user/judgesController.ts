import  judgeRepo from '../../repos/judgeRepo.js';
import panelRepo from '../../repos/panelRepo.js';
import scoreRepo from '../../repos/scoreRepo.js';
import entryRepo from '../../repos/entryRepo.js';
import { entryScores, panelWinner, sideLabel, studentScores } from '../../services/judges/judgeHistory.js';
import chapterJudgeRepo from '../../repos/chapterJudgeRepo.js';
import chapterRepo from '../../repos/chapterRepo.js';
import personRepo from '../../repos/personRepo.js';
import tabroomRepo from '../../repos/tabroomRepo.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import { profanityCheck, sanitizeHTML } from '../../helpers/text.js';
import { BadRequest, Forbidden, NotFound } from '../../helpers/problem.js';
import { notify } from '../../helpers/blast.js';
import logger from '../../helpers/logger.js';
import { db } from '../../data/database.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import type { Request, Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';
import type { SessionPerson } from '../../middleware/auth/types.js';

async function linkRequests(req: Request, res: Response) {
	const person = getPerson(req);
	const [judges, chapterJudges] = await Promise.all([
		judgeRepo.getJudges(db, { person_request: person.id }),
		chapterJudgeRepo.getChapterJudges(db, {
			person_request: person.id,
		}),
	]);

	const results = [
		...judges.map((j) => ({
			id: j.id,
			type: 'judge' as const,
			first: j.first,
			last: j.last,
		})),
		...chapterJudges.map((cj) => ({
			id: cj.id,
			type: 'chapter_judge' as const,
			first: cj.first,
			last: cj.last,
		})),
	];

	return res.status(200).json(results);
}
// handle a request to claim an unlinked judge or chapter judge.
async function claimRequest(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const { judgeId, chapterJudgeId } = req.query;
	// XOR validation: exactly one must be present
	if ((!!judgeId && !!chapterJudgeId) || (!judgeId && !chapterJudgeId))
		return BadRequest(req, res, 'Must provide exactly one of judgeId or chapterJudgeId');

	if (judgeId) {
		const judge = await judgeRepo.getJudge(db,judgeId);
		// grab judge, verify it has a category
		if (!judge || !judge.category) {
			return BadRequest(req, res, 'Invalid judge ID or judge has no category');
		}

		const already = await db.selectFrom('judge')
		.select('id')
		.where('category', '=', judge.category)
		.where((eb) => eb.or([
			eb('person', '=', person.id),
			eb('person_request', '=', person.id),
		]))
		.executeTakeFirst();

		if (already) {
			return BadRequest(req, res, `You are already linked to another ${judge.category} judge.  You may only link to one judge in a given tournament.  If you are trying to link yourself to all your school's judges, please DO NOT.  Every judge must be linked to their OWN Tabroom account.`);
		}
		await judgeRepo.updateJudge(db, judgeId, { person_request: person.id });
		return res.status(200).json({
			message: 'Judge claim request submitted',
			detail: 'A message has been sent to your chapter admins to approve this request.',
		});
	}
	//grab chapter judge, verify it has a chapter
	const chapterJudge = await chapterJudgeRepo.getChapterJudge(db,chapterJudgeId);
	if (!chapterJudge || !chapterJudge.chapter) {
		return BadRequest(req, res, 'Invalid chapter judge ID or chapter judge has no chapter');
	}
	// search for other chapter judges in the chapter the person has claimed or requested, error if any exist
	const already = await db.selectFrom('chapter_judge')
		.select('id')
		.where('chapter', '=', chapterJudge.chapter)
		.where((eb) => eb.or([
			eb('person', '=', person.id),
			eb('person_request', '=', person.id),
		]))
		.executeTakeFirst();
	if (already) {
		return BadRequest(req, res, `You are already linked to another judge on that school's roster. You can only be linked to 1 judge per roster at a time. If you are linking yourself to all your school's judges, DO NOT. Each judge must have their OWN Tabroom account for the system to function.`);
	}

	// get the chapter admins
	const admins = await chapterRepo.getAdmins(db,chapterJudge.chapter);

	if(admins.some(a => a.id === person.id)) {
		await chapterJudgeRepo.updateChapterJudge(db, chapterJudgeId, { person: person.id, person_request: null });
		return res.status(200).json({
			message: 'Judge linked successfully.',
			detail: 'Because you are a chapter admin, your request to link to this judge has been automatically approved.',
		});
	}
	if(admins.some(a => a.email && !a.no_email)) {
		const emailData = buildChapterJudgeClaimEmail(chapterJudge, person);
		await notify({
			ids: admins.filter(a => a.email && !a.no_email).map(a => a.id),
			...emailData,
		});
	} else {
		logger.warn('Chapter with id ' + chapterJudge.chapter + ' has no admins setup to receive emails. Cannot send judge claim notification email.');
	}
	await chapterJudgeRepo.updateChapterJudge(db, chapterJudgeId, { person_request: person.id });
	return res.status(200).json({
		message: 'Judge claim request submitted',
		detail: 'A message has been sent to your chapter admins to approve this request.',
	});

};

//get the judge history for /user/judge/history page.
async function history(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const { limit, offset } = req.query;

	const [judgeHistory, total] = await Promise.all([
		judgeRepo.getJudgeHistory(db, person.id, {limit, offset}),
		judgeRepo.countJudgeHistory(db, person.id),
	]);
	const items = judgeHistory.map(j => ({
		id: j.id,
		Tourn: {
			id: j.Tourn.id,
			name: j.Tourn.name,
			start: j.Tourn.start,
			end: j.Tourn.end,
			tz: j.Tourn.tz,
		},
		Weekend: j.Weekend,
		division: j.Category.name,
		roundsJudged: j.roundCount,
		roundsObligated: (j.obligation ?? 0) + (j.hired ?? 0),
	}));
	return res.status(200).json({ items, total });
};

// the judge's record at one tournament for /user/judge/history/[tournId]
async function historyTourn(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const { tournId } = req.params;

	const records = await judgeRepo.getJudgeTournHistory(db, person.id, tournId);
	if (records.length === 0) {
		return NotFound(req, res, 'No judging record at this tournament');
	}

	const Judges = await Promise.all(records.map(async (judge) => {
		const [panels, posted] = await Promise.all([
			panelRepo.getJudgeHistoryPanels(db, judge.id, { stage: 'assigned' }),
			panelRepo.getJudgeHistoryPanels(db, judge.id, { stage: 'results' }),
		]);
		const [scores, students] = await Promise.all([
			scoreRepo.getPanelScores(db, posted.map(p => p.id)),
			entryRepo.getEntryStudents(db, posted.flatMap(p => p.Entries.map(e => e.id))),
		]);

		const Results = posted.map(panel => {
			const panelScores = scores.filter(s => s.panel === panel.id);
			const Entries = panel.Entries.map(entry => ({
				id: entry.id,
				code: entry.code,
				name: entry.name,
				side: sideLabel(panel.Event.type, entry.side, entry.speakerorder, panel.Event.affLabel, panel.Event.negLabel),
				speakerOrder: entry.speakerorder,
				Scores: entryScores(panelScores, entry.id, judge.id, panel.Event.type),
				Students: students
					.filter(student => student.entry === entry.id)
					.map(student => ({ id: student.id, last: student.last, Scores: studentScores(panelScores, entry.id, student.id, judge.id) }))
					// Only speakers this judge scored
					.filter(student => student.Scores.winloss || student.Scores.rank !== null || student.Scores.point !== null),
			}));
			const hasStudentScores = Entries.some(entry => entry.Students.length > 0);
			return {
				id: panel.id,
				flight: panel.Round.flighted && panel.Round.flighted > 1 ? panel.flight : null,
				Round: {
					id: panel.Round.id,
					name: panel.Round.name,
					label: panel.Round.label,
					type: panel.Round.type,
				},
				Event: {
					id: panel.Event.id,
					abbr: panel.Event.abbr,
					type: panel.Event.type,
				},
				Entries,
				Winner: panelWinner(panelScores, panel.Entries, panel.Round.type, panel.Event.type, hasStudentScores),
			};
		});

		return {
			Results,
			id: judge.id,
			code: judge.noCodes ? null : judge.code,
			obligation: judge.obligation ?? 0,
			hired: judge.hired ?? 0,
			roundsJudged: judge.roundCount,
			flightsJudged: judge.ballotCount,
			School: judge.School,
			Category: judge.Category,
			Panels: panels.map(panel => ({
				id: panel.id,
				flight: panel.Round.flighted && panel.Round.flighted > 1 ? panel.flight : null,
				start: panel.start,
				Round: {
					id: panel.Round.id,
					name: panel.Round.name,
					label: panel.Round.label,
					type: panel.Round.type,
				},
				Event: {
					id: panel.Event.id,
					abbr: panel.Event.abbr,
					type: panel.Event.type,
				},
				Room: panel.Room,
				Entries: panel.Entries.map(entry => ({
					id: entry.id,
					code: entry.code,
					name: entry.name,
					side: sideLabel(panel.Event.type, entry.side, entry.speakerorder, panel.Event.affLabel, panel.Event.negLabel),
					speakerOrder: entry.speakerorder,
				})),
			})),
		};
	}));

	return res.status(200).json({ Tourn: records[0].Tourn, Judges });
};

async function getParadigm(req: Request, res: Response) {
	const person = getPerson(req);
	const paradigm = await personRepo.getPerson(db,person.id, {
		settings: ['paradigm'],
	});
	if(!paradigm?.settings?.paradigm) {
		return NotFound(req, res, 'Paradigm not found for this person');
	}
	return res.status(200).json({ paradigm: paradigm.settings.paradigm });
}

async function updateParadigm(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);

	const Person = await personRepo.getPerson(db, person.id, {
		settings: ['email_unconfirmed'],
	});
	if(!Person) throw new Error('Couldn\'t find person');
	//check ability to save. check email confirmation, word count, profanity
	if(Person.settings?.email_unconfirmed)
		return Forbidden(req, res, 'You must confirm your email before saving a paradigm');

	//check word count limits
	const tabSettings = await tabroomRepo.getSettings(db,[
		'paradigm_word_limit',
	]);
	if(tabSettings.filter(s => s.tag === 'paradigm_word_limit')[0]?.value){
		const wordLimit = parseInt(tabSettings.filter(s => s.tag === 'paradigm_word_limit')[0].value);
		const wordCount = req.body.paradigm.split(/\s+/).length;
		if(wordCount > wordLimit){
			return BadRequest(req, res, `Paradigm exceeds the word limit of ${wordLimit}. Your paradigm has ${wordCount} words.`);
		}
	} else {
		logger.debug('no paradigm word limit set, skipping word count check');
	}

	const naughtywords = profanityCheck(req.body.paradigm);
	if(naughtywords.length > 0){
		return BadRequest(req, res, 'paradigm contains prohibited words', { words: naughtywords });
	}
	const cleanParadigm = sanitizeHTML(req.body.paradigm, { restrictive: true });
	if(cleanParadigm !== req.body.paradigm){
		logger.debug('Paradigm was modified by sanitization.', { original: req.body.paradigm, clean: cleanParadigm });
	}
	//update the paradigm and relevant settings
	await personRepo.updatePerson(db, Person.id, {
		settings: {
			paradigm: cleanParadigm,
		}
	});

	try {
		await changeLogRepo.createChangeLog(db,{
			tag: 'paradigm',
			person: Person.id,
			description: `Saved new paradigm${req.auth.su ? ` by ${req.auth.su.email} while su'd as ${person.email}` : ''} from session ${req.auth.sessionId} logged in from ${req.ip}`,
		});
	} catch (err) {
		logger.error('Failed to log paradigm change in change log', { error: err });
	}

	return res.status(204).send();
}

async function getLiveDocs(req: Request, res: Response){
	const person = getPerson(req);
	const liveDocs = await judgeRepo.getLiveDocs(db, person.id);
	return res.status(200).json(liveDocs);
}
export default {
	linkRequests,
	claimRequest,
	history,
	historyTourn,
	getParadigm,
	updateParadigm,
	getLiveDocs,
};

function buildChapterJudgeClaimEmail(
	chapterJudge: NonNullable<Awaited<ReturnType<typeof chapterJudgeRepo.getChapterJudge>>>, 
	person: SessionPerson) {
	let text = `The Tabroom user \n\n${person.first} ${person.last} (${person.email}) \n\n
	has requested online access to updates, ballots and texts for judge ${chapterJudge.first} ${chapterJudge.last} in your team roster.\n\n
	If these are the same people, approve this request by logging into Tabroom and visiting\n\n
	https://tabroom.com/user/chapter/judges.mhtml?chapter_id=${chapterJudge.chapter}\n\n
	If this is not authorized, you do not need to do anything.\n\n`;
	return {
		subject: `[Tabroom] ${person.email} requests access to judge ${chapterJudge.first} ${chapterJudge.last}`,
		from: `Tabroom Link <judgelink_${String(Date.now()).slice(-6)}@www.tabroom.com>`,
		replyTo: `${person.first} ${person.last} <${person.email}>`,
		text,
	};
};
