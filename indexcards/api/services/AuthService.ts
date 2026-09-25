import personRepo from '../repos/personRepo.js';
import { verify, encrypt } from 'unixcrypt';
import crypto from 'crypto';
import config from '../config.js';
import sessionRepo from '../repos/sessionRepo.js';
import { ValidationError } from '../helpers/errors/errors.js';
import { db } from '../data/database.js';
import type { Person } from '../data/schema.js';
import type { CookieOptions } from 'express';
import type { Selectable } from 'kysely';
import type { RegisterRequest } from '@tabroom/types';

export async function login(username: string, password: string, context: { ip?: string; agentData?: string } = {}): Promise<{person: Selectable<Person> | null; token: string}> {
	const { ip, agentData } = context;
	const person = await personRepo.getPersonByUsername(db, username, { settings: ['banned'] });

	if (!person || !person?.id || !person?.password) {
		throw AUTH_INVALID;
	}

	if (person.settings?.banned) {
		throw FORBIDDEN;
	}
	const ok = verifyPassword(password, person.password);
	if (!ok) {
		throw AUTH_INVALID;
	}

	const { userkey } = await sessionRepo.createSession(db,{
		person  : person.id,
		ip        : ip,
		agent_data : agentData,
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

	const { userkey } = await sessionRepo.createSession(db,{
		person: Person.id,
		ip,
		agent_data: agentData,
	});
	return {personId: Person.id, token: userkey};
}

function generateCSRFToken(userkey: string){
	return crypto
        .createHmac('sha256',userkey)
        .digest('hex');
}

export const AUTH_INVALID = Symbol('AUTH_INVALID');
export const FORBIDDEN = Symbol('FORBIDDEN');

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
export function getCSRFCookieOptions(): CookieOptions {
	const secure = process.env.NODE_ENV === 'production';
	return {
		httpOnly : false,
		secure,
		sameSite : 'lax',
		domain   : config.cookie.domain,
		path     : '/',
	};
}

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
	getCSRFCookieOptions,
	generateCSRFToken,
};