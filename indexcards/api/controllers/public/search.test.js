import request from 'supertest';
import server from '../../../app';

describe('Tournament Search Function', () => {

	// A string based search will always be imprecise in terms of numbers of
	// results and all I really care about is whether it works and delivers
	// valid results, so instead of searching against test data here I'm just
	// picking a super generic term and making sure I got back answers.  So, I
	// just search for NCFL Grand Nationals since it will yield both exact and
	// partial matches.

	it('Searches for tournaments by name', async () => {

		const searchParam = 'NCFL Grand';

		const res = await request(server)
			.get(`/v1/public/search/all/${searchParam}`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body, 'Object returned').toBeTypeOf('object');
		expect(res.body.exactMatches, 'Array of exact matches found').toBeInstanceOf(Array);
		expect(res.body.partialMatches, 'Array of partial matches found').toBeInstanceOf(Array);

		expect(res.body.partialMatches[0].id, 'ID of partial match is a number').toBeTypeOf('number');
		expect(res.body.partialMatches[0].name, 'Name of partial match is a string').toBeTypeOf('string');
		expect(res.body.partialMatches[0].webname, 'Exact match webname clears').toBe('ncfl');
	});
});
