import request from 'supertest';
import server from '../../../../../app.js';

describe('GET /entries/:entryId/records', () => {
	it('Returns 401 to a logged-out caller', async () => {
		expect(await request(server).get(`/v1/rest/tourns/31059/entries/1/records`)).toBeProblemResponse(401);
	});
});
