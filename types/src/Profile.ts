import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { COUNTRY_CODES, STATE_CODES, isValidTimeZone } from './Location.js';
import { PersonSchema } from './Person.js';

export const UserProfileSchema = PersonSchema.pick({
	email: true,
	first: true,
	middle: true,
	last: true,
	pronoun: true,
	tz: true,
	street: true,
	city: true,
	country: true,
	zip: true,
	postal: true,
}).extend({
	phone: z.string().nullable().meta({ description: 'The phone number as digits, or null if none is saved' }),
	// Stored codes can predate the current list (DE-M from classic's truncated German codes)
	state: z.string().nullable().meta({ description: 'The state or province code as stored' }),
	noEmail: z.boolean().meta({ description: 'Whether the person asked not to be sent tournament email' }),
	emailUnconfirmed: z.boolean().meta({ description: 'Whether the email address is waiting on its confirmation code' }),
	forcePasswordChange: z.boolean().meta({ description: 'Whether the person must change their password before anything else' }),
}).strict().meta({
	id: 'UserProfile',
	description: 'The logged in person\'s own profile',
}) satisfies ZodOpenApiSchemaObject;

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Letters in any script, combining marks, spaces, straight and curly apostrophes, hyphens and
// periods: "José", "O’Brien", "Mary-Jane", "St. John", "李"
const NAME_CHARACTERS = /^[\p{L}\p{M}' ’.-]*$/u;
const NO_ANGLE_BRACKETS = /^[^<>]*$/;

const name = z.string()
	.overwrite(value => value.trim().replace(/\s+/g, ' '))
	.max(63, 'Use 63 characters or fewer')
	.regex(NAME_CHARACTERS, 'Use letters, spaces, apostrophes, hyphens and periods only');

const text = (max: number) => z.string()
	.trim()
	.max(max, `Use ${max} characters or fewer`)
	.regex(NO_ANGLE_BRACKETS, 'Remove the < and > characters');

/**
 * Only the fields being changed. Rules that depend on the stored row (phone length and ZIP
 * against the country, phone already in use) are checked by the API after this.
 */
export const UserProfileUpdateSchema = z.object({
	first: name.min(1, 'Enter your first name'),
	middle: name,
	last: name.min(1, 'Enter your last name'),
	pronoun: text(63),
	// Punctuation people type in phone numbers: "(555) 123-4567", "+1 555.123.4567"
	phone: z.string()
		.regex(/^[\d\s().+-]*$/, 'Use digits only')
		.overwrite(value => value.replace(/\D/g, ''))
		.meta({ description: 'The phone number. Saved as digits, without a leading 1 for US and Canadian numbers; empty removes it' }),
	street: text(127),
	city: text(63),
	state: z.string().trim().toUpperCase()
		.refine(value => value === '' || STATE_CODES.has(value), 'Choose a state from the list')
		.meta({ description: 'A state or province code from the list, or empty' }),
	country: z.union([z.enum(COUNTRY_CODES), z.literal('')], { error: 'Choose a country from the list' })
		.meta({ description: 'An ISO 3166-1 alpha-2 country code, or empty' }),
	// "12345" or "12345-6789"
	zip: z.string().trim().regex(/^(\d{5}(-\d{4})?)?$/, 'Use a 5-digit ZIP code, or ZIP+4'),
	postal: z.string().trim()
		.max(15, 'Use 15 characters or fewer')
		.regex(/^[A-Za-z0-9 -]*$/, 'Use letters, numbers, spaces and hyphens only'),
	tz: z.string().refine(isValidTimeZone, 'Choose a time zone from the list'),
	noEmail: z.boolean(),
}).partial().strict().meta({
	id: 'UserProfileUpdate',
	description: 'Changes to the logged in person\'s profile; fields left out stay as they are',
}) satisfies ZodOpenApiSchemaObject;

export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;
