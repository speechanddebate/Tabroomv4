import { BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable } from '../../helpers/problem.js';
import sessionRepo from '../../repos/sessionRepo.js';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { checkPushHost, getVapid } from '../../services/notifications/channels/webpush.js';

import type { Request, Response } from 'express';
import type { PushStatus, PushSubscribeRequest } from '@tabroom/types';
import type { ValidatedRequest } from '../../middleware/validation.js';

const UNAVAILABLE = 'Push notifications are not configured on this server';
const SU_FORBIDDEN = 'Push notifications can\'t be changed while su\'d';
const NO_SESSION = 'Push notifications require a login session';

/** The current session's push status. endpoint is null when it was saved under another VAPID key */
async function readStatus(sessionId: number, vapid: { publicKey: string; fingerprint: string }): Promise<PushStatus> {
	const row = await sessionRepo.getPushStatus(db, sessionId);
	return {
		publicKey: vapid.publicKey,
		endpoint: row?.push_endpoint && row.push_vapid_key === vapid.fingerprint ? row.push_endpoint : null,
		disabled: Boolean(row?.push_disabled),
	};
}

export const getPushStatus = async (req: Request, res: Response) => {
	const vapid = getVapid();
	if (!vapid) return ServiceUnavailable(req, res, UNAVAILABLE);

	const sessionId = req.auth.sessionId;
	if (!sessionId) return Forbidden(req, res, NO_SESSION);

	return res.status(200).json(await readStatus(sessionId, vapid));
};

export const savePushSubscription = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const vapid = getVapid();
	if (!vapid) return ServiceUnavailable(req, res, UNAVAILABLE);
	if (req.auth.su) return Forbidden(req, res, SU_FORBIDDEN);

	const sessionId = req.auth.sessionId;
	if (!sessionId) return Forbidden(req, res, NO_SESSION);

	const { subscription, replaces, enable } = req.body as PushSubscribeRequest;

	const url = new URL(subscription.endpoint);
	if (!checkPushHost(url)) {
		logger.warn(`Rejected push subscription from person ${person.id} for unlisted host ${url.hostname}`);
		return BadRequest(req, res, 'The push endpoint is not on an allowed push service');
	}

	// an uncompressed P-256 point: 0x04 then the 32 byte x and y coordinates
	const p256dh = Buffer.from(subscription.keys.p256dh, 'base64url');
	if (p256dh.length !== 65 || p256dh[0] !== 0x04) {
		return BadRequest(req, res, 'The p256dh key is not an uncompressed P-256 public key');
	}

	const current = await sessionRepo.getPushStatus(db, sessionId);
	if (current?.push_disabled && enable !== true) {
		return Conflict(req, res, 'Push notifications are turned off for this login');
	}

	await sessionRepo.setPushSubscription(db, sessionId, person.id, {
		endpoint: url.href,
		p256dh: subscription.keys.p256dh,
		auth: subscription.keys.auth,
		vapidKey: vapid.fingerprint,
		...(replaces ? { replaces: new URL(replaces).href } : {}),
		enable: enable === true,
	});

	return res.status(200).json(await readStatus(sessionId, vapid));
};

export const disablePush = async (req: Request, res: Response) => {
	if (req.auth.su) return Forbidden(req, res, SU_FORBIDDEN);

	const sessionId = req.auth.sessionId;
	if (!sessionId) return Forbidden(req, res, NO_SESSION);

	await sessionRepo.clearPushSubscription(db, sessionId, { disable: true });
	return res.status(204).end();
};

export const disableSessionPush = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	if (req.auth.su) return Forbidden(req, res, SU_FORBIDDEN);

	const sessionId: number = req.params.session;
	const target = await sessionRepo.getPushStatus(db, sessionId);
	if (!target || target.person !== person.id) {
		return NotFound(req, res, 'Session not found');
	}

	await sessionRepo.clearPushSubscription(db, sessionId, { disable: true });
	return res.status(204).end();
};
