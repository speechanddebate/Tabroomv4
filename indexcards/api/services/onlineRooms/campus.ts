// Helpers shared by every NSDA Campus room, ported from classic's funclib/online_room.mas

import { createHash } from 'node:crypto';
import { SignJWT, type JWTPayload } from 'jose';
import config from '../../config.js';
import logger from '../../helpers/logger.js';

// Time zones that go to the west coast Campus server. Every other zone goes to config.campus.defaultServer
const WEST_ZONES = new Set([
	'America/Adak',
	'America/Anchorage',
	'America/Boise',
	'America/Curacao',
	'America/Denver',
	'America/Edmonton',
	'America/El_Salvador',
	'America/Los_Angeles',
	'America/Managua',
	'America/Mexico_City',
	'America/Nome',
	'America/Phoenix',
	'America/Regina',
	'America/Santo_Domingo',
	'America/Sitka',
	'America/Tijuana',
	'America/Vancouver',
	'America/Winnipeg',
	'Asia/Seoul',
	'Asia/Shanghai',
	'Asia/Singapore',
	'Asia/Taipei',
	'Asia/Tokyo',
	'Pacific/Guam',
	'Pacific/Honolulu',
]);

/** How long a token is good for. It's used as soon as it's issued */
export const CAMPUS_TOKEN_TTL = '5m';

/** The Campus server a tournament's rooms run on. The tourn's campus_zone setting overrides its time zone */
export function campusServer(campusZone: string | null | undefined, tz: string | null | undefined): string {
	if (campusZone) return campusZone;
	if (tz && WEST_ZONES.has(tz)) return 'us-west-2';
	return config.campus.defaultServer;
}

/** The Campus room id. Classic's sha256_hex(a, b) hashes its arguments joined, so this matches its ids */
export function campusUuid(...parts: (string | number)[]): string {
	return createHash('sha256').update(parts.join('')).digest('hex').slice(0, 32);
}

/**
 * Sign the token a Campus room join posts to config.campus.uri. Matches classic's Crypt::JWT
 * encode_jwt call: an HS256 header with only alg, and the raw key bytes.
 * null when no Campus key is configured
 */
export async function signCampusToken(payload: JWTPayload): Promise<string | null> {
	if (!config.campus.key) {
		logger.error('Cannot join an NSDA Campus room: config.campus.key is not set');
		return null;
	}

	return await new SignJWT(payload)
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(CAMPUS_TOKEN_TTL)
		.sign(new TextEncoder().encode(config.campus.key));
}
