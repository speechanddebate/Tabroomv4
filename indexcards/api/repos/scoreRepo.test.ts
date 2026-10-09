
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

describe('createScores', async () => {
	it('creates every score and returns their ids in order', async () => {
		const ballot = await factories.ballot.create();
		const ids = await scoreRepo.createScores(db, [
			{ ballot: ballot.id, tag: 'point', value: 28.5 },
			{ ballot: ballot.id, tag: 'rank', value: 1 },
		]);

		expect(ids).toHaveLength(2);
		const [point, rank] = await Promise.all(ids.map(id => scoreRepo.getScore(db, id)));
		expect(point).toMatchObject({ ballot: ballot.id, tag: 'point', value: 28.5 });
		expect(rank).toMatchObject({ ballot: ballot.id, tag: 'rank', value: 1 });
	});

	it('returns an empty array for no scores', async () => {
		expect(await scoreRepo.createScores(db, [])).toEqual([]);
	});
});

describe('updateScore', async () => {
	it('updates the score and returns its id', async () => {
		const ballot = await factories.ballot.create();
		const score = await scoreRepo.createScore(db, { ballot: ballot.id, tag: 'point', value: 27 });
		const other = await scoreRepo.createScore(db, { ballot: ballot.id, tag: 'rank', value: 2 });

		const id = await scoreRepo.updateScore(db, score!.id, { value: 29 });

		expect(id).toBe(score!.id);
		expect((await scoreRepo.getScore(db, score!.id))?.value).toBe(29);
		expect((await scoreRepo.getScore(db, other!.id))?.value).toBe(2);
	});
});

describe('deleteScores', async () => {
	const setup = async () => {
		const first = await factories.ballot.create();
		const second = await factories.ballot.create();
		const other = await factories.ballot.create();
		const ids = await scoreRepo.createScores(db, [
			{ ballot: first.id, tag: 'winloss', value: 1 },
			{ ballot: first.id, tag: 'point', value: 28 },
			{ ballot: second.id, tag: 'winloss', value: 0 },
			{ ballot: other.id, tag: 'winloss', value: 1 },
		]);
		const [firstWin, firstPoint, secondWin, otherWin] = ids;
		return { first, second, firstWin, firstPoint, secondWin, otherWin };
	};

	it('deletes scores with the given tags on the given ballots and returns true', async () => {
		const { first, second, firstWin, firstPoint, secondWin, otherWin } = await setup();

		expect(await scoreRepo.deleteScores(db, { ballots: [first.id, second.id], tags: ['winloss'] })).toBe(true);

		expect(await scoreRepo.getScore(db, firstWin)).toBeUndefined();
		expect(await scoreRepo.getScore(db, secondWin)).toBeUndefined();
		expect(await scoreRepo.getScore(db, firstPoint)).toBeDefined();
		expect(await scoreRepo.getScore(db, otherWin)).toBeDefined();
	});

	it('deletes every given tag', async () => {
		const { first, firstWin, firstPoint } = await setup();

		expect(await scoreRepo.deleteScores(db, { ballots: [first.id], tags: ['winloss', 'point'] })).toBe(true);

		expect(await scoreRepo.getScores(db, { ballot: first.id })).toEqual([]);
		expect(await scoreRepo.getScore(db, firstWin)).toBeUndefined();
		expect(await scoreRepo.getScore(db, firstPoint)).toBeUndefined();
	});

	it('returns false when no score matches', async () => {
		const { first } = await setup();

		expect(await scoreRepo.deleteScores(db, { ballots: [first.id], tags: ['rank'] })).toBe(false);
	});

	it('returns false and deletes nothing for no ballots or no tags', async () => {
		const { first, firstWin } = await setup();

		expect(await scoreRepo.deleteScores(db, { ballots: [], tags: ['winloss'] })).toBe(false);
		expect(await scoreRepo.deleteScores(db, { ballots: [first.id], tags: [] })).toBe(false);
		expect(await scoreRepo.getScore(db, firstWin)).toBeDefined();
	});
});