import type { Request, Response, NextFunction } from 'express';
import config from '../config.js';
import authService from '../services/AuthService.js';
import { createActor } from './authorization/authorization.js';
import { Forbidden } from '../helpers/problem.js';
import { cookieStrategy } from './auth/strategies/cookie.js';
import type { AuthInfo, AuthStrategy, SessionPerson } from './auth/types.js';

// tried in order, the first strategy that finds credentials decides the request.
// token/api key auth (Authorization header) goes here once keys are issued.
const strategies: AuthStrategy[] = [cookieStrategy];

const anonymous: AuthInfo = { method: 'none', sessionId: null, su: null };

export async function Authenticate(req: Request, res: Response, next: NextFunction) {
	try {
		let auth = anonymous;
		let person: SessionPerson | null = null;

		for (const strategy of strategies) {
			const result = await strategy(req.db, { cookies: req.cookies ?? {}, headers: req.headers });
			if (result.status === 'none') continue;

			if (result.status === 'forbidden') {
				return Forbidden(req, res, result.detail);
			}
			if (result.status === 'invalid') {
				if (result.clearCookie) {
					//must use the same options as when the cookie is set.
					res.clearCookie(config.cookie.name, authService.getAuthCookieOptions());
				}
				break;
			}
			auth = result.auth;
			person = result.person;
			break;
		}

		req.auth = auth;
		req.person = person;

		//req.actor is what should be checked for every authorization decision
		req.actor = createActor(req.db, person);
		next();

	} catch (err) {
		next(err);
	}
}
