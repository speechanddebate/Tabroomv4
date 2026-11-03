import { createHash } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { campusServer, campusUuid, signCampusToken } from './campus.js';

describe('campusServer', () => {
	it('sends west coast and Asia-Pacific zones to us-west-2', () => {
		expect(campusServer(null, 'America/Los_Angeles')).toBe('us-west-2');
		expect(campusServer(null, 'Asia/Tokyo')).toBe('us-west-2');
	});

	it('sends every other zone to the configured default server', () => {
		expect(campusServer(null, 'America/Chicago')).toBe('us-east-2');
		expect(campusServer(null, null)).toBe('us-east-2');
	});
	it('uses the tourn campus_zone over the time zone', () => {
		expect(campusServer('eu-central-1', 'America/Los_Angeles')).toBe('eu-central-1');
	});
});

describe('campusUuid', () => {
	it('is the first 32 hex chars of the sha256 of its parts joined', () => {
		const expected = createHash('sha256').update('123A').digest('hex').slice(0, 32);

		expect(campusUuid(123, 'A')).toBe(expected);
		expect(campusUuid(123, 'A')).toHaveLength(32);
	});
});

describe('signCampusToken', () => {
	const originalKey = config.campus.key;

	afterEach(() => {
		config.campus.key = originalKey;
	});

	it('signs an HS256 token with the payload and a five minute expiry', async () => {
		config.campus.key = 'test-campus-key';

		const token = await signCampusToken({ uuid: 'abc', role: 'judge' });

		expect(token).not.toBeNull();
		expect(decodeProtectedHeader(token!)).toEqual({ alg: 'HS256' });

		const { payload } = await jwtVerify(token!, new TextEncoder().encode('test-campus-key'));
		expect(payload.uuid).toBe('abc');
		expect(payload.role).toBe('judge');
		expect(payload.exp! - payload.iat!).toBe(300);
	});

	it.each([undefined, ''])('returns null and logs an error when the key is %j', async (key) => {
		config.campus.key = key;
		const error = vi.spyOn(logger, 'error');

		const token = await signCampusToken({ uuid: 'abc' });

		expect(token).toBeNull();
		expect(error).toHaveBeenCalledWith('Cannot join an NSDA Campus room: config.campus.key is not set');
		error.mockRestore();
	});
});
