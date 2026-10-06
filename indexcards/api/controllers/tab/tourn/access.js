import logger from '../../../helpers/logger.js';
import { BadRequest, Forbidden, NotFound, NotImplemented } from '../../../helpers/problem.js';
import { db } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

// Functions that manage overall tournament access.

// A person's permissions in a tourn, with the ids of any event or category
// they are scoped to
const personTournPerms = (personId, tournId) => db.selectFrom('permission as perm')
	.leftJoin('event', 'event.id', 'perm.event')
	.leftJoin('category', 'category.id', 'perm.category')
	.selectAll('perm')
	.select(['event.id as eventId', 'category.id as categoryId'])
	.where('perm.person', '=', personId)
	.where('perm.tourn', '=', tournId)
	.execute();

const findBackupFollowers = (tournId) => db.selectFrom('tourn_setting')
	.selectAll()
	.where('tourn', '=', tournId)
	.where('tag', '=', 'backup_followers')
	.executeTakeFirst();

// Show permissions for a user
export async function getAccess(req, res) {
	return NotImplemented(req, res);
}
// Add permissions that are not there already.  Currently in Perl.
// Will port over.
export async function createAccess(req, res) {
	return NotImplemented(req, res);
}

export async function updateAccess(req, res) {
	const targetPerson = await summon(db, 'person',req.params.personId);

	if (!targetPerson) {
		return NotFound(req, res, 'No person found with that Tabroom ID');
	}

	let tag = req.body.access_level;
	if (tag === 'choose') {
		tag = req.body.property_value;
	}

	if (!tag) {
		logger.error(req.body);
		logger.error(tag);
		res.status(200).json('No request body sent with a proper access type specified');
		return;
	}

	if (tag === 'none' || tag === 'undefined') {

		// Remove any and all tourn level permissions from the user, except owner
		// level permissions if I am not an owner myself.

		const currentPerms = await personTournPerms(targetPerson.id, req.params.tournId);

		let description = '';
		const promises = [];

		for await (const perm of currentPerms) {

			if (perm.tag !== 'contact') {
				if (
					perm.eventId
					|| perm.categoryId
					|| (perm.tag === 'owner' && req.session.perms.tourn[req.params.tournId] !== 'owner')
				) {

					logger.info(`Skipping deletion of ${perm.id} due to it not being tournament wide`);

				} else {

					description += `${perm.tag} level tournament permissions removed from ${targetPerson.email}`;

					const promise = db.deleteFrom('permission')
						.where('id', '=', perm.id)
						.execute();
					promises.push(promise);
				}
			}
		}

		await Promise.all(promises);

		if (description) {
			await changeLogRepo.createChangeLog(db, {
				person     : req.person.id,
				tourn      : req.params.tournId,
				tag        : 'access',
				created_at : new Date(),
				description,
			});

			res.status(200).json(description);
			return;
		}

		res.status(200).json(`No existing tournament wide permissions found for ${targetPerson.email}`);
		return;
	}

	if (tag === 'contact') {

		// Only a contact or owner may adjust who is a contact

		if (
			req.session.perms.tourn[req.params.tournId] !== 'owner'
			&& (targetPerson.id !== req.person.id
				|| req.body.property_value
			)
		) {
			return Forbidden(req, res,'Only tournament owners may adjust tournament contacts other than yourself');
		}

		const currentPerm = await db.selectFrom('permission')
			.select('id')
			.where('person', '=', targetPerson.id)
			.where('tag', '=', tag)
			.where('tourn', '=', req.params.tournId)
			.executeTakeFirst();

		if (req.body.property_value) {

			if (currentPerm) {
				res.status(200).json(`User ${targetPerson.email} is already a tournament contact`);
				return;
			}

			await db.insertInto('permission').values({
				person     : targetPerson.id,
				tourn      : req.params.tournId,
				tag,
				created_by : req.person.id,
			}).execute();

			const description = `${targetPerson.email} has been made a tournament contact`;

			await changeLogRepo.createChangeLog(db, {
				person     : req.person.id,
				tourn      : req.params.tournId,
				tag        : 'access',
				created_at : new Date(),
				description,
			});

			res.status(200).json(description);
			return;
		}

		// I should not be a contact!
		if (!currentPerm) {
			return BadRequest(req, res, `User ${targetPerson.email} is not a tournament contact`);
		}

		await db.deleteFrom('permission')
			.where('person', '=', targetPerson.id)
			.where('tourn', '=', req.params.tournId)
			.where('tag', '=', tag)
			.execute();

		const description = `${targetPerson.email} is no longer a tournament contact`;

		await changeLogRepo.createChangeLog(db, {
			person     : req.person.id,
			tourn      : req.params.tournId,
			tag        : 'access',
			created_at : new Date(),
			description,
		});

		res.status(200).json(description);
		return;
	}

	const targetTags = {
		owner: {
			exclude : ['owner'],
			mustBe  : ['owner'],
		},
		tabber: {
			exclude : ['tabber', 'owner'],
			mustBe  : ['tabber', 'owner'],
		},
		checker: {
			exclude : ['owner', 'tabber', 'checker'],
			mustBe  : ['owner', 'tabber'],
		},
	};

	const target = targetTags[tag];

	if (!target) {
		return BadRequest(req, res,`Access type ${req.params.access_type} unknown`);
	}

	if (!req.session.perms.tourn[req.params.tournId]
		|| !target.mustBe.includes(req.session.perms.tourn[req.params.tournId])
	) {
		return Forbidden(req, res, 'You do not have sufficient access to grant that level of permissions');
	}

	const currentPerms = await personTournPerms(targetPerson.id, req.params.tournId);

	let currentPerm = {};

	for (const perm of currentPerms) {
		if (perm.tag !== 'contact') {
			if (!perm.eventId && !perm.categoryId) {
				currentPerm = perm;
			}
		}
	}

	if (currentPerm?.tag === tag) {
		return BadRequest(req, res,`User ${targetPerson.email} already has tournament wide ${tag} permissions`);
	}

	if (currentPerm?.id) {
		await db.updateTable('permission')
			.set({ tag, created_by: req.person.id })
			.where('id', '=', currentPerm.id)
			.execute();
	} else {

		//	await db.permission.destroy({
		//		person     : targetPerson.id,
		//		tourn      : req.params.tournId,
		//	});

		await db.insertInto('permission').values({
			person     : targetPerson.id,
			tourn      : req.params.tournId,
			created_by : req.person.id,
			tag,
		}).execute();
	}

	const description = `${targetPerson.email} granted tournament wide ${tag} permissions`;
	await changeLogRepo.createChangeLog(db, {
		person     : req.person.id,
		tourn      : req.params.tournId,
		tag        : 'access',
		created_at : new Date(),
		description,
	});

	res.status(200).json(description);
}
export async function deleteAccess(req, res) {
	const targetPerms = await db
		.selectFrom('permission as perm')
		.select(['perm.id', 'perm.tag', 'perm.event', 'perm.category'])
		.where('perm.person', '=', req.params.personId)
		.where('perm.tourn', '=', req.params.tournId)
		.execute();

	const deletePerms = [];

	for await (const perm of targetPerms) {

		if (
			perm.tag === 'owner'
			&& req.session.perms.tourn[req.params.tournId] !== 'owner'
		) {
			return Forbidden(req, res,'Only an owner-level account may delete another owner account!');
		}

		deletePerms.push(perm.id);
	}

	if (deletePerms.length > 0) {

		try {
			await db.deleteFrom('permission')
				.where('id', 'in', deletePerms)
				.execute();

		} catch (err) {
			logger.error(err.message, err);
			return;
		}

		let description;

		try {
			const targetPerson = await summon(db, 'person',req.params.personId);
			description = `All tournament access removed from ${targetPerson.email}`;
		} catch (err) {
			logger.error(err);
			return;
		}

		// I really fucking hate that I have to do this myself EVERY TIME
		// and cannot rely on the upstream to handle the most obvious errors
		// in the world.

		try {
			const logCreate = {
				tourn       : req.params.tournId,
				person      : req.person.id,
				tag         : 'access',
				created_at  : new Date(),
				description,
			};

			await changeLogRepo.createChangeLog(db, logCreate);
		} catch (err) {
			logger.error(err);
			return;
		}

		res.status(200).json({
			error   : false,
			destroy : req.params.personId,
			message : description,
		});
		return;
	}

	return Forbidden(req, res, 'That user does not have current permissions to this tournament');
}

