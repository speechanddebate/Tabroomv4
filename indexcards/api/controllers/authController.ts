import { BadRequest, Unauthorized, Forbidden } from '../helpers/problem.js';
import authService, { AUTH_INVALID, FORBIDDEN }  from '../services/AuthService.js';
import config from '../config.js';
import personRepo from '../repos/personRepo.js';
import sessionRepo from '../repos/sessionRepo.js';
import { ValidationError } from '../helpers/errors/errors.js';
import { LoginResponseSchema } from '@tabroom/types';
import type { Request, Response } from 'express';
import { db } from '../data/database.js';

export async function login(req: Request, res: Response) {
	const { username, password } = req.body;
	let result;
	try {
		result = await authService.login(username, password, {
			ip: req.ip,
			agentData: req.get('User-Agent'),
		});
	}  catch (err) {
		if (err === AUTH_INVALID) return Unauthorized(req,res,'Invalid Credentials');
		if (err === FORBIDDEN) return Forbidden(req, res, 'Access forbidden');
		throw err;
	}

	const { person, token } = result;
	const validatedResponse = LoginResponseSchema.parse({
		token: token,
		Person: { //should conform to personSchema
			id: person?.id,
			email: person?.email,
		},
	});
	res.cookie(config.cookie.name, token, authService.getAuthCookieOptions());
	return res.json(validatedResponse);
};

export async function logout(req: Request, res: Response){

	if (req.auth.sessionId) {
		await sessionRepo.deleteSession(db,req.auth.sessionId);
	}

	// Clear cookie if present
	res.clearCookie(config.cookie.name,authService.getAuthCookieOptions());

	// Always return success
	res.status(204).send();
}
/** start an su session */
export async function su(req: Request, res: Response){
	const sessionId = req.auth.sessionId;
	if(!sessionId || !req.person) {
		return BadRequest(req, res, 'You do not have an active session.');
	}
	const suTarget = (await personRepo.getPerson(db,req.body.suId));
	if(!suTarget) return BadRequest(req, res, 'no such person found');

	if(req.person.id === suTarget.id) return BadRequest(req, res, 'You cannot su to yourself');

	await sessionRepo.updateSession(db,sessionId,{
		person: suTarget.id,
		su: req.person.id,
	});
	return res.status(204).send();
}
/** end an su session */
export async function suEnd(req: Request, res: Response){
	const sessionId = req.auth.sessionId;
	if(!sessionId) {
		return BadRequest(req, res, 'You do not have an active session.');
	}
	else if(!req.auth.su){
		return BadRequest(req, res, 'You do not have an active su session.');
	}
	await sessionRepo.updateSession(db,sessionId,{
		person: req.auth.su.id,
		su: null,
	});
	return res.status(204).send();

}

export async function register(req: Request, res: Response){
	let result = null;
	try {
		result = await authService.register(req.body,{
			ip: req.ip,
			agentData: req.get('User-Agent'),
		});
	} catch (err) {
		if (err instanceof ValidationError) return BadRequest(req, res, err.message);
		throw err;
	}
	const { personId, token } = result;

	const response = {
		token: token,
		personId: personId,
	};
	res.cookie(config.cookie.name, token, authService.getAuthCookieOptions());
	return res.json(response);
}
