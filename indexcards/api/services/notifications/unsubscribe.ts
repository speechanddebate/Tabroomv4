import config from '../../config.js';
import { signToken, verifyToken } from '../tokens.js';

/**
 * Unsubscribe links carry a per-person token so that following one, or a mail provider
 * POSTing it (RFC 8058 one-click), opts that person out without a login. The token (see
 * tokens.ts) names the person and their address: it stops working if the address changes,
 * and it expires after a year. All it can do is set no_email, so it is kept valid for as
 * long as an email plausibly sits in an inbox: a dead unsubscribe link gets the spam button
 * pressed instead, which costs more than an opt-out
 */

export type UnsubscribePerson = { id: number; email: string };

/** What a verified token says: who it is for and the address it was issued to */
export type UnsubscribeClaims = { id: number; email: string };

/** How long a link works, in seconds */
export const UNSUBSCRIBE_TOKEN_MAX_AGE = 365 * 24 * 60 * 60;

const normalize = (email: string) => email.trim().toLowerCase();

/** The token for a person's unsubscribe link */
export async function unsubscribeToken(person: UnsubscribePerson, issuedAt?: number): Promise<string> {
	return await signToken('unsubscribe', person.id, { email: normalize(person.email) }, UNSUBSCRIBE_TOKEN_MAX_AGE, issuedAt);
}

/** The schemats page with the unsubscribe button, for the email footer and for browsers that open the API link */
export function unsubscribePageUrl(token: string): string {
	return `${config.schemats_url}/unsubscribe/${encodeURIComponent(token)}`;
}

/**
 * The claims of a token we issued that is still in date, or null for anything else: malformed,
 * tampered, expired, or for another audience. An old link isn't worth telling apart, since the
 * page can only offer the same thing either way
 */
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribeClaims | null> {
	const verified = await verifyToken('unsubscribe', token);
	if (!verified || !('subject' in verified) || typeof verified.claims.email !== 'string') return null;

	return { id: verified.subject, email: verified.claims.email };
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
