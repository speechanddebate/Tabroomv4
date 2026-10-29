import axios from "axios";
import { sql } from "kysely";
import { createHash } from 'node:crypto';
import webPush from 'web-push';
import { db } from "../../../data/database.js";
import config from "../../../config.js";
import logger from '../../../helpers/logger.js';
import type { notifyResponse, NotificationRequest } from "../notify.js";

/**
 * Push service hosts a subscription endpoint may point at. A leading `*.`
 * matches any subdomain; other entries must match exactly. The send job POSTs
 * to whatever endpoint is stored, so anything else is refused.
 */
export const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'*.push.apple.com',
	'*.notify.windows.com',
] as const;

let vapid: { publicKey: string; fingerprint: string } | null = null;

/** Sets the VAPID keys web-push signs with. Leaves push unconfigured when the keys are missing or malformed */
export function initWebPush(): void {
	vapid = null;
	const { subject, publicKey, privateKey } = config.webpush;

	if (!subject || !publicKey || !privateKey) {
		logger.warn('Web push keys not present, web push will not work');
		return;
	}

	try {
		webPush.setVapidDetails(subject, publicKey, privateKey);
	} catch (err) {
		logger.warn('Web push keys are invalid, web push will not work', err);
		return;
	}

	vapid = { publicKey, fingerprint: fingerprintKey(publicKey) };
}

export function isPushConfigured(): boolean {
	return vapid !== null;
}

/** The VAPID public key browsers subscribe with, and a short fingerprint of it, or null when push is unconfigured */
export function getVapid(): { publicKey: string; fingerprint: string } | null {
	return vapid;
}

/** First 8 bytes of the SHA-256 of the key, as 16 lowercase hex characters */
function fingerprintKey(publicKey: string): string {
	return createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

/** Whether a push subscription endpoint points at an allowed push service over plain https */
export function checkPushHost(url: URL): boolean {
	if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return PUSH_HOSTS.some(allowed => allowed.startsWith('*.')
		? host.endsWith(allowed.slice(1))
		: host === allowed);
}

export async function sendWebPushNotification(notification: NotificationRequest): Promise<notifyResponse> {

	const recipients = await db.selectFrom('person')
		.innerJoin('session', 'person.id', 'session.person')
		.where('person.id', 'in', notification.ids)
		.where('session.push_notify', 'is not', null)
		.where('session.last_access', '>', sql<Date>`DATE_SUB(NOW(), INTERVAL 60 DAY)`)
		.select([
			'person.id',
			'person.first',
			'person.last',
			'person.no_email',
			'session.push_notify',
		])
		.execute();

	if (recipients.length < 1) {
		return {
			error   : false,
			message : `No web pushes active.`,
			email   : 0,
			inbox   : 0,
			web     : 0,
		};
	}

	let targetIds = recipients.map( (person) => {
		if (person.id === 1) {
			return '100';
		}
		return `${person.id}`;
	});

	// If you are not running in production either send it only to the UID
	// spec'd in config.js or to Palmer since let's be real that's almost
	// always who this is. If you mess with this code and do NOT set
	// TEST_USERID though, I will look for you. I will find you.  And I
	// will....

	// TODO: TEST_USERID is a string, so targetIds stops being an array here.
	if (process.env.NODE_ENV !== 'production'
		&& config.mail.server !== 'mail.in.speechanddebate.org'
	) {
		targetIds = process.env.TEST_USERID ? [process.env.TEST_USERID] : ['100'];
	}

	if (notification.append) {
		notification.text += `\n${notification.append}`;
	}

	const promises: Promise<unknown>[] = [];

	if (targetIds && targetIds.length > 0) {

		const msg = {
			app_id          : config.onesignal.appId,
			name            : notification.sender || 'Tournament Blast',
			url 		    : notification.url || 'https://www.tabroom.com/user/home.mhtml',
			contents        : { en: notification.text },
			headings        : { en: notification.subject || 'Message from Tab' },
			include_aliases: {
				external_id: targetIds,
			},
			target_channel  : 'push',
		};

		const webPromise = axios.post(
			`${config.onesignal.api_url}/notifications`,
			msg,
			{
				headers : {
					Authorization  : `Basic ${config.onesignal.appKey}`,
					'Content-Type' : 'application/json',
					Accept         : 'application/json',
				},
			},
		);

		promises.push(webPromise);

	}

	await Promise.all(promises);

	return {
		error   : false,
		message : `${targetIds ? targetIds.length : 0} web pushes sent.`,
		email   : 0,
		inbox   : 0,
		web     : targetIds.length,
	};
}
