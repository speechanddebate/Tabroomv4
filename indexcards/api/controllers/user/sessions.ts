import { NotFound } from '../../helpers/problem.js';
import sessionRepo from '../../repos/sessionRepo.js';
import { db } from '../../data/database.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { getVapid } from '../../services/notifications/channels/webpush.js';

import type { Request, Response } from 'express';
import type { UserSession } from '@tabroom/types';

/** The current session: its id and the person it belongs to, plus the su admin while su'd */
export const getSession = async (req: Request, res: Response) => {
	if (req.person) {
		return res.status(200).json({
			id     : req.auth.sessionId,
			person : req.person.id,
			su     : req.auth.su?.id ?? null,
			Su     : req.auth.su,
			Person : req.person,
		});
	}
	return NotFound(req, res, 'You have no active user session.');
};

/** The host name of a stored push endpoint, or null if it doesn't parse */
function endpointHost(endpoint: string): string | null {
	try {
		return new URL(endpoint).hostname;
	} catch {
		return null;
	}
}

/**
 * The person's own logins with their push status. Read only, so it is allowed while su'd and
 * lists the su target's sessions. Only the push service host is returned, never the endpoint
 * or keys. When push isn't configured there is no current key, so nothing reads as subscribed
 */
export const getSessions = async (req: Request, res: Response) => {
	const person = getPerson(req);
	const fingerprint = getVapid()?.fingerprint ?? null;

	const rows = await sessionRepo.getSessions(db, person.id);
	const sessions: UserSession[] = rows.map(row => {
		const endpoint = fingerprint && row.push_vapid_key === fingerprint ? row.push_endpoint : null;
		return {
			id: row.id,
			current: row.id === req.auth.sessionId,
			subscribed: Boolean(endpoint),
			disabled: Boolean(row.push_disabled),
			host: endpoint ? endpointHost(endpoint) : null,
			agent: row.agent_data,
			ip: row.ip,
			last_access: row.last_access?.toISOString() ?? null,
			created_at: row.created_at?.toISOString() ?? null,
		};
	});

	return res.status(200).json(sessions);
};
