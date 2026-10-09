import { NotImplemented } from '../../../helpers/problem.js';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/index.js';
// General CRUD for the section itself

export async function updateSectionGET(req, res) {
	const section = await summon(kdb, 'panel',req.params.sectionId);
	res.status(200).json(section);
}

// This will not create a section because the section ID is already encoded
// here.  So instead just update the existing section. Never worked: it called
// update() on a plain object.

export async function updateSection(req, res) {
	return NotImplemented(req, res, 'Updating a section is not yet implemented');
}

// Never worked: the legacy code referenced a section model that does not exist.
export async function deleteSection(req, res) {
	return NotImplemented(req, res, 'Deleting a section is not yet implemented');
}

// No default export; use named exports
