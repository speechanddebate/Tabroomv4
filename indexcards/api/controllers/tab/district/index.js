import { NotImplemented, UnexpectedError } from '../../../helpers/problem.js';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';

// General CRUD for the district itself
// Get district (read)
export async function getDistrict(req, res) {
	const district = await summon(kdb, 'district',req.params.districtId);
	res.status(200).json(district);
}

// Update district (update). Never worked: it called update() on a plain object.
export async function updateDistrict(req, res) {
	return NotImplemented(req, res, 'Updating a district is not yet implemented');
}

// Delete district
export async function deleteDistrict(req, res) {
	try {
		await kdb.deleteFrom('district')
			.where('id', '=', req.params.districtId)
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	res.status(200).json({
		error: false,
		message: 'District deleted',
	});
}
