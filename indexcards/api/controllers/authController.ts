import { BadRequest, Unauthorized } from '../helpers/problem.js';
import authService, { AUTH_INVALID }  from '../services/AuthService.js';
import config from '../config.js';
import personRepo from '../repos/personRepo.js';
import sessionRepo from '../repos/sessionRepo.js';
import { ValidationError } from '../helpers/errors/errors.js';
import { LoginResponseSchema } from '@tabroom/types';
import type { Request, Response } from 'express';
import { db } from '../data/database.js';

export async function login(req: Request, res: Response) {
	const { username, password } = req.valid.body;
	let result;
	try {
		result = await authService.login(username, password, {
			ip: req.ip,
			agentData: req.get('User-Agent'),
		});
	}  catch (err) {
		if (err === AUTH_INVALID) return Unauthorized(req,res,'Invalid Credentials');
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

	if (req.session?.id) {
		await sessionRepo.deleteSession(db,req.session?.id);
	}

	// Clear cookie if present
	res.clearCookie(config.cookie.name,authService.getAuthCookieOptions());

	// Always return success
	res.status(204).send();
}
/** start an su session */
export async function su(req: Request, res: Response){
	if(!req.session?.Person){
		return BadRequest(req, res, 'You cannot start an su session without a valid session.');
	}
	const suTarget: {id: number} | null = await personRepo.getPerson(req.valid.body.suId) as {id: number} | null;
	if(!suTarget) return BadRequest(req, res, 'no such person found');

	if(!req.session?.id) {
		return BadRequest(req, res, 'You do not have an active session.');
	}
	await sessionRepo.updateSession(db,req.session.id,{
		person: suTarget.id,
		su: req.session.person,
	});
	return res.status(204).send();
}
/** end an su session */
export async function suEnd(req: Request, res: Response){
	if(!req.session?.id) {
		return BadRequest(req, res, 'You do not have an active session.');
	}
	else if(!req.session?.su){
		return BadRequest(req, res, 'You do not have an active su session.');
	}
	await sessionRepo.updateSession(db,req.session.id,{
		person: req.session.su,
		su: null,
	});
	return res.status(204).send();

}

export async function register(req: Request, res: Response){
	let result = null;
	try {
		result = await authService.register(req.valid.body,{
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
