import request from 'supertest';
import server from '../../../../app';
import factories from '../../../../tests/factories';

describe('Attendee Search Function', () => {

	let userkey;

	beforeAll(async () => {
		const session = await factories.session.create({
			Person: {
				site_admin: true,
			},
		});
		userkey = session.userkey;
	});

	it('Searches for tournament attendees by name', async () => {

		const searchNavy = 'Navy';

		// I may have overly committed to the bit there

		const manOverboard = await request(server)
			.get(`/v1/tab/tourns/29774/all/search/${searchNavy}`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		const lifePreserver = manOverboard.body;

		expect(lifePreserver, 'Object returned').toBeTypeOf('object');
		expect(lifePreserver.exactMatches, 'Array of exact matches found').toBeInstanceOf(Array);
		expect(lifePreserver.partialMatches, 'Array of partial matches found').toBeInstanceOf(Array);

		expect(lifePreserver.partialMatches[0].id, 'ID of partial match is a number').toBeTypeOf('number');
		expect(lifePreserver.partialMatches[0].name, 'Name of partial match is a string').toBeTypeOf('string');

		expect(lifePreserver.exactMatches[0].id, 'ID of exact matches is a number').toBeTypeOf('number');
		expect(lifePreserver.exactMatches[0].id, 'Exact match ID is correct').toBe(651034);
		expect(lifePreserver.exactMatches[0].name, 'Exact match name is correct').toBe('Navy');
		expect(lifePreserver.exactMatches[0].tag, 'Exact match tag is correct').toBe('school');

		expect(lifePreserver.partialMatches[0].id, 'Partial match ID is correct').toBe(1400939);
		expect(lifePreserver.partialMatches[0].tag, 'Partial match tag is correct').toBe('entry');

		// Search for an individual in that same tournament and BONUS ROUND!
		// make sure the special character doesn't mess with us

		const searchDaisy = 'O\'Gorman';

		const resDVOG = await request(server)
			.get(`/v1/tab/tourns/29774/all/search/${searchDaisy}`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(resDVOG.body, 'Object returned').toBeTypeOf('object');
		expect(resDVOG.body.exactMatches, 'Array of exact matches found').toBeInstanceOf(Array);
		expect(resDVOG.body.partialMatches, 'Array of partial matches is empty').toEqual([]);
		expect(resDVOG.body.exactMatches[0].first, 'Name match found for exact match').toBe('Danielle');
		expect(resDVOG.body.exactMatches[0].tag, 'Exact match tag is correct').toBe('judge');

	});
});
