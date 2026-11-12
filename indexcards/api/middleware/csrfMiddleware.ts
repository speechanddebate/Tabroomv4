import config from '../config.js';
import { Forbidden } from '../helpers/problem.js';
import type { Request, Response, NextFunction } from 'express';

export default async function csrfMiddleware(req: Request, res: Response, next: NextFunction){
	//only cookies are sent automatically by the browser, so only they need CSRF protection
	if(req.auth?.method !== 'cookie'){
		return next();
	}
	// Skip safe methods
	if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
		return next();
	}

	//validate csrf
	const origin = req.headers['origin'];
	if(origin && config.csrf.trusted_origins.includes(origin)){
		return next();
	}
	Forbidden(req,res,'request failed Origin validation');
}
