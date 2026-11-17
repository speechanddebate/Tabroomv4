import crypto from 'node:crypto';
import config from '../../config.js';
import type { Database } from '../../data/database.js';
import personRepo from '../../repos/personRepo.js';
import { sqlDatetime } from '../home/homeRules.js';
import { notify } from '../notifications/notify.js';
import { confirmEmail } from '../notifications/templates/account/confirmEmail.js';
import { maskEmail } from '../notifications/unsubscribe.js';
import { signToken, verifyToken } from '../tokens.js';

/**
 * Email confirmation, shared with classic: the 6-character code in person setting
 * email_confirmation_key is the source of truth, and email_unconfirmed and no_email=1 hold
 * until it is entered. Classic writes and checks the same settings, so a code from either site
 * works on both. The email link carries a token wrapping the code (tokens.ts), so it confirms
 * without a login and stops working once a newer code or another address replaces it.
 * Codes and links last 7 days here; classic's confirm.mhtml accepts any age until it is retired
 */

/** Ambiguous characters (0 O 1 I) left out; classic's codes, which remap them, fall inside it */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
/** How long a code and its link work, in seconds */
export const CONFIRMATION_MAX_AGE = 7 * 24 * 60 * 60;

const CONFIRM_SETTINGS = ['email_unconfirmed', 'email_confirmation_key'];

/**
 * Whether a person waiting to confirm needs a new code: they have none (classic writes 0 once a
 * code is used) or theirs is over 7 days old. sentAt is the key setting's timestamp, which moves
 * with each new code
 */
export function isCodeExpired(code: unknown, sentAt: Date | null): boolean {
	if (!code || String(code) === '0') return true;
	return !!sentAt && Date.now() - sentAt.getTime() > CONFIRMATION_MAX_AGE * 1000;
}

const normalize = (email: string) => email.trim().toLowerCase();

export function newConfirmationCode(): string {
	return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}

/**
 * Starts (or restarts) confirmation of the person's current address: a new code replaces any
 * earlier one, which also retires its link. Sent even to someone opted out, ahead of any blast
 */
export async function sendConfirmation(db: Database, person: { id: number; email: string }) {
	const code = newConfirmationCode();
	await personRepo.updatePerson(db, person.id, {
		no_email: 1,
		settings: { email_unconfirmed: 1, email_confirmation_key: code },
	});

	const token = await signToken('confirm-email', person.id, { email: normalize(person.email), code }, CONFIRMATION_MAX_AGE);
	const { subject, html } = confirmEmail({ code, link: `${config.schemats_url}/confirm-email/${token}` });
	await notify({
		ids: [person.id],
		subject,
		html: html.value,
		kind: 'account',
		priority: 'high',
		channels: { inbox: false, push: false },
	});
}

async function clearConfirmation(db: Database, personId: number) {
	await personRepo.updatePerson(db, personId, {
		no_email: 0,
		settings: { email_unconfirmed: null, email_confirmation_key: null },
	});
}

export type ResendOutcome = 'sent' | 'alreadyConfirmed' | 'notFound';

/** A new code for someone still unconfirmed */
export async function resendConfirmation(db: Database, personId: number): Promise<ResendOutcome> {
	const person = await personRepo.getPerson(db, personId, { settings: CONFIRM_SETTINGS });
	if (!person) return 'notFound';
	if (!person.settings?.email_unconfirmed) return 'alreadyConfirmed';

	await sendConfirmation(db, person);
	return 'sent';
}

export type ConfirmCodeOutcome = 'confirmed' | 'alreadyConfirmed' | 'wrong' | 'expired' | 'notFound';

/**
 * Checks a typed code against the stored one, in any case and with spaces trimmed. A right code
 * is expired once its setting row is over 7 days old: the row's timestamp moves with each new code
 */
export async function confirmCode(db: Database, personId: number, code: string): Promise<ConfirmCodeOutcome> {
	const person = await personRepo.getPerson(db, personId, { settings: CONFIRM_SETTINGS, withTimestamps: true });
	if (!person) return 'notFound';
	if (!person.settings?.email_unconfirmed) return 'alreadyConfirmed';

	const stored = String(person.settings.email_confirmation_key ?? '').toUpperCase();
	if (!stored || code.trim().toUpperCase() !== stored) return 'wrong';
	if (isCodeExpired(stored, sqlDatetime(person.settingsTimestamps?.email_confirmation_key?.timestamp))) return 'expired';

	await clearConfirmation(db, person.id);
	return 'confirmed';
}

export type TokenCheck =
	| { result: 'ready', personId: number, email: string }
	| { result: 'alreadyConfirmed', email: string }
	| { result: 'expired' }
	| { result: 'invalid' };

/**
 * What a confirmation link can do. It works only while it names the person's current address
 * and, until confirmed, their current code; a resend or an address change makes it invalid.
 * Emails come back masked, since whoever holds the link may not be the person
 */
export async function checkConfirmationToken(db: Database, token: string): Promise<TokenCheck> {
	const verified = await verifyToken('confirm-email', token);
	if (!verified) return { result: 'invalid' };
	if ('expired' in verified) return { result: 'expired' };

	const person = await personRepo.getPerson(db, verified.subject, { settings: CONFIRM_SETTINGS });
	if (!person || normalize(person.email) !== verified.claims.email) return { result: 'invalid' };

	const email = maskEmail(person.email);
	if (!person.settings?.email_unconfirmed) return { result: 'alreadyConfirmed', email };
	if (String(person.settings.email_confirmation_key ?? '').toUpperCase() !== verified.claims.code) return { result: 'invalid' };

	return { result: 'ready', personId: person.id, email };
}

/** Uses a confirmation link: confirms when it is ready, and reports what it found either way */
export async function confirmWithToken(db: Database, token: string): Promise<TokenCheck> {
	const check = await checkConfirmationToken(db, token);
	if (check.result === 'ready') await clearConfirmation(db, check.personId);
	return check;
}
