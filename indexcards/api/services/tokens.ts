import { hkdfSync } from 'node:crypto';
import { SignJWT, errors, jwtVerify, type JWTPayload } from 'jose';
import config from '../config.js';
import logger from '../helpers/logger.js';

/**
 * Links that act without a login (unsubscribe, email confirmation) carry a signed token: an
 * HS256 JWT keyed from the secret shared with classic, so they need no extra config and no table.
 * The audience is the aud claim and also part of the key, so a token issued for one use can
 * never verify as another, even if a later audience forgets to check aud
 */
export type TokenAudience = 'unsubscribe' | 'confirm-email';

/** A token we issued, for the person it names */
export type VerifiedToken = { subject: number; claims: JWTPayload };

const ISSUER = 'tabroom';
const ALGORITHM = 'HS256';

let warnedEmptySecret = false;

function signingKey(audience: TokenAudience): Uint8Array {
	if (!config.shared_secret && !warnedEmptySecret) {
		warnedEmptySecret = true;
		logger.warn('shared_secret is empty, link tokens are signed with a key anyone can derive');
	}
	return new Uint8Array(hkdfSync('sha256', config.shared_secret, '', `tabroom ${audience}`, 32));
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A token naming a person, with the claims the audience needs, good for maxAge seconds */
export async function signToken(
	audience: TokenAudience,
	subject: number,
	claims: JWTPayload,
	maxAge: number,
	issuedAt = nowSeconds(),
): Promise<string> {
	return await new SignJWT(claims)
		.setProtectedHeader({ alg: ALGORITHM })
		.setSubject(String(subject))
		.setIssuer(ISSUER)
		.setAudience(audience)
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + maxAge)
		.sign(signingKey(audience));
}

/**
 * The person and claims of a token we issued for this audience. Expired is reported apart, so a
 * page can say the link is too old rather than broken; anything else (malformed, tampered,
 * another audience's) is null
 */
export async function verifyToken(audience: TokenAudience, token: string): Promise<VerifiedToken | { expired: true } | null> {
	let payload: JWTPayload;
	try {
		({ payload } = await jwtVerify(token, signingKey(audience), { algorithms: [ALGORITHM], issuer: ISSUER, audience }));
	} catch (error) {
		// jose checks the signature before the claims, so only a token we really issued reaches the expiry check
		return error instanceof errors.JWTExpired ? { expired: true } : null;
	}

	const subject = Number(payload.sub);
	if (!Number.isInteger(subject) || subject <= 0) return null;

	return { subject, claims: payload };
}
