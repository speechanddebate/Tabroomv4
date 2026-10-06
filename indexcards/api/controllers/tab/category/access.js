// Category level access manipulation

import { BadRequest, Forbidden, NotFound, NotImplemented} from '../../../helpers/problem.js';
import { db } from '../../../data/database.js';
import personRepo from '../../../repos/personRepo.js';
import categoryRepo from '../../../repos/categoryRepo.js';
import changeLogRepo from '../../../repos/changeLogRepo.js';

// Add permissions that are not there already (create)
export async function createAccess(req, res) {
	return NotImplemented(req, res, 'This endpoint is not yet implemented');
}

// Alter existing permissions (update)
export async function updateAccess(req, res) {


	const targetPerson = await personRepo.getPerson(db, req.params.personId,{ settings: true });
	const targetCategory = await categoryRepo.getCategory(db, req.params.categoryId,{ settings: true });

	if (!targetPerson || !targetCategory) {
		return BadRequest(req, res, 'No person found with that Tabroom ID');
	}

	if (
		req.session.perms.tourn[targetCategory.tourn] !== 'owner' &&
    req.session.perms.tourn[targetCategory.tourn] !== 'tabber'
	) {
		return Forbidden(req, res, `You do not have access to change permissions in ${targetCategory.abbr}`);
	}

	const currentPerm = await db.selectFrom('permission')
		.where('person', '=', targetPerson.id)
		.where('category', '=', targetCategory.id)
		.selectAll()
		.executeTakeFirst();

	if (!currentPerm) {
		return Forbidden(
			req,
			res,
			`User ${targetPerson.email} does not have access ${targetCategory.abbr} and so it cannot be altered`
		);
	}

	currentPerm.tag = currentPerm.tag === 'checker' ? 'tabber' : 'checker';
	await db.updateTable('permission')
		.set({ tag: currentPerm.tag })
		.where('id', '=', currentPerm.id)
		.execute();
	const description = `${targetPerson.email}'s access to ${targetCategory.abbr} is now ${currentPerm.tag}`;

	const replace = [
		{
			id: `category_${targetCategory.id}_${targetPerson.id}_role`,
			content: currentPerm.tag.toUpperCase(),
		},
	];
	await changeLogRepo.createChangeLog(db, {
		person   : req.person.id,
		tourn    : req.params.tournId,
		category : targetCategory.id,
		tag      : 'access',
		description,
	});

	return res.status(200).json({
		error: false,
		message: description,
		replace,
	});
}

// Show permissions for a user
export async function getAccess(req, res) {
	res.status(200).json({ message: 'Hello', params: req.params, body: req.body });
}

// Delete a user's access to this tournament
export async function deleteAccess(req, res) {
	const targetPerson = await personRepo.getPerson(db, req.params.personId,{ settings: true });
	const targetCategory = await categoryRepo.getCategory(db, req.params.categoryId,{ settings: true });

	if (
		req.session.perms.tourn[targetCategory.tourn] !== 'owner' &&
    req.session.perms.tourn[targetCategory.tourn] !== 'tabber'
	) {
		return Forbidden(req, res, `You do not have access to change permissions in ${targetCategory.abbr}`);
	}

	await db.deleteFrom('permission')
		.where('person', '=', req.params.personId)
		.where('category', '=', req.params.categoryId)
		.execute();

	const log = await changeLogRepo.createChangeLog(db, {
		person: req.person.id,
		tourn: req.params.tournId,
		category: targetCategory.id,
		tag: 'access',
		description: `${targetPerson.email} access removed from ${targetCategory.abbr}`,
	});

	return res.status(200).json({
		error: false,
		destroy: `category_${targetCategory.id}_${targetPerson.id}`,
		message: log.description,
	});
}

// Create backup follower for a whole tournament
export async function createBackupAccess(req, res) {
	const targetPerson = await personRepo.getPerson(db, req.params.personId,{ settings: true });
	const targetCategory = await categoryRepo.getCategory(db, req.params.categoryId,{ settings: true });

	if (!targetPerson) {
		return NotFound(req, res, 'No tabroom account was found with that email');
	}

	if (targetPerson.no_email) {
		return BadRequest(req, res, 'That Tabroom account is set to not allow emails to be sent to it');
	}

	const backupAccounts = await db.selectFrom('category_setting')
		.where('category', '=', req.params.categoryId)
		.where('tag', '=', 'backup_followers')
		.selectAll()
		.executeTakeFirst();

	const followers = [];
	if (backupAccounts?.id) {
		if (backupAccounts.value === 'json') {
			followers.push(...JSON.parse(backupAccounts.value_text));
		} else {
			backupAccounts.value = 'json';
			followers.push(...backupAccounts.value.split(','));
		}
	}

	if (!followers.includes(targetPerson.id)) {
		followers.push(targetPerson.id);
	}

	const uniqueFollowers = [...new Set(followers)];

	if (backupAccounts?.id) {
		await db.updateTable('category_setting')
			.set({ value: 'json', value_text: JSON.stringify(uniqueFollowers) })
			.where('id', '=', backupAccounts.id)
			.execute();
	} else {
		await db.insertInto('category_setting')
			.values({
				category: req.params.categoryId,
				tag: 'backup_followers',
				value: 'json',
				value_text: JSON.stringify(uniqueFollowers),
			})
			.execute();
	}

	return res.status(200).json(`Added ${targetPerson.email} as a backup follower for ${targetCategory.abbr}`);
}

// Delete backup follower
export async function deleteBackupAccess(req, res) {
	const backupAccounts = await db.selectFrom('category_setting')
		.where('category', '=', req.params.categoryId)
		.where('tag', '=', 'backup_followers')
		.selectAll()
		.executeTakeFirst();

	if (!backupAccounts?.id) {
		return res.status(200).json(`Category has no current backup followers`);
	}

	const followers = [];
	if (backupAccounts.value === 'json') {
		followers.push(...JSON.parse(backupAccounts.value_text));
	} else {
		backupAccounts.value = 'json';
		followers.push(...backupAccounts.value.split(','));
	}

	const index = followers.indexOf(req.params.personId);
	if (index > -1) {
		followers.splice(index, 1);
	}

	if (followers.length < 1) {
		await db.deleteFrom('category_setting')
			.where('id', '=', backupAccounts.id)
			.execute();
	} else {
		await db.updateTable('category_setting')
			.set({ value: 'json', value_text: JSON.stringify(followers) })
			.where('id', '=', backupAccounts.id)
			.execute();
	}

	return res.status(200).json(`Backup follower removed`);
}

