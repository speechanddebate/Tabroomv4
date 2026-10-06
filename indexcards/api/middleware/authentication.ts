import type { Request, Response, NextFunction } from 'express';
import config from '../config.js';
import authService from '../services/AuthService.js';
import personRepo from '../repos/personRepo.js';
import { createActor } from './authorization/authorization.js';
import { Forbidden } from '../helpers/problem.js';

import { db } from '../data/database.js';
import sessionRepo from '../repos/sessionRepo.js';

export async function Authenticate(req: Request, res: Response, next: NextFunction) {

	let session = null;

	try {

		// COOKIE AUTHENTICATION
		const cookieName = config.cookie.name;
		const cookie = req.cookies[cookieName];

		if (cookie) {
			let cookieSession = await sessionRepo.findByUserKey(db,cookie);
			if (!cookieSession) {
				//must use the same options as when the cookie is set.
				res.clearCookie(cookieName, authService.getAuthCookieOptions());  //invalid cookie, clear it
			} else {
				session = cookieSession;
				req.authType = 'cookie';
			}
		}

		// TOKEN/API KEY AUTHENTICATION (Authorization header) goes here once keys are issued.
		// Until then all access goes through the frontend with the session cookie.

		if(session){
			if(session.Person?.banned == '1') {
				await sessionRepo.deleteSession(db, session.id);
				return Forbidden(req, res, 'User is banned');
			}
			req.session = {
				id       : session.id,
				person  : session.person,
				su       : session.su || null,
				Su: session.Su ?? null,
				Person   : session.Person ?? undefined
			};

			//deprecated, use req.actor for auth and req.session.Person for anything that MUST be done by a person
			req.person = await personRepo.getPerson(db,req.session.su ?? req.session.person ?? -1);
		}
		//req.actor is what should be checked for every authorization decision
		req.actor = createActor(req);
		next();

	} catch (err) {
		next(err);
	}
}
