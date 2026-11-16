import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import logger from '../../../../helpers/logger.js';
import { db } from '../../../../data/database.js';
import { UserProfileSchema } from '@tabroom/types';
import type { UserProfile } from '@tabroom/types';

type PersonOverrides = Parameters<typeof factories.person.create>[0];

// Phone numbers are unique across person, so each test draws its own
const randomPhone = () => `${2 + Math.floor(Math.random() * 8)}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

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
});
