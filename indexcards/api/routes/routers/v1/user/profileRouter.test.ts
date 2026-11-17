import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import logger from '../../../../helpers/logger.js';
import { db } from '../../../../data/database.js';
import personRepo from '../../../../repos/personRepo.js';
import { verifyPassword } from '../../../../services/AuthService.js';
import { sql } from 'kysely';
import { UserProfileSchema } from '@tabroom/types';
import type { UserProfile } from '@tabroom/types';

const { addJobs } = vi.hoisted(() => ({ addJobs: vi.fn() }));
vi.mock('../../../../services/queue/index.js', async (original) => ({ ...await original(), addJobs }));

type PersonOverrides = Parameters<typeof factories.person.create>[0];

// Phone numbers are unique across person, so each test draws its own
const randomPhone = () => `${2 + Math.floor(Math.random() * 8)}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const WEEK_MINUTES = 7 * 24 * 60;

const stored = (id: number) => db.selectFrom('person').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

const patch = (userkey: string, body: object) => request(server).patch('/v1/user/profile').asPerson(userkey).send(body);

describe('Profile Router', () => {
	const personIds: number[] = [];

	async function newPerson(overrides: PersonOverrides = {}) {
		const Person = await factories.person.create({ country: 'US', state: 'IA', phone: null, zip: null, postal: null, ...overrides });
		personIds.push(Person.id);
		const { userkey } = await factories.session.create({ person: Person.id });
		return { id: Person.id, userkey };
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await db.deleteFrom('session').where('person', 'in', personIds).execute();
		await db.deleteFrom('person_setting').where('person', 'in', personIds).execute();
		await db.deleteFrom('person').where('id', 'in', personIds).execute();
	});

	describe('GET /v1/user/profile', () => {
		it('returns the person\'s own profile without the password', async () => {
			const { id, userkey } = await newPerson({ first: 'Avery', phone: 5155550142, no_email: 1, password: 'secret-pass' });

			const res = await request(server).get('/v1/user/profile').asPerson(userkey).expect(200);

			expect(res.body).toMatchSchema(UserProfileSchema);
			expect(res.body).toMatchObject({ first: 'Avery', phone: '5155550142', noEmail: true, emailUnconfirmed: false, forcePasswordChange: false });
			expect(res.body).not.toHaveProperty('password');
			expect((await stored(id)).first).toBe('Avery');
		});

		it('flags an unconfirmed email and a required password change', async () => {
			const { userkey } = await newPerson({ settings: { email_unconfirmed: 1, force_password_change: 1 } });

			const res = await request(server).get('/v1/user/profile').asPerson(userkey).expect(200);

			expect(res.body).toMatchObject({ emailUnconfirmed: true, forcePasswordChange: true });
		});

		it('says whether an unconfirmed address needs a new code: none, a used one, or one over 7 days old', async () => {
			const profileOf = async (userkey: string) => (await request(server).get('/v1/user/profile').asPerson(userkey).expect(200)).body as UserProfile;

			const fresh = await newPerson({ settings: { email_unconfirmed: 1, email_confirmation_key: 'HXK3QY' } });
			const old = await newPerson({ settings: { email_unconfirmed: 1, email_confirmation_key: 'MW4PTB' } });
			await sentMinutesAgo(old.id, WEEK_MINUTES + 1);
			const none = await newPerson({ settings: { email_unconfirmed: 1 } });
			const used = await newPerson({ settings: { email_unconfirmed: 1, email_confirmation_key: '0' } });
			const confirmed = await newPerson();

			expect(await profileOf(fresh.userkey)).toMatchObject({ emailUnconfirmed: true, emailCodeExpired: false });
			expect(await profileOf(old.userkey)).toMatchObject({ emailUnconfirmed: true, emailCodeExpired: true });
			expect(await profileOf(none.userkey)).toMatchObject({ emailUnconfirmed: true, emailCodeExpired: true });
			expect(await profileOf(used.userkey)).toMatchObject({ emailUnconfirmed: true, emailCodeExpired: true });
			expect(await profileOf(confirmed.userkey)).toMatchObject({ emailUnconfirmed: false, emailCodeExpired: false });
		});

		it('shows a stored state that is no longer on the list', async () => {
			const { userkey } = await newPerson({ state: 'DE-M', country: 'DE' });

			const res = await request(server).get('/v1/user/profile').asPerson(userkey).expect(200);

			expect(res.body.state).toBe('DE-M');
		});

		it('requires a login', async () => {
			expect((await request(server).get('/v1/user/profile')).status).toBe(401);
		});
	});

	describe('PATCH /v1/user/profile', () => {
		it('saves the fields sent and returns the profile', async () => {
			const { id, userkey } = await newPerson();

			const res = await patch(userkey, { first: 'Ann', pronoun: 'they/them', tz: 'America/Chicago', noEmail: true }).expect(200);

			expect(res.body).toMatchSchema(UserProfileSchema);
			expect(res.body as UserProfile).toMatchObject({ first: 'Ann', pronoun: 'they/them', tz: 'America/Chicago', noEmail: true });
			expect(await stored(id)).toMatchObject({ first: 'Ann', pronoun: 'they/them', tz: 'America/Chicago', no_email: 1 });
		});

		it.each([
			['José'], ['O\'Brien'], ['O’Brien'], ['Mary-Jane'], ['St. John'], ['李'], ['B'], ['Zoë'],
		])('accepts the name %s', async (name) => {
			const { id, userkey } = await newPerson();

			await patch(userkey, { last: name }).expect(200);

			expect((await stored(id)).last).toBe(name);
		});

		it.each([
			['Smith2'], ['33-Dey'], ['<b>x</b>'], ['😀'], [''], ['a'.repeat(64)],
		])('rejects the last name %j', async (name) => {
			const { userkey } = await newPerson();

			const res = await patch(userkey, { last: name }).expect(400);

			expect(res.body.issues[0].path).toEqual(['last']);
		});

		it('trims and collapses spaces in names', async () => {
			const { id, userkey } = await newPerson();

			await patch(userkey, { first: '  Ann   Lee ' }).expect(200);

			expect((await stored(id)).first).toBe('Ann Lee');
		});

		// AAA is a random area code, so the number isn't already on another account in the test DB
		it.each([
			['US', '(AAA) 123-4567'],
			['US', '+1 AAA 123 4567'],
			['CA', 'AAA.123.4567'],
			['GB', 'AAA 1234 567'],
		])('stores a %s phone %s as digits', async (country, phone) => {
			const { id, userkey } = await newPerson({ country });
			const area = randomPhone().slice(0, 3);

			await patch(userkey, { phone: phone.replace('AAA', area) }).expect(200);

			expect((await stored(id)).phone).toBe(Number(`${area}1234567`));
		});

		it('keeps a leading 1 outside the US and Canada', async () => {
			// Chinese mobile numbers are 11 digits starting with 1
			const { id, userkey } = await newPerson({ country: 'CN' });
			const phone = `1${randomPhone()}`;

			await patch(userkey, { phone }).expect(200);

			expect((await stored(id)).phone).toBe(Number(phone));
		});

		it('strips every leading 1 from a US number, as classic does', async () => {
			const { id, userkey } = await newPerson({ country: 'US' });
			const phone = randomPhone();

			await patch(userkey, { phone: `11${phone}` }).expect(200);

			expect((await stored(id)).phone).toBe(Number(phone));
		});

		it.each([
			['US', '555123456'],
			['US', '55512345678'],
			['CA', '555123456'],
			['GB', '234567'],
			['GB', '2345678901234567'],
		])('rejects a %s phone of %s', async (country, phone) => {
			const { id, userkey } = await newPerson({ country });

			const res = await patch(userkey, { phone }).expect(400);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['phone'] })]);
			expect((await stored(id)).phone).toBeNull();
		});

		it('checks the phone length against the country sent with it', async () => {
			const { id, userkey } = await newPerson({ country: 'US' });
			const phone = randomPhone().slice(0, 7);

			await patch(userkey, { country: 'GB', phone }).expect(200);

			expect(await stored(id)).toMatchObject({ country: 'GB', phone: Number(phone) });
		});

		it('saves an emptied phone as NULL', async () => {
			const { id, userkey } = await newPerson({ phone: Number(randomPhone()) });

			const res = await patch(userkey, { phone: '' }).expect(200);

			expect(res.body.phone).toBeNull();
			expect((await stored(id)).phone).toBeNull();
		});

		it('reads classic\'s 0 as no phone', async () => {
			const { userkey } = await newPerson({ phone: 0 });

			const res = await request(server).get('/v1/user/profile').asPerson(userkey).expect(200);

			expect(res.body.phone).toBeNull();
		});

		it('rejects a phone already on another account, saving nothing', async () => {
			const phone = randomPhone();
			await newPerson({ phone: Number(phone) });
			const { id, userkey } = await newPerson();

			const res = await patch(userkey, { first: 'Changed', phone }).expect(409);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['phone'], message: 'That phone number is already in use on another account' })]);
			expect(await stored(id)).toMatchObject({ phone: null });
			expect((await stored(id)).first).not.toBe('Changed');
		});

		it('lets a person send their own phone again', async () => {
			const phone = randomPhone();
			const { userkey } = await newPerson({ phone: Number(phone) });

			expect((await patch(userkey, { phone })).status).toBe(200);
		});

		it.each([
			['US', { zip: '12345' }],
			['US', { zip: '12345-6789' }],
			['GB', { postal: 'SW1A 1AA' }],
		])('accepts a %s address code %j', async (country, body) => {
			const { id, userkey } = await newPerson({ country });

			await patch(userkey, body).expect(200);

			expect(await stored(id)).toMatchObject(body);
		});

		it.each([
			['US', { zip: '1234' }, 'zip'],
			['GB', { zip: '12345' }, 'zip'],
			['US', { postal: 'SW1A 1AA' }, 'postal'],
			['GB', { postal: 'x'.repeat(16) }, 'postal'],
			['GB', { postal: 'A#1' }, 'postal'],
		])('rejects a %s address code %j', async (country, body, field) => {
			const { userkey } = await newPerson({ country });

			const res = await patch(userkey, body).expect(400);

			expect(res.body.issues[0].path).toEqual([field]);
		});

		it.each([
			['NY', 'US'], ['VIC', 'AU'], ['EN', 'GB'], ['NY', 'CA'], ['VIC', 'US'], ['', 'US'],
		])('accepts the state %j with the country %s', async (state, country) => {
			const { id, userkey } = await newPerson();

			await patch(userkey, { state, country }).expect(200);

			expect(await stored(id)).toMatchObject({ state, country });
		});

		it.each([
			[{ state: 'ZZ' }, 'state'],
			[{ state: 'DE-M' }, 'state'],
			[{ country: 'UK' }, 'country'],
			[{ country: 'XX' }, 'country'],
		])('rejects %j', async (body, field) => {
			const { userkey } = await newPerson();

			const res = await patch(userkey, body).expect(400);

			expect(res.body.issues[0].path).toEqual([field]);
		});

		it.each([['America/Chicago'], ['UTC'], ['CET'], ['US/Eastern']])('accepts the time zone %s', async (tz) => {
			const { id, userkey } = await newPerson();

			await patch(userkey, { tz }).expect(200);

			expect((await stored(id)).tz).toBe(tz);
		});

		it.each([['Mars/Olympus'], ['']])('rejects the time zone %j', async (tz) => {
			const { userkey } = await newPerson();

			expect((await patch(userkey, { tz })).status).toBe(400);
		});

		it.each([
			[{ pronoun: 'x'.repeat(63) }, 200],
			[{ pronoun: 'x'.repeat(64) }, 400],
			[{ pronoun: '<i>' }, 400],
			[{ street: 'x'.repeat(127) }, 200],
			[{ street: 'x'.repeat(128) }, 400],
			[{ city: 'x'.repeat(63) }, 200],
			[{ city: 'x'.repeat(64) }, 400],
			[{ city: 'Des <Moines>' }, 400],
		])('answers %j with %i', async (body, status) => {
			const { userkey } = await newPerson();

			expect((await patch(userkey, body)).status).toBe(status);
		});

		it('validates only the fields sent, so stored legacy values don\'t block a save', async () => {
			const { id, userkey } = await newPerson({ last: '33-Dey', state: 'DE-M', country: 'DE' });

			await patch(userkey, { city: 'Berlin' }).expect(200);

			expect(await stored(id)).toMatchObject({ last: '33-Dey', state: 'DE-M', city: 'Berlin' });
		});

		it('saves nothing when one field is invalid', async () => {
			const { id, userkey } = await newPerson({ first: 'Before' });

			await patch(userkey, { first: 'After', zip: '1234' }).expect(400);

			expect((await stored(id)).first).toBe('Before');
		});

		it('refuses an email change until that flow is built', async () => {
			const { userkey } = await newPerson();

			expect((await patch(userkey, { email: 'new@example.com' })).status).toBe(400);
		});

		it('is refused while a password change is required', async () => {
			const { id, userkey } = await newPerson({ first: 'Before', settings: { force_password_change: 1 } });

			await patch(userkey, { first: 'After' }).expect(403);

			expect((await stored(id)).first).toBe('Before');
		});

		it('is allowed while su\'d and logged with the admin', async () => {
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const Target = await newPerson();
			const { userkey } = await factories.session.create({ person: Target.id, su: Admin.id });
			const info = vi.spyOn(logger, 'info');

			await patch(userkey, { first: 'Sud' }).expect(200);

			expect((await stored(Target.id)).first).toBe('Sud');
			expect(info).toHaveBeenCalledWith(
				expect.stringContaining(`by ${Admin.email} while su'd as`),
				expect.objectContaining({ 'event.name': 'account.profile.changed', person: Target.id }),
			);
		});

		it('requires a login', async () => {
			expect((await request(server).patch('/v1/user/profile').send({ first: 'Ann' })).status).toBe(401);
		});

		it('refuses a request from another origin', async () => {
			const { userkey } = await newPerson();

			expect((await patch(userkey, { first: 'Ann' }).set('Origin', 'https://evil.example.com')).status).toBe(403);
		});
	});

	/** A person waiting to confirm, holding this code, as classic and indexcards both store it */
	const unconfirmed = (code = 'HXK3QY', overrides: PersonOverrides = {}) =>
		newPerson({ no_email: 1, settings: { email_unconfirmed: 1, email_confirmation_key: code }, ...overrides });

	const confirmation = async (id: number) => {
		const rows = await db.selectFrom('person_setting').select(['tag', 'value'])
			.where('person', '=', id)
			.where('tag', 'in', ['email_unconfirmed', 'email_confirmation_key'])
			.execute();
		const settings = Object.fromEntries(rows.map(row => [row.tag, row.value]));
		return { unconfirmed: settings.email_unconfirmed ?? null, key: settings.email_confirmation_key ?? null, noEmail: (await stored(id)).no_email };
	};

	/** Moves the stored code's send time back, in the database's own clock */
	const sentMinutesAgo = (id: number, minutes: number) => db.updateTable('person_setting')
		.set({ timestamp: sql<Date>`NOW() - INTERVAL ${minutes} MINUTE` })
		.where('person', '=', id)
		.where('tag', '=', 'email_confirmation_key')
		.execute();

	const confirm = (userkey: string, code: string) => request(server).post('/v1/user/profile/email/confirm').asPerson(userkey).send({ code });

	/** The email jobs handed to the queue since the test began */
	const emailJobs = () => addJobs.mock.calls
		.flatMap(([jobs]) => jobs as { queueName: string; data: Record<string, unknown>; opts: Record<string, unknown> }[])
		.filter(job => job.queueName === 'email');

	describe('POST /v1/user/profile/email/confirm', () => {
		beforeEach(() => {
			addJobs.mockReset().mockResolvedValue(undefined);
		});

		it('confirms with the right code in any case and with spaces, and turns email back on', async () => {
			const { id, userkey } = await unconfirmed('HXK3QY');

			const res = await confirm(userkey, '  hxk3qy ').expect(204);

			expect(res).not.toBeProblemResponse();
			expect(await confirmation(id)).toEqual({ unconfirmed: null, key: null, noEmail: 0 });
			expect((await request(server).get('/v1/user/profile').asPerson(userkey)).body).toMatchObject({ emailUnconfirmed: false, noEmail: false });
		});

		it('accepts a code classic wrote straight into person_setting', async () => {
			const { id, userkey } = await newPerson({ no_email: 1 });
			await db.insertInto('person_setting').values([
				{ person: id, tag: 'email_unconfirmed', value: '1' },
				{ person: id, tag: 'email_confirmation_key', value: 'G3FYR7' },
			]).execute();

			await confirm(userkey, 'g3fyr7').expect(204);

			expect(await confirmation(id)).toEqual({ unconfirmed: null, key: null, noEmail: 0 });
		});

		it('refuses a wrong code under the code field and changes nothing', async () => {
			const { id, userkey } = await unconfirmed('HXK3QY');

			const res = await confirm(userkey, 'HXK3QZ').expect(400);

			expect(res).toBeProblemResponse(400);
			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['code'] })]);
			expect(await confirmation(id)).toEqual({ unconfirmed: '1', key: 'HXK3QY', noEmail: 1 });
		});

		it('accepts a code just under 7 days old and refuses one just over as expired', async () => {
			const { id, userkey } = await unconfirmed('HXK3QY');

			await sentMinutesAgo(id, WEEK_MINUTES - 1);
			await confirm(userkey, 'HXK3QY').expect(204);

			const late = await unconfirmed('MW4PTB');
			await sentMinutesAgo(late.id, WEEK_MINUTES + 1);
			const res = await confirm(late.userkey, 'MW4PTB').expect(410);

			expect(res).toBeProblemResponse(410);
			expect(await confirmation(late.id)).toMatchObject({ unconfirmed: '1', key: 'MW4PTB' });
		});

		it('answers an address already confirmed the same way', async () => {
			const { userkey } = await newPerson();

			const res = await confirm(userkey, 'ANYTHN');
			expect(res.status).toBe(204);
		});

		it('does nothing with another person\'s code', async () => {
			const Owner = await unconfirmed('HXK3QY');
			const Other = await unconfirmed('MW4PTB');

			await confirm(Other.userkey, 'HXK3QY').expect(400);

			expect(await confirmation(Owner.id)).toMatchObject({ unconfirmed: '1', key: 'HXK3QY' });
			expect(await confirmation(Other.id)).toMatchObject({ unconfirmed: '1', key: 'MW4PTB' });
		});

		it('stops after 10 wrong codes, even for the right one', async () => {
			const { userkey } = await unconfirmed('HXK3QY');

			for (let attempt = 0; attempt < 10; attempt++) {
				await confirm(userkey, 'WRONG2').expect(400);
			}
			const res = await confirm(userkey, 'HXK3QY').expect(429);

			expect(res).toBeProblemResponse(429);
		});

		it('is allowed while su\'d', async () => {
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const Target = await unconfirmed('HXK3QY');
			const { userkey } = await factories.session.create({ person: Target.id, su: Admin.id });

			await confirm(userkey, 'HXK3QY').expect(204);

			expect(await confirmation(Target.id)).toMatchObject({ unconfirmed: null });
		});
	});

	describe('POST /v1/user/profile/email/resend', () => {
		const resend = (userkey: string) => request(server).post('/v1/user/profile/email/resend').asPerson(userkey);

		beforeEach(() => {
			addJobs.mockReset().mockResolvedValue(undefined);
		});

		it('sends a new code ahead of blasts, and the old code stops working', async () => {
			const { id, userkey } = await unconfirmed('HXK3QY');

			await resend(userkey).expect(202);

			const { key } = await confirmation(id);
			// 6 characters from the code alphabet (no 0, 1, I or O), e.g. HXK3QY
			expect(key).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
			expect(key).not.toBe('HXK3QY');
			const [job] = emailJobs();
			expect(job.data).toMatchObject({ kind: 'account' });
			expect(job.opts).not.toHaveProperty('priority');

			await confirm(userkey, 'HXK3QY').expect(400);
			await confirm(userkey, key!).expect(204);
		});

		it('emails the code and a link, even to someone who turned email off', async () => {
			const { id, userkey } = await unconfirmed('HXK3QY', { no_email: 1 });

			await resend(userkey).expect(202);

			const message = await db.selectFrom('message').select(['subject', 'body', 'email_status'])
				.where('person', '=', id).orderBy('id', 'desc').executeTakeFirstOrThrow();
			const { key } = await confirmation(id);
			expect(message).toMatchObject({ subject: 'Confirm your email address for Tabroom.com', email_status: 'queued' });
			expect(message.body).toContain(key!);
			expect(message.body).toContain('/confirm-email/');
			expect(message.body).toContain('/user/profile/confirm');
		});

		it('refuses when the address is already confirmed', async () => {
			const { userkey } = await newPerson();

			const res = await resend(userkey).expect(409);

			expect(res).toBeProblemResponse(409);
			expect(emailJobs()).toEqual([]);
		});

		it('allows 3 sends an hour', async () => {
			const { userkey } = await unconfirmed();

			for (let send = 0; send < 3; send++) {
				const res = await resend(userkey);
				expect(res.status).toBe(202);
			}
			expect((await resend(userkey)).status).toBe(429);
		});

		it('is allowed while su\'d', async () => {
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const Target = await unconfirmed();
			const { userkey } = await factories.session.create({ person: Target.id, su: Admin.id });

			const res = await resend(userkey);
			expect(res.status).toBe(202);
		});
	});

	describe('changing the email through PATCH /v1/user/profile', () => {
		const PASSWORD = 'current-pass-123';
		const newAddress = () => `changed-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;
		const unchanged = async (id: number, email: string) => {
			expect((await stored(id)).email).toBe(email);
			expect(await confirmation(id)).toEqual({ unconfirmed: null, key: null, noEmail: 0 });
		};

		beforeEach(() => {
			addJobs.mockReset().mockResolvedValue(undefined);
		});

		it('saves the address trimmed and lowercased, starts it unconfirmed, and mails the new and old addresses ahead of blasts', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD, no_email: 0 });
			const oldEmail = (await stored(id)).email;
			const address = newAddress();
			const info = vi.spyOn(logger, 'info');

			const res = await patch(userkey, { email: ` ${address.toUpperCase()} `, currentPassword: PASSWORD, first: 'Avery' }).expect(200);

			expect(res.body).toMatchSchema(UserProfileSchema);
			expect(res.body).toMatchObject({ email: address, first: 'Avery', emailUnconfirmed: true, noEmail: true });
			expect((await stored(id)).email).toBe(address);
			// 6 characters from the code alphabet (no 0, 1, I or O), e.g. HXK3QY
			expect((await confirmation(id)).key).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

			const jobs = emailJobs();
			expect(jobs).toHaveLength(2);
			expect(jobs.every(job => job.data.kind === 'account' &&!('priority' in job.opts))).toBe(true);
			expect(jobs.filter(job => job.data.to === oldEmail)).toHaveLength(1);

			const notice = await db.selectFrom('message').select(['subject', 'body'])
				.where('person', '=', id).where('subject', '=', 'Your Tabroom.com email address was changed')
				.executeTakeFirstOrThrow();
			expect(notice.body).toContain(`${address[0]}***@example.org`);
			expect(notice.body).not.toContain('/confirm-email/');
			expect(info).toHaveBeenCalledWith(expect.stringContaining('Email changed from'), expect.objectContaining({ 'event.name': 'account.email.changed' }));
		});

		it('needs the current password with a new email', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const email = (await stored(id)).email;

			const res = await patch(userkey, { email: newAddress() }).expect(400);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['currentPassword'] })]);
			await unchanged(id, email);
			expect(emailJobs()).toEqual([]);
		});

		it('refuses a wrong current password under that field', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const email = (await stored(id)).email;

			const res = await patch(userkey, { email: newAddress(), currentPassword: 'not-it' }).expect(403);

			expect(res).toBeProblemResponse(403);
			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['currentPassword'] })]);
			await unchanged(id, email);
			expect(emailJobs()).toEqual([]);
		});

		it('refuses an account with no password', async () => {
			const { id, userkey } = await newPerson();
			await db.updateTable('person').set({ password: '' }).where('id', '=', id).execute();
			const email = (await stored(id)).email;

			const res = await patch(userkey, { email: newAddress(), currentPassword: 'anything' }).expect(403);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['currentPassword'] })]);
			await unchanged(id, email);
		});

		it('refuses an address another account has, in any case, without naming it', async () => {
			const Other = await newPerson();
			const taken = (await stored(Other.id)).email;
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const email = (await stored(id)).email;

			const res = await patch(userkey, { email: taken.toUpperCase(), currentPassword: PASSWORD }).expect(409);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['email'], message: 'That email is already in use' })]);
			expect(JSON.stringify(res.body)).not.toContain(taken);
			await unchanged(id, email);
		});

		it('refuses an address that isn\'t one', async () => {
			const { userkey } = await newPerson({ password: PASSWORD });

			const res = await patch(userkey, { email: 'not an address', currentPassword: PASSWORD }).expect(400);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['email'] })]);
		});

		it('treats the same address in another case as no change: no password needed, nothing sent', async () => {
			const { id, userkey } = await newPerson();
			const email = (await stored(id)).email;

			await patch(userkey, { email: email.toUpperCase(), currentPassword: 'ignored', first: 'Avery' }).expect(200);

			await unchanged(id, email);
			expect(emailJobs()).toEqual([]);
		});

		it('refuses an email change while su\'d, but still saves other fields', async () => {
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const Target = await newPerson({ password: PASSWORD });
			const email = (await stored(Target.id)).email;
			const { userkey } = await factories.session.create({ person: Target.id, su: Admin.id });

			const res = await patch(userkey, { email: newAddress(), currentPassword: PASSWORD }).expect(403);

			expect(res).toBeProblemResponse(403);
			await unchanged(Target.id, email);
			await patch(userkey, { first: 'Avery' }).expect(200);
		});

		it('stops after 10 wrong passwords, even for the right one, while saves without a password go on', async () => {
			const { userkey } = await newPerson({ password: PASSWORD });

			for (let attempt = 0; attempt < 10; attempt++) {
				await patch(userkey, { email: newAddress(), currentPassword: 'wrong' }).expect(403);
			}

			expect(await patch(userkey, { email: newAddress(), currentPassword: PASSWORD }).expect(429)).toBeProblemResponse(429);
			await patch(userkey, { first: 'Avery' }).expect(200);
		});
	});

	describe('POST /v1/user/profile/password', () => {
		const PASSWORD = 'current-pass-123';
		const NEXT = 'a-brand-new-pass';

		const change = (userkey: string, body: object) => request(server).post('/v1/user/profile/password').asPerson(userkey).send(body);
		const next = (newPassword: string) => ({ currentPassword: PASSWORD, newPassword, repeatPassword: newPassword });
		const sessionsOf = async (id: number) => (await db.selectFrom('session').select('userkey').where('person', '=', id).execute())
			.map(session => session.userkey);

		beforeEach(() => {
			addJobs.mockReset().mockResolvedValue(undefined);
		});

		it('stores the new password as classic does, lifts a required change, retires reset links, and ends every other session', async () => {
			const { id, userkey } = await newPerson({
				password: PASSWORD,
				no_email: 1,
				settings: { force_password_change: 1, pass_changekey: 'ABC123', pass_change_expires: '2026-11-17 12:00:00' },
			});
			const other = await factories.session.create({ person: id });
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const su = await factories.session.create({ person: id, su: Admin.id });
			const info = vi.spyOn(logger, 'info');

			await change(userkey, next(NEXT)).expect(204);

			const person = await personRepo.getPerson(db, id, { settings: ['force_password_change', 'pass_changekey', 'pass_change_expires'] });
			expect(person?.password).toMatch(/^\$6\$/);
			expect(verifyPassword(NEXT, person!.password!)).toBe(true);
			expect(verifyPassword(PASSWORD, person!.password!)).toBe(false);
			expect(Math.abs(person!.pass_timestamp!.getTime() - Date.now())).toBeLessThan(5000);
			expect(person?.settings ?? {}).toEqual({});

			// An admin's su session stays: it was never opened with the person's password
			expect((await sessionsOf(id)).sort()).toEqual([userkey, su.userkey].sort());
			await request(server).get('/v1/user/profile').asPerson(other.userkey).expect(401);
			await request(server).get('/v1/user/profile').asPerson(userkey).expect(200);

			// Account mail: sent even to someone opted out, ahead of any blast, and kept out of the inbox
			const [job] = emailJobs();
			expect(job.data).toMatchObject({ kind: 'account' });
			expect(job.opts).not.toHaveProperty('priority');
			const [notice] = await db.selectFrom('message').select(['subject', 'visible_at']).where('person', '=', id).execute();
			expect(notice).toEqual({ subject: 'Your Tabroom.com password has been changed', visible_at: null });

			expect(info).toHaveBeenCalledWith(expect.any(String), { 'event.name': 'account.password.changed', person: id });
			expect(JSON.stringify(info.mock.calls)).not.toContain(NEXT);
		});

		it('takes a current password hashed by classic\'s Perl crypt', async () => {
			const { id, userkey } = await newPerson();
			// perl -e 'print crypt("classic-pass-123", q{$6$tabroomfixture$})'
			await db.updateTable('person')
				.set({ password: '$6$tabroomfixture$ivQCjxsQ.RlAsFy/l7FM04DA0gUR1f/anFf/hL1S/lnxRnEcsSikV/fKWFtSCOCzQIcnhdktaXbhcfVX6i0hJ1' })
				.where('id', '=', id)
				.execute();

			await change(userkey, { currentPassword: 'classic-pass-123', newPassword: NEXT, repeatPassword: NEXT }).expect(204);

			expect(verifyPassword(NEXT, (await stored(id)).password!)).toBe(true);
		});

		it('still changes the password when the notice can\'t be queued', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			addJobs.mockRejectedValue(new Error('Job queues are not connected to Redis'));
			const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);

			await change(userkey, next(NEXT)).expect(204);

			expect(verifyPassword(NEXT, (await stored(id)).password!)).toBe(true);
			expect(error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ 'event.name': 'account.password.notice.exception' }));
		});

		it('refuses a wrong current password, and an account that has none', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const before = (await stored(id)).password;
			const other = await factories.session.create({ person: id });

			const res = await change(userkey, { ...next(NEXT), currentPassword: 'not-the-password' }).expect(403);

			expect(res).toBeProblemResponse(403);
			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['currentPassword'], message: 'That password isn\'t right' })]);
			expect((await stored(id)).password).toBe(before);
			expect(await sessionsOf(id)).toContain(other.userkey);
			expect(emailJobs()).toEqual([]);

			// A one-time-code login has no password to give; it sets one through "forgot password"
			const passwordless = await newPerson();
			await db.updateTable('person').set({ password: null }).where('id', '=', passwordless.id).execute();
			await change(passwordless.userkey, next(NEXT)).expect(403);
			expect((await stored(passwordless.id)).password).toBeNull();
		});

		it.each([
			['is the current one', PASSWORD, 'newPassword'],
			['is under 8 characters', 'short12', 'newPassword'],
			['holds a banned word in any case', 'MyDebate1', 'newPassword'],
			['holds another banned word', 'INTERPrules', 'newPassword'],
			['starts or ends with a space', ' a-brand-new-pass', 'newPassword'],
		])('refuses a new password that %s', async (_case, newPassword, field) => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const before = (await stored(id)).password;

			const res = await change(userkey, next(newPassword)).expect(400);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: [field] })]);
			expect((await stored(id)).password).toBe(before);
		});

		it('refuses a new password that is the person\'s email or full name, in any case', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD, first: 'Avery', last: 'Stonebridge' });
			const { email, password: before } = await stored(id);

			for (const newPassword of [email.toUpperCase(), 'avery stonebridge']) {
				const res = await change(userkey, next(newPassword)).expect(400);
				expect(res.body.issues).toEqual([expect.objectContaining({ path: ['newPassword'] })]);
			}
			expect((await stored(id)).password).toBe(before);
		});

		it('refuses a repeat that doesn\'t match', async () => {
			const { id, userkey } = await newPerson({ password: PASSWORD });
			const before = (await stored(id)).password;

			const res = await change(userkey, { currentPassword: PASSWORD, newPassword: NEXT, repeatPassword: `${NEXT}!` }).expect(400);

			expect(res.body.issues).toEqual([expect.objectContaining({ path: ['repeatPassword'] })]);
			expect((await stored(id)).password).toBe(before);
		});

		it('refuses while su\'d, changing nothing and not counting against the person', async () => {
			const Admin = await factories.person.create({ site_admin: 1 });
			personIds.push(Admin.id);
			const Target = await newPerson({ password: PASSWORD });
			const before = (await stored(Target.id)).password;
			const { userkey } = await factories.session.create({ person: Target.id, su: Admin.id });

			for (let attempt = 0; attempt < 11; attempt++) {
				expect(await change(userkey, next(NEXT)).expect(403)).toBeProblemResponse(403);
			}

			expect((await stored(Target.id)).password).toBe(before);
			await change(Target.userkey, next(NEXT)).expect(204);
		});

		it('stops after 10 wrong passwords, even for the right one, counted together with email changes', async () => {
			const { userkey } = await newPerson({ password: PASSWORD });

			for (let attempt = 0; attempt < 5; attempt++) {
				await change(userkey, { ...next(NEXT), currentPassword: 'wrong' }).expect(403);
				await patch(userkey, { email: `rate.${attempt}.${Date.now()}@example.org`, currentPassword: 'wrong' }).expect(403);
			}

			expect(await change(userkey, next(NEXT)).expect(429)).toBeProblemResponse(429);
		});
	});
});
