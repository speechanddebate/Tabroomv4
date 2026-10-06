import request from 'supertest';
import server from '../../../../app';
import factories from '../../../../tests/factories';

describe('User Profile Loader', () => {
	it('Returns correct JSON for a self profile request', async () => {
		const Person = await factories.person.create({site_admin: true});
		const { userkey } = await factories.session.create({ person: Person.id });
		const res = await request(server)
			.get(`/v1/user/profile`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body, 'Response is an object').toBeTypeOf('object');
		expect(res.body.email, 'Correct fake user profile is returned').toBe(Person.email);
		expect(res.body.site_admin, 'Site Admin powers are enabled').toBe(1);
	});

	it('Returns correct JSON for another user profile request', async () => {
		const Person = await factories.person.create({site_admin: true});
		const { userkey } = await factories.session.create({ person: Person.id });
		const res = await request(server)
			.get(`/v1/user/profile/1`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body, 'Response is an object').toBeTypeOf('object');
		expect(res.body.email, 'Email field is present').toEqual(expect.anything());
	});
});
