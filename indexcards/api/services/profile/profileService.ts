import type { Selectable } from 'kysely';
import type { UserProfile, UserProfileUpdate } from '@tabroom/types';
import type { Database } from '../../data/database.js';
import type { Person } from '../../data/schema.js';
import personRepo from '../../repos/personRepo.js';
import type { Settings } from '../../repos/utils/index.js';
import { verifyPassword } from '../AuthService.js';
import { notify } from '../notifications/notify.js';
import { emailChanged } from '../notifications/templates/account/emailChanged.js';
import { sqlDatetime } from '../home/homeRules.js';
import { isCodeExpired, sendConfirmation } from './emailConfirm.js';

type ProfileIssue = { path: string[], message: string, code: 'custom' };

export type ProfileUpdateOutcome =
	| { result: 'saved', profile: UserProfile, emailChanged: boolean }
	| { result: 'notFound' }
	| { result: 'forcedPasswordChange' }
	| { result: 'emailWhileSu' }
	| { result: 'invalid', issues: ProfileIssue[] }
	| { result: 'wrongPassword', issues: ProfileIssue[] }
	| { result: 'phoneTaken', issues: ProfileIssue[] }
	| { result: 'emailTaken', issues: ProfileIssue[] };

const PROFILE_SETTINGS = ['email_unconfirmed', 'email_confirmation_key', 'force_password_change'];

const issue = (field: string, message: string): ProfileIssue => ({ path: [field], message, code: 'custom' });

type ProfilePerson = Selectable<Person> & {
	settings?: Settings | null,
	settingsTimestamps?: Record<string, { timestamp?: Date | string | null }> | null,
};

function toProfile(person: ProfilePerson): UserProfile {
	const emailUnconfirmed = !!person.settings?.email_unconfirmed;
	return {
		email: person.email,
		first: person.first ?? '',
		middle: person.middle,
		last: person.last ?? '',
		pronoun: person.pronoun,
		phone: person.phone ? String(person.phone) : null,
		tz: person.tz,
		street: person.street,
		city: person.city,
		state: person.state,
		country: person.country,
		zip: person.zip,
		postal: person.postal,
		noEmail: !!person.no_email,
		emailUnconfirmed,
		emailCodeExpired: emailUnconfirmed && isCodeExpired(
			person.settings?.email_confirmation_key,
			sqlDatetime(person.settingsTimestamps?.email_confirmation_key?.timestamp),
		),
		forcePasswordChange: !!person.settings?.force_password_change,
	};
}

export async function getProfile(db: Database, personId: number) {
	const person = await personRepo.getPerson(db, personId, { settings: PROFILE_SETTINGS, withTimestamps: true });
	return person ? toProfile(person) : null;
}

/**
 * Saves only the fields sent, which the request schema has already checked one by one. Here go
 * the rules that need the stored row, each run only when its field is sent: phone length and ZIP
 * or postal code against the country the person will have after the save, and a phone already on
 * another account. Stored values aren't re-checked when only the country changes, so legacy data
 * never blocks a save. Any failure saves nothing.
 */
export async function updateProfile(
	db: Database,
	personId: number,
	{ currentPassword, ...changes }: UserProfileUpdate,
	opts: { su?: boolean } = {},
): Promise<ProfileUpdateOutcome> {
	const person = await personRepo.getPerson(db, personId, { settings: PROFILE_SETTINGS });
	if (!person) return { result: 'notFound' };
	if (person.settings?.force_password_change) return { result: 'forcedPasswordChange' };

	if (changes.email === person.email.trim().toLowerCase()) delete changes.email;
	if (changes.email !== undefined && opts.su) return { result: 'emailWhileSu' };

	const country = changes.country ?? person.country ?? '';
	const northAmerican = country === 'US' || country === 'CA';
	// The 1 is the North American country code, as classic strips it; elsewhere a leading 1 is
	// part of the number (Chinese mobiles start with 1)
	const digits = northAmerican ? changes.phone?.replace(/^1+(?=\d)/, '') : changes.phone;
	const issues: ProfileIssue[] = [];

	if (digits) {
		if (northAmerican && digits.length !== 10) {
			issues.push(issue('phone', 'Use a 10-digit phone number'));
		} else if (!northAmerican && (digits.length < 7 || digits.length > 15)) {
			issues.push(issue('phone', 'Use a phone number of 7 to 15 digits'));
		}
	}
	if (changes.zip && country !== 'US') {
		issues.push(issue('zip', 'ZIP codes are for United States addresses. Use a postal code instead.'));
	}
	if (changes.postal && country === 'US') {
		issues.push(issue('postal', 'Use a ZIP code for United States addresses'));
	}
	if (issues.length) return { result: 'invalid', issues };

	if (changes.email !== undefined) {
		// An account with no password (classic one-time-link logins) can't change its email until it sets one
		if (!person.password || !verifyPassword(currentPassword ?? '', person.password)) {
			return { result: 'wrongPassword', issues: [issue('currentPassword', 'That password isn\'t right')] };
		}
		const holder = await personRepo.getPersonByUsername(db, changes.email);
		if (holder && holder.id !== personId) {
			return { result: 'emailTaken', issues: [issue('email', 'That email is already in use')] };
		}
	}

	const phone = digits === undefined ? undefined : digits ? Number(digits) : null;
	if (phone && phone !== person.phone) {
		const holders = await personRepo.findPersons(db, {}, { phones: [phone], limit: 2 });
		if (holders.some(holder => holder.id !== personId)) {
			return { result: 'phoneTaken', issues: [issue('phone', 'That phone number is already in use on another account')] };
		}
	}

	const { noEmail, phone: _phone, ...columns } = changes;
	await personRepo.updatePerson(db, personId, {
		...columns,
		...(phone === undefined ? {} : { phone }),
		...(noEmail === undefined ? {} : { no_email: noEmail ? 1 : 0 }),
	});

	if (changes.email !== undefined) {
		await sendConfirmation(db, { id: personId, email: changes.email });
		// The old address hears about it, so an owner whose email someone else changed finds out.
		// No link or code: a link reads as phishing, and the old address mustn't confirm the new one
		const { subject, html } = emailChanged({ newAddress: changes.email });
		await notify({
			ids: [personId],
			to: person.email,
			subject,
			html: html.value,
			kind: 'account',
			priority: 'high',
			channels: { inbox: false, push: false },
		});
	}

	return { result: 'saved', profile: (await getProfile(db, personId))!, emailChanged: changes.email !== undefined };
}
