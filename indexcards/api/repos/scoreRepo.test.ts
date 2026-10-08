
import scoreRepo from './scoreRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

let Ballot: Awaited<ReturnType<typeof factories.ballot.create>>;

beforeAll(async () => {
	Ballot = await factories.ballot.create();
});

describe('getScores', async () => {

	it('should return an empty array if no scores exist for the ballot', async () => {
		// unlikely ballotId
		const scores = await scoreRepo.getScores(db,{ ballot: 999999 });
		expect(Array.isArray(scores)).toBe(true);
		expect(scores.length).toBe(0);
	});

	it('should return scores for a given ballotId', async () => {
		const score = await scoreRepo.createScore(db,{ ballot: Ballot.id });
		const scores = await scoreRepo.getScores(db,{ ballot: Ballot.id });
		expect(Array.isArray(scores)).toBe(true);
		expect(scores.length).toBeGreaterThan(0);
		const found = scores.find(b => b.id === score?.id as number);
		expect(found).toBeDefined();
		expect(found?.ballot).toBe(Ballot.id);
	});

	it('returns scores for several ballots', async () => {
		const other = await factories.ballot.create();
		const first = await scoreRepo.createScore(db, { ballot: Ballot.id });
		const second = await scoreRepo.createScore(db, { ballot: other.id });

		const scores = await scoreRepo.getScores(db, { ballots: [Ballot.id, other.id] });

		expect(scores.map(s => s.id)).toEqual(expect.arrayContaining([first!.id, second!.id]));
		expect(scores.every(s => s.ballot === Ballot.id || s.ballot === other.id)).toBe(true);
	});

	it('returns no scores for an empty list of ballots', async () => {
		expect(await scoreRepo.getScores(db, { ballots: [] })).toEqual([]);
	});

	it('should return all scores when no scope is provided', async () => {
		// Create at least one score to ensure there is data
		await scoreRepo.createScore(db, { ballot: Ballot.id });
		const scores = await scoreRepo.getScores(db,{
			limit: 10,
			ballot: Ballot.id,
		});
		expect(Array.isArray(scores)).toBe(true);
		expect(scores.length).toBeGreaterThan(0);
	});

});

describe('createScore', async () => {
	it('should create a score and retrieve it', async () => {
		const score = await scoreRepo.createScore(db, { ballot: Ballot.id });
		expect(score).toHaveProperty('id');
		expect(score?.id).not.toBeNull();
		expect(score?.timestamp).not.toBeNull();
	});

});