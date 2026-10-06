// Updates the NSDA Learn course status for a category's worth of judges.
import { syncLearnResults } from '../../../helpers/nsda.js';
import { db } from '../../../data/database.js';
import { BadRequest } from '../../../helpers/problem.js';
import type { Request, Response } from 'express';

// Update NSDA Learn course status for a category's judges
export async function updateCategoryLearn(req: Request, res: Response) {
	const catId = Number(req.params.categoryId);
	if (isNaN(catId)) {
		return BadRequest(req, res, `Invalid category ID: ${req.params.categoryId}`);
	}
	const judges = await db.selectFrom('judge')
		.innerJoin('person', 'person.id', 'judge.person')
		.where('judge.category', '=', catId)
		.select([
			'judge.id as judgeId',
			'judge.person as id',
			'judge.first',
			'judge.last',
			'person.nsda',
			'person.email'
		])
		.execute();

	const promises = [];
	judges.forEach((judge) => {
		const promise = syncLearnResults(judge);
		promises.push(promise);
	});

	return res.status(200).json(`Updated all ${judges.length} judge NSDA Learn status`);
}
