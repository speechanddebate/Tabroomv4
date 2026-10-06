import type { Request, Response, NextFunction } from 'express';
import config from '../../config.js';
import authService from '../../services/AuthService.js';
import { createActor } from './authorization.js';
import { Forbidden } from '../../helpers/problem.js';
import sessionRepo from '../../repos/sessionRepo.js';
import type { AuthInfo, AuthStrategy, SessionPerson } from './types.js';

/** authenticate with the session userkey in the TabroomToken cookie */
export const cookieStrategy: AuthStrategy = async (db, { cookies }) => {
	const userkey = cookies[config.cookie.name];
	if (!userkey) return { status: 'none' };

	const session = await sessionRepo.findByUserKey(db, userkey);
	if (!session) {
		//tell the browser to drop the stale cookie
		return { status: 'invalid', clearCookie: true };
	}

	if (session.Person.banned == '1') {
		await sessionRepo.deleteSession(db, session.id);
		return { status: 'forbidden', detail: 'User is banned' };
	}

	return {
		status: 'success',
		auth: {
			method: 'cookie',
			sessionId: session.id,
			su: session.Su,
		},
		person: session.Person,
	};
};

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
