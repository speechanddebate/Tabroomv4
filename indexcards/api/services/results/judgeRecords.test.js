import factories from '../../../tests/factories/index.js';
import { judgeRecord } from './judgeRecords';
describe('Judge Record Service', async () => {
	let personId,judgeId, tournId, roundId, panelId, eventId;
	let entryId;
	beforeAll(async () => {
		({ id: personId } = await factories.person.create());
		({ id: judgeId } = await factories.judge.create({ person: personId }));
		({ id: tournId } = await factories.tourn.create({ hidden: 0 })); //public tourn
		({ id: eventId } = await factories.event.create({ tourn: tournId }));
		({ id: roundId } = await factories.round.create({
			event: eventId,
			published: true,
			post_primary: 3,
		})); //published round with public primary results
		({ id: panelId } = await factories.panel.create({ round: roundId }));
		({ id: entryId } = await factories.entry.create({
			event: eventId,
			tourn: tournId,
			code: 'AFF1',
		}));
	});
	it('returns the public judging record of a person', async () => {
		const Ballot = await factories.ballot.create({
			panel: panelId,
			judge: judgeId,
			entry: entryId,
			side: 1,
		});
		const { Score } = await factories.score.create({
			ballot: Ballot.id,
			tag: 'winloss',
			value: 1,
		});
		const res = await judgeRecord(personId);

		expect(Score.id).toBeDefined();
		expect(Array.isArray(res)).toBe(true);
		expect(res.length).toBeGreaterThan(0);
		expect(res[0].affTeam).toBe('AFF1');
	});
});