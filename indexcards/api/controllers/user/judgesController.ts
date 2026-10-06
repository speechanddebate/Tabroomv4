import  judgeRepo from '../../repos/judgeRepo.js';
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
import { getPerson } from '../../middleware/authorization/authorization.js';
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

	const judgeHistory = await judgeRepo.getJudgeHistory(db, person.id, {limit, offset});
	return res.status(200).json(judgeHistory.map(j => ({
		Tourn: {
			id: j.Tourn.id,
			name: j.Tourn.name,
			start: j.Tourn.start,
			end: j.Tourn.end,
		},
		division: j.Category.name,
		roundsJudged: j.roundCount,
		roundsObligated: (j.obligation ?? 0) + (j.hired ?? 0),
	})));
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
	const cleanParadigm = sanitizeHTML(req.body.paradigm);
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
			description: `Saved new paradigm from session ${req.session!.id} logged in from ${req.ip}${req.session?.Su ? ` while SU'd from account ${req.session.Su.email}` : ''}`,
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
