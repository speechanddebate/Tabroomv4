import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { decodeJwt } from 'jose';
import config from '../config.js';
import logger from '../helpers/logger.js';
import { signToken, verifyToken } from './tokens.js';

const original = { shared_secret: config.shared_secret };
const SECRET = 'a secret shared with classic';
const DAY = 24 * 60 * 60;

beforeAll(() => {
	Object.assign(config, { shared_secret: SECRET });
});

afterAll(() => {
	Object.assign(config, original);
});

beforeEach(() => {
	vi.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
	Object.assign(config, { shared_secret: SECRET });
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('signToken', () => {
	it('names the person, the audience, and the claims, and expires after maxAge', async () => {
		const token = await signToken('confirm-email', 4242, { email: 'coach@example.com', code: 'ABC234' }, 7 * DAY, 1000);

		expect(decodeJwt(token)).toEqual({
			sub: '4242',
			email: 'coach@example.com',
			code: 'ABC234',
			iss: 'tabroom',
			aud: 'confirm-email',
			iat: 1000,
			exp: 1000 + 7 * DAY,
		});
	});

	it('still signs with an empty secret, and warns once', async () => {
		Object.assign(config, { shared_secret: '' });

		const token = await signToken('confirm-email', 4242, {}, DAY);
		await signToken('unsubscribe', 4242, {}, DAY);

		expect(await verifyToken('confirm-email', token)).toMatchObject({ subject: 4242 });
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('shared_secret is empty'));
	});
});

describe('verifyToken', () => {
	it('returns the person and claims of a token we issued', async () => {
		const token = await signToken('confirm-email', 4242, { code: 'ABC234' }, DAY);

		expect(await verifyToken('confirm-email', token)).toEqual({
			subject: 4242,
			claims: expect.objectContaining({ code: 'ABC234', aud: 'confirm-email' }),
		});
	});

	it('rejects a token issued for another audience', async () => {
		const unsubscribe = await signToken('unsubscribe', 4242, { email: 'coach@example.com' }, DAY);

		expect(await verifyToken('confirm-email', unsubscribe)).toBeNull();
	});

	it('reports a genuine token past its age as expired', async () => {
		vi.useFakeTimers({ now: new Date('2026-11-16T12:00:00Z') });
		const token = await signToken('confirm-email', 4242, {}, 7 * DAY);

		vi.setSystemTime(new Date('2026-11-23T11:59:59Z'));
		expect(await verifyToken('confirm-email', token)).toMatchObject({ subject: 4242 });

		// jose counts the exp second itself as past
		vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
		expect(await verifyToken('confirm-email', token)).toEqual({ expired: true });
	});

	it('never calls an expired token from another audience or secret expired', async () => {
		vi.useFakeTimers({ now: new Date('2026-11-16T12:00:00Z') });
		const otherAudience = await signToken('unsubscribe', 4242, {}, DAY);
		Object.assign(config, { shared_secret: 'another secret' });
		const otherSecret = await signToken('confirm-email', 4242, {}, DAY);
		Object.assign(config, { shared_secret: SECRET });

		vi.setSystemTime(new Date('2026-12-16T12:00:00Z'));
		expect(await verifyToken('confirm-email', otherAudience)).toBeNull();
		expect(await verifyToken('confirm-email', otherSecret)).toBeNull();
	});

	it.each([
		['nothing', ''],
		['not a JWT', 'abc.def'],
		['a JWT with no signature', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiI0MjQyIn0.'],
	])('rejects %s without throwing', async (_label, token) => {
		expect(await verifyToken('confirm-email', token)).toBeNull();
	});

	it('rejects a token whose subject isn\'t a person id', async () => {
		const token = await signToken('confirm-email', 0, {}, DAY);

		expect(await verifyToken('confirm-email', token)).toBeNull();
	});
});
