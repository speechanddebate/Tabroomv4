import { createDraft } from './draft.svelte';

const profile = () => ({ first: 'Avery', last: 'Okafor', noEmail: false, custom: [['1', '4']] });

describe('Draft', () => {
	it('starts with no changes', () => {
		const draft = createDraft(profile());

		expect(draft.changes).toBe(0);
		expect(draft.changed).toEqual({});
	});

	it('counts each changed field once, including nested values', () => {
		const draft = createDraft(profile());
		draft.values.first = 'Ava';
		draft.values.noEmail = true;
		draft.values.custom[0][1] = '5';

		expect(draft.changes).toBe(3);
		expect(draft.changed).toEqual({ first: 'Ava', noEmail: true, custom: [['1', '5']] });
	});

	it('stops counting a field typed back to its saved value', () => {
		const draft = createDraft(profile());
		draft.values.first = 'Ava';
		draft.values.first = 'Avery';

		expect(draft.changes).toBe(0);
	});

	it('discards back to the saved values', () => {
		const draft = createDraft(profile());
		draft.values.last = 'Okafor-Smith';
		draft.discard();

		expect(draft.values.last).toBe('Okafor');
		expect(draft.changes).toBe(0);
	});

	it('commits only what was sent, so edits made during the save stay unsaved', () => {
		const draft = createDraft(profile());
		draft.values.first = 'Ava';
		const sent = draft.changed;
		draft.values.last = 'Smith';
		draft.commit(sent);

		expect(draft.saved.first).toBe('Ava');
		expect(draft.changed).toEqual({ last: 'Smith' });
	});

	it('shows the stored form of a sent field, but keeps an edit made during the save', () => {
		const draft = createDraft(profile());
		draft.values.first = '  Ava ';
		draft.values.last = 'smith';
		const sent = draft.changed;
		draft.values.last = 'Smith';
		draft.commit(sent, { first: 'Ava', last: 'smith' });

		expect(draft.values.first).toBe('Ava');
		expect(draft.saved.first).toBe('Ava');
		expect(draft.values.last).toBe('Smith');
		expect(draft.changed).toEqual({ last: 'Smith' });
	});

	it('takes only the sent fields from stored, so a server-side change isn\'t an unsaved change', () => {
		const draft = createDraft(profile());
		draft.values.first = 'Ava';
		draft.commit(draft.changed, { ...profile(), first: 'Ava', last: 'Changed elsewhere' });

		expect(draft.saved.last).toBe(profile().last);
		expect(draft.changes).toBe(0);
	});

	it('resets both copies to new saved values', () => {
		const draft = createDraft(profile());
		draft.values.first = 'Ava';
		draft.reset({ ...profile(), first: 'Jordan' });

		expect(draft.values.first).toBe('Jordan');
		expect(draft.changes).toBe(0);
	});

	it('keeps its own copy of the starting values', () => {
		const start = profile();
		const draft = createDraft(start);
		draft.values.first = 'Ava';
		draft.commit(draft.changed);

		expect(start.first).toBe('Avery');
	});
});
