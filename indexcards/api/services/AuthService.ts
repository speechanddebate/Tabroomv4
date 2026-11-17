import personRepo from '../repos/personRepo.js';
import crypto from 'crypto';
import { verify, encrypt } from 'unixcrypt';
import config from '../config.js';
import sessionRepo from '../repos/sessionRepo.js';
import { ValidationError } from '../helpers/errors/errors.js';
import { parseUserAgent } from '../helpers/userAgent.js';
import logger from '../helpers/logger.js';
import { sendConfirmation } from './profile/emailConfirm.js';
import { db } from '../data/database.js';
import type { Person } from '../data/schema.js';
import type { CookieOptions } from 'express';
import type { Selectable } from 'kysely';
import type { RegisterRequest } from '@tabroom/types';

export async function login(username: string, password: string, context: { ip?: string; agentData?: string } = {}): Promise<{person: Selectable<Person> | null; token: string}> {
	const { ip, agentData } = context;
	const person = await personRepo.getPersonByUsername(db, username, { settings: ['banned'] });

	if (!person || !person?.id || !person?.password) {
		// costs the same hash as a wrong password, so response time doesn't reveal which accounts exist
		verifyPassword(password, DUMMY_HASH);
		throw AUTH_INVALID;
	}

	if (isBanned(person.settings?.banned)) {
		throw FORBIDDEN;
	}
	const ok = verifyPassword(password, person.password);
	if (!ok) {
		throw AUTH_INVALID;
	}

	const { userkey } = await sessionRepo.createSession(db,{
		person  : person.id,
		ip        : ip,
		agent_data : agentData ? JSON.stringify(parseUserAgent(agentData)) : null,
	});
	//TODO enforce limits

	return {person,token: userkey};
}

export async function register(userData: RegisterRequest, context: { ip?: string; agentData?: string } = {}) {
	const { ip, agentData } = context;
	//ensure email is not already in use
	if(userData.email && await personRepo.getPersonByUsername(db,userData.email)){
		throw new ValidationError('Email already in use');
	}
	if(!userData.password) throw new ValidationError('Password is required');

	const newPersonData = {
		email      : userData.email,
		password   : hashPassword(userData.password),
		first  : userData.first,
		last   : userData.last,
		state      : userData.state,
		country    : userData.country,
		tz         : userData.tz,
	};
	const Person = await personRepo.createPerson(db,newPersonData);

	if (!Person?.id) {
		throw new Error('Failed to create user');
	}

	// A new account starts unconfirmed, as on classic; it is made even if the code can't be queued, since resend is there
	try {
		await sendConfirmation(db, { id: Person.id, email: Person.email });
	} catch (error) {
		logger.warn(`Confirmation email for new person ${Person.id} failed: ${error instanceof Error ? error.message : String(error)}`);
	}

	const { userkey } = await sessionRepo.createSession(db,{
		person: Person.id,
		ip,
		agent_data: agentData ? JSON.stringify(parseUserAgent(agentData)) : null,
	});
	return {personId: Person.id, token: userkey};
}

export type PasswordChangeOutcome = 'changed' | 'notFound' | 'wrongPassword' | 'sameAsCurrent' | 'bannedWord' | 'isEmailOrName';

// Classic's list: the words a speech and debate password is most often built on
const BANNED_PASSWORD_WORDS = ['debate', 'speech', 'forensics', 'congress', 'mocktrial', 'extemp', 'oratory', 'interp'];

/**
 * Replaces a person's password, whose form the request schema has already checked. Here go the
 * rules for what a password may be: the current one is right, and the new one differs from it,
 * holds no banned word, and isn't the person's email or name. A change ends their other sessions, lifts a required
 * password change, and retires any reset link. Stored as classic stores it, so the password logs
 * in on both sites
 */
export async function changePassword(
	personId: number,
	sessionId: number | null,
	currentPassword: string,
	newPassword: string,
): Promise<PasswordChangeOutcome> {
	const person = await personRepo.getPerson(db, personId);
	if (!person) return 'notFound';

	// An account with no password sets its first one through "forgot password", which proves the
	// inbox is theirs. A login by one-time code doesn't stand in for the current password
	if (!person.password || !verifyPassword(currentPassword, person.password)) return 'wrongPassword';

	if (newPassword === currentPassword) return 'sameAsCurrent';
	const candidate = newPassword.toLowerCase();
	if (BANNED_PASSWORD_WORDS.some(word => candidate.includes(word))) return 'bannedWord';
	const taken = [person.email, [person.first, person.last].filter(Boolean).join(' ')].map(value => value.trim().toLowerCase());
	if (taken.includes(candidate)) return 'isEmailOrName';

	await personRepo.updatePerson(db, personId, {
		password: hashPassword(newPassword),
		pass_timestamp: new Date(),
		settings: { force_password_change: null, pass_change_expires: null, pass_changekey: null },
	});
	await sessionRepo.deleteSessions(db, personId, { except: sessionId ?? undefined });

	return 'changed';
}

export const AUTH_INVALID = Symbol('AUTH_INVALID');
export const FORBIDDEN = Symbol('FORBIDDEN');

const DUMMY_HASH = encrypt(crypto.randomBytes(16).toString('hex'));

/** The value of a person's banned setting. Classic writes '1'; an empty or '0' value is not a ban */
export function isBanned(value: string | null | undefined) {
	return !!value && value !== '0';
}

export function getAuthCookieOptions(): CookieOptions {
	const secure = process.env.NODE_ENV === 'production';
	return {
		httpOnly: true,
		secure,
		sameSite : 'lax',
		domain   : config.cookie.domain,
		path     : '/',
	};
};
export function hashPassword(password: string) {
	return encrypt(password);
}
export function verifyPassword(password: string, hashed: string) {
	return verify(password, hashed);
}

export default {
	login,
	register,
	getAuthCookieOptions,
};