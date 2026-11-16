/**
 * A form's saved values beside the values being edited, for SaveBar and a PATCH of only what changed:
 *
 *   const draft = createDraft(profile);
 *   <TextInput bind:value={draft.values.first} />
 *   <SaveBar changes={draft.changes} ondiscard={() => draft.discard()} />
 *
 *   const sent = draft.changed;
 *   if (await save(sent)) draft.commit(sent);
 *
 * Fields compare by value, so an edit typed back to the saved value no longer counts. commit takes
 * what was sent rather than the current values, so anything typed while the save was in flight
 * stays unsaved.
 */
export class Draft<T extends Record<string, unknown>> {
	saved = $state() as T;
	values = $state() as T;

	/** Only the fields whose value differs from the saved one */
	changed: Partial<T> = $derived.by(() => {
		const values = $state.snapshot(this.values) as T;
		const saved = $state.snapshot(this.saved) as T;
		return Object.fromEntries(
			Object.keys(values)
				.filter(key => JSON.stringify(values[key]) !== JSON.stringify(saved[key]))
				.map(key => [key, values[key]]),
		) as Partial<T>;
	});

	changes = $derived(Object.keys(this.changed).length);

	constructor(saved: T) {
		this.saved = structuredClone(saved);
		this.values = structuredClone(saved);
	}

	discard() {
		this.values = structuredClone($state.snapshot(this.saved) as T);
	}

	/**
	 * After a save succeeds: the fields that were sent become saved. Pass `stored` when the server
	 * keeps a field in another form than it was typed ("+1 (555) 123-4567" stored as 5551234567);
	 * a field still showing what was sent then shows the stored form, and one edited again while
	 * the save was in flight keeps the edit. Only the sent fields are taken from `stored`, so a field
	 * that changed on the server meanwhile doesn't turn into an unsaved change.
	 */
	commit(sent: Partial<T>, stored: Partial<T> = sent) {
		const values = $state.snapshot(this.values) as T;
		const saved = { ...($state.snapshot(this.saved) as T) };
		for (const key of Object.keys(sent) as (keyof T)[]) {
			const kept = structuredClone(key in stored ? stored[key] : sent[key]) as T[keyof T];
			if (JSON.stringify(values[key]) === JSON.stringify(sent[key])) {
				this.values[key] = kept;
			}
			saved[key] = structuredClone(kept);
		}
		this.saved = saved;
	}

	/** Replaces both copies, e.g. with the server's values after a refetch */
	reset(saved: T) {
		this.saved = structuredClone(saved);
		this.values = structuredClone(saved);
	}
}

export const createDraft = <T extends Record<string, unknown>>(saved: T) => new Draft(saved);
