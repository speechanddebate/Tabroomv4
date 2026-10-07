import { BadRequest, Forbidden, Unauthorized } from '../../../helpers/problem.js';
import personRepo from '../../../repos/personRepo.js';
import { db } from '../../../data/database.js';

export async function getProfile(req, res) {

	if (!req.person) {
		return Unauthorized(req, res, 'You have no active user session.  Zounds!');
	}
	let person;

	if (req.params.personId && req.person.site_admin) {
		person = await personRepo.getPerson(db, req.params.personId, { settings: true });

	} else if (req.params.personId ) {
		return Forbidden(req, res,'Only admin staff may access another profile');
	} else if (req.person) {
		person = await personRepo.getPerson(db, req.person.id, { settings: true });
	}

	if (!person) {
		return BadRequest(req, res, 'User does not exist');
	}

	return res.status(200).json(person);
}

export default getProfile;
