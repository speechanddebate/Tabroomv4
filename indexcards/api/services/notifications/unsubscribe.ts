import { hkdfSync } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import config from '../../config.js';
import logger from '../../helpers/logger.js';

/**
 * Unsubscribe links carry a per-person token so that following one, or a mail provider
 * POSTing it (RFC 8058 one-click), opts that person out without a login. The token is an
 * HS256 JWT naming the person and their address: no table, it stops working if the
 * address changes, and it expires after a year. All it can do is set no_email, so it
 * is kept valid for as long as an email plausibly sits in an inbox: a dead unsubscribe
 * link gets the spam button pressed instead, which costs more than an opt-out
 */

export type UnsubscribePerson = { id: number; email: string };

/** What a verified token says: who it is for and the address it was issued to */
export type UnsubscribeClaims = { id: number; email: string };

/** How long a link works, in seconds */
export const UNSUBSCRIBE_TOKEN_MAX_AGE = 365 * 24 * 60 * 60;

const ISSUER = 'tabroom';
/** The audience claim ties a token to this one use, so a token issued for another purpose can't opt someone out */
const AUDIENCE = 'unsubscribe';
const ALGORITHM = 'HS256';

let warnedEmptySecret = false;

/** The signing key, derived from the secret shared with classic so no extra config is needed */
function signingKey(): Uint8Array {
	if (!config.shared_secret && !warnedEmptySecret) {
		warnedEmptySecret = true;
		logger.warn('shared_secret is empty, unsubscribe tokens are signed with a key anyone can derive');
	}
	return new Uint8Array(hkdfSync('sha256', config.shared_secret, '', 'tabroom unsubscribe', 32));
}

const normalize = (email: string) => email.trim().toLowerCase();
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The token for a person's unsubscribe link */
export async function unsubscribeToken(person: UnsubscribePerson, issuedAt = nowSeconds()): Promise<string> {
	return await new SignJWT({ email: normalize(person.email) })
		.setProtectedHeader({ alg: ALGORITHM })
		.setSubject(String(person.id))
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + UNSUBSCRIBE_TOKEN_MAX_AGE)
		.sign(signingKey());
}

/** The claims of a token we issued that is still in date, or null for anything else: malformed, tampered, expired, or for another purpose */
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribeClaims | null> {
	let payload;
	try {
		({ payload } = await jwtVerify(token, signingKey(), { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE }));
	} catch {
		return null;
	}

	const id = Number(payload.sub);
	if (!Number.isInteger(id) || id <= 0 || typeof payload.email !== 'string') return null;

	return { id, email: payload.email };
}

/** Whether the token was issued to the address this person has now; a changed address retires every earlier link */
export function matchesUnsubscribeToken(person: UnsubscribePerson, claims: UnsubscribeClaims): boolean {
	return person.id === claims.id && normalize(person.email) === claims.email;
}

/** An address shown back to whoever holds the link: first letter, stars, and the domain */
export function maskEmail(email: string): string {
	const at = email.indexOf('@');
	if (at < 1) return '***';
	return `${email[0]}***${email.slice(at)}`;
}