export async function createBackupAccess(req, res) {
	const newAccount = await db.selectFrom('person')
		.selectAll()
		.where('email', '=', req.params.personEmail)
		.executeTakeFirst();

	if (!newAccount) {
		res.status.json = NotFound(req, res, 'No tabroom account was found with that email');
	}

	if (newAccount.no_email) {
		res.status.json = BadRequest(req, res,'That Tabroom account is set to not allow emails to be sent to it');
	}

	const backupAccounts = await findBackupFollowers(req.params.tournId);

	const followers = [];

	if (backupAccounts?.id) {
		if (backupAccounts.value === 'json') {
			followers.push(...(JSON.parse(backupAccounts.value_text)));
		} else {
			backupAccounts.value = 'json';
			followers.push(...backupAccounts.value.split(','));
		}
	}

	if (!followers.includes(req.params.personId)) {
		followers.push(newAccount.id);
	}

	const uniqueFollowers = [...new Set(followers)];

	if (backupAccounts?.id) {
		await db.updateTable('tourn_setting')
			.set({ value: 'json', value_text: JSON.stringify(uniqueFollowers) })
			.where('id', '=', backupAccounts.id)
			.execute();
	} else {
		await db.insertInto('tourn_setting').values({
			tourn      : req.params.tournId,
			tag        : 'backup_followers',
			value      : 'json',
			value_text : JSON.stringify(uniqueFollowers),
		}).execute();
	}

	res.status(200).json(`Added ${newAccount.email} as a tournament-wide backup follower`);
}
export async function deleteBackupAccess(req, res) {
	const backupAccounts = await findBackupFollowers(req.params.tournId);

	if (!backupAccounts?.id) {
		res.status(200).json(`Tournament has no current backup followers`);
	}

	const followers = [];
	if (backupAccounts.value === 'json') {
		followers.push(...(JSON.parse(backupAccounts.value_text)));
	} else {
		backupAccounts.value = 'json';
		followers.push(...backupAccounts.value.split(','));
	}

	const index = followers.indexOf(req.params.personId);
	if (index > -1) {
		followers.splice(index, 1);
	}

	if (followers.length < 1) {
		await db.deleteFrom('tourn_setting')
			.where('id', '=', backupAccounts.id)
			.execute();
	} else {
		await db.updateTable('tourn_setting')
			.set({ value: 'json', value_text: JSON.stringify(followers) })
			.where('id', '=', backupAccounts.id)
			.execute();
	}

	res.status(200).json(`Backup follower removed`);
}
