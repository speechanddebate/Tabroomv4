import { sql } from 'kysely';
import { getFollowers, getPairingFollowers } from '../../../helpers/followers.js';
import logger from '../../../helpers/logger.js';
import { notify } from '../../../helpers/blast.js';
import { sendPairingBlast, formatPairingBlast } from '../../../helpers/pairing.js';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

export async function blastSectionMessage(req, res) {
	if (!req.body.message) {
		return res.status(200).json({
			error   : true,
			message : 'No message to blast sent',
		});
	}

	await summon(kdb, 'panel',req.params.sectionId);
	const tourn = await summon(kdb, 'tourn',req.params.tournId);

	const personIds = await getFollowers(
		{ sectionId : req.params.sectionId },
		req.body
	);

	const seconds = Math.floor(Date.now() / 1000);
	const numberwang = seconds.toString().substring(-5);

	const from = `${tourn.name} <${tourn.webname}_${numberwang}@www.tabroom.com>`;
	const fromAddress = `<${tourn.webname}_${numberwang}@www.tabroom.com>`;

	const notifyResponse = await notify({
		ids         : personIds,
		text        : req.body.message,
		from,
		fromAddress,
	});

	if (notifyResponse.error) {
		logger.error(notifyResponse.message);
		return res.status(200).json(notifyResponse);
	}

	await changeLogRepo.createChangeLog(kdb, {
		tag         : 'blast',
		description : `${req.body.message} sent to ${notifyResponse.push?.count || 0} web and ${notifyResponse.email?.count || 0} email recipients `,
		person      : req.person?.id,
		count       : notifyResponse.push?.count || 0,
		panel       : req.params.sectionId,
	});

	return res.status(200).json({
		error   : false,
		message : notifyResponse.message,
	});
};

// Blast a single section with a pairing
export async function blastSectionPairing(req, res) {
	const queryData = {};
	queryData.replacements = { sectionId : req.params.sectionId };
	queryData.where = sql`where section.id = ${req.params.sectionId}`;
	queryData.fields = sql``;

	const blastData = await formatPairingBlast(queryData, req);
	const tourn = await summon(kdb, 'tourn',req.params.tournId);

	const seconds = Math.floor(Date.now() / 1000);
	const numberwang = seconds.toString().substring(-5);

	blastData.from = `${tourn.name} <${tourn.webname}_${numberwang}@www.tabroom.com>`;
	blastData.fromAddress = `<${tourn.webname}_${numberwang}@www.tabroom.com>`;

	const followers = await getPairingFollowers(
		queryData.replacements,
		{ ...req.body },
	);

	if (req.body.append) {
		blastData.append = req.body.append;
	}

	blastData.tourn = tourn.id;
	const response = await sendPairingBlast(followers, blastData, req, res);

	await changeLogRepo.createChangeLog(kdb, {
		tag         : 'blast',
		description : `Pairing individually sent to section : ${response.message} `,
		person      : req.person?.id,
		tourn       : req.params.tournId,
		panel       : req.params.sectionId,
	});

	return res.status(200).json({
		error   : false,
		message : response.message,
	});
};
