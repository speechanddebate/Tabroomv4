import { NotImplemented } from '../../../../helpers/problem.js';
import type { Response } from 'express';
import type { ValidatedRequest } from '../../../../middleware/validation.js';

// Returns the BallotContext: everything needed to render this judge's ballot
// for this panel.
export async function getBallotContext(req: ValidatedRequest, res: Response) {
	return NotImplemented(req, res);
}
