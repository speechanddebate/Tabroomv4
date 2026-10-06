import { NotFound } from '../../../helpers/problem.js';

export async function getSession(req, res) {
	if(req.person) {
		return res.status(200).json({
			id     : req.auth.sessionId,
			person : req.person.id,
			su     : req.auth.su?.id ?? null,
			Su     : req.auth.su,
			Person : req.person,
		});
	}
	return NotFound(req,res, 'You have no active user session.');
}
