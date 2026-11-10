import { personName } from '$lib/helpers/text';

describe('personName', () => {
	it('joins first and last, trims a missing part, and is empty when both are missing', () => {
		expect(personName({ first: 'Quinn', last: 'Quill' })).toBe('Quinn Quill');
		expect(personName({ first: null, last: 'Quill' })).toBe('Quill');
		expect(personName({ first: 'Quinn' })).toBe('Quinn');
		expect(personName({ first: null, last: null })).toBe('');
	});
});
