import { groupBy } from './objectify.js';

describe('groupBy', () => {
	it('groups rows by a key, keeping their order', () => {
		const groups = groupBy([{ t: 1, n: 'a' }, { t: 2, n: 'b' }, { t: 1, n: 'c' }], (row) => row.t);
		expect([...groups.entries()]).toEqual([[1, [{ t: 1, n: 'a' }, { t: 1, n: 'c' }]], [2, [{ t: 2, n: 'b' }]]]);
	});
});
