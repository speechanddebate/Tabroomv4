import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import {
	UNSUBSCRIBE_TOKEN_MAX_AGE,
	maskEmail,
	matchesUnsubscribeToken,
	unsubscribeToken,
	verifyUnsubscribeToken,
} from './unsubscribe.js';

const person = { id: 4242, email: 'Coach@Example.com' };
const originalSecret = config.shared_secret;
const DAY = 24 * 60 * 60;

/**
 * The same token with one character of its signature changed. Not the last character: of its
 * 6 bits only the top 4 are signature, so A, B, C and D decode alike and swapping among them
 * leaves the signature valid. A character inside it always carries 6 real bits
 */
const tampered = (token: string) => {
	const at = token.lastIndexOf('.') + 5;
	return token.slice(0, at) + (token[at] === 'A' ? 'B' : 'A') + token.slice(at + 1);
};

beforeEach(() => {
	config.shared_secret = 'a secret shared with classic';
	vi.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
	config.shared_secret = originalSecret;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('unsubscribeToken', () => {
	it('is an HS256 JWT naming the person, their address, and when it was issued', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z') });
		const token = await unsubscribeToken(person);

		expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256' });
		expect(decodeJwt(token)).toEqual({
			sub: '4242',
			email: 'coach@example.com',
			iss: 'tabroom',
			aud: 'unsubscribe',
			iat: 1793361600,
			exp: 1793361600 + 365 * DAY,
		});
	});

	it('does not care about the case or spacing of the address', async () => {
		expect(await unsubscribeToken({ id: 4242, email: ' coach@example.com ' }, 1000)).toBe(await unsubscribeToken(person, 1000));
	});

	it('changes with the person, the address, the issue time, and the secret', async () => {
		const token = await unsubscribeToken(person, 1000);

		expect(await unsubscribeToken({ ...person, id: 4243 }, 1000)).not.toBe(token);
		expect(await unsubscribeToken({ ...person, email: 'other@example.com' }, 1000)).not.toBe(token);
		expect(await unsubscribeToken(person, 1001)).not.toBe(token);
		config.shared_secret = 'another secret';
		expect(await unsubscribeToken(person, 1000)).not.toBe(token);
	});

	it('still signs with an empty secret, and warns once', async () => {
		config.shared_secret = '';

		const token = await unsubscribeToken(person);
		await unsubscribeToken(person);

		expect(await verifyUnsubscribeToken(token)).toEqual({ id: 4242, email: 'coach@example.com' });
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('shared_secret is empty'));
	});
});

describe('verifyUnsubscribeToken', () => {
	it('returns the claims of a token we issued', async () => {
		expect(await verifyUnsubscribeToken(await unsubscribeToken(person))).toEqual({ id: 4242, email: 'coach@example.com' });
	});

	it.each([
		['nothing', ''],
		['not a JWT', 'abc.def'],
		['a JWT with no signature', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiI0MjQyIn0.'],
		['garbage', 'x'.repeat(200)],
	])('rejects %s without throwing', async (_label, token) => {
		expect(await verifyUnsubscribeToken(token)).toBeNull();
	});

	it('rejects a tampered signature', async () => {
		expect(await verifyUnsubscribeToken(tampered(await unsubscribeToken(person)))).toBeNull();
	});

	it('rejects a token signed with another secret', async () => {
		const token = await unsubscribeToken(person);
		config.shared_secret = 'rotated';

		expect(await verifyUnsubscribeToken(token)).toBeNull();
	});

	it('works for a year and not after', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z') });
		const token = await unsubscribeToken(person);

		vi.setSystemTime(new Date('2027-10-29T12:00:00Z'));
		expect(await verifyUnsubscribeToken(token)).not.toBeNull();

		vi.setSystemTime(new Date('2027-10-30T12:00:01Z'));
		expect(await verifyUnsubscribeToken(token)).toBeNull();
	});

	it('sets the limit at a year', () => {
		expect(UNSUBSCRIBE_TOKEN_MAX_AGE).toBe(365 * DAY);
	});
});

describe('matchesUnsubscribeToken', () => {
	const claims = { id: 4242, email: 'coach@example.com' };

	it('accepts the person the token names at the address it was issued to', () => {
		expect(matchesUnsubscribeToken(person, claims)).toBe(true);
		expect(matchesUnsubscribeToken({ id: 4242, email: ' COACH@example.com ' }, claims)).toBe(true);
	});

	it('rejects another person or a changed address', () => {
		expect(matchesUnsubscribeToken({ ...person, id: 1 }, claims)).toBe(false);
		expect(matchesUnsubscribeToken({ ...person, email: 'new@example.com' }, claims)).toBe(false);
	});
});

describe('maskEmail', () => {
	it.each([
		['coach@example.com', 'c***@example.com'],
		['a@b.co', 'a***@b.co'],
		['nonsense', '***'],
		['@example.com', '***'],
		['', '***'],
	])('masks %s as %s', (email, masked) => {
		expect(maskEmail(email)).toBe(masked);
	});
});
