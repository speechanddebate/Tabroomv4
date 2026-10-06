import config from '../../../config.js';
import sessionRepo from '../../../repos/sessionRepo.js';
import type { AuthStrategy } from '../types.js';

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
