<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { HttpResponse, http } from 'msw';
	import type { Problem } from '@tabroom/types';
	import { Checkbox, FormProblem, SaveBar, Select, TextInput } from '#lib/components/forms/index.ts';
	import { createDraft } from '#lib/helpers/draft.svelte.ts';
	import { fieldErrors } from '#lib/helpers/forms.ts';

	// Every form component together, wired the way a page does: a Draft for the values, a
	// SaveBar to submit, and a Problem's issues landing on their fields
	const { Story } = defineMeta({
		title: 'Components/Forms/Form',
	});

	const rejected: Problem = {
		type   : 'about:blank',
		title  : 'Request Validation Failed',
		status : 400,
		detail : 'Invalid request body',
		issues : [
			{ path: ['last'], code: 'invalid_format', message: 'Names can\'t contain digits' },
			{ path: ['phone'], code: 'custom', message: 'That phone number is in use' },
		],
	};

	const states = [
		{ label: 'United States', options: [{ value: 'IA', label: 'Iowa' }, { value: 'NY', label: 'New York' }] },
		{ label: 'Other', options: [{ value: '', label: 'N/A' }] },
	];
</script>

<script lang="ts">
	const draft = createDraft({ first: 'Avery', last: 'Okafor', phone: '5155551234', state: 'IA', noEmail: false });
	let problem: Problem | null = $state(null);
	let saving = $state(false);

	const errors = $derived(fieldErrors(problem));

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		saving = true;
		const sent = draft.changed;
		const response = await fetch('/story/profile', { method: 'PATCH', body: JSON.stringify(sent) });
		saving = false;
		problem = response.ok ? null : await response.json();
		if (response.ok) {
			draft.commit(sent);
		}
	};
</script>

<Story
	name="Submit with field errors"
	asChild
	parameters={{
		msw: {
			handlers: [http.patch('*/story/profile', () => HttpResponse.json(rejected, { status: 400 }))],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText(/Last name/), '2');
		await expect(canvas.getByText('1 unsaved change')).toBeInTheDocument();
		await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));
		await canvas.findByText('Names can\'t contain digits');

		const lastName = canvas.getByLabelText(/Last name/);
		await expect(lastName).toBeInvalid();
		await expect(lastName).toHaveAccessibleDescription('Names can\'t contain digits');

		const phoneInput = canvas.getByLabelText('Phone');
		await expect(phoneInput).toBeInvalid();
		await expect(phoneInput).toHaveAccessibleDescription('That phone number is in use');

		await expect(canvas.getByLabelText(/First name/)).not.toBeInvalid();
		await expect(canvas.getByLabelText('State')).not.toBeInvalid();
		// Every issue named a field, so there's no box above the form, and the edit is still unsaved
		await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
		await expect(canvas.getByText('1 unsaved change')).toBeInTheDocument();
	}}
>
	<form class="flex max-w-sm flex-col gap-4" onsubmit={submit}>
		<FormProblem {problem} />
		<TextInput error={errors.first} label="First name" required bind:value={draft.values.first} />
		<TextInput error={errors.last} label="Last name" required bind:value={draft.values.last} />
		<TextInput autocomplete="tel" error={errors.phone} label="Phone" type="tel" bind:value={draft.values.phone} />
		<Select error={errors.state} label="State" options={states} bind:value={draft.values.state} />
		<Checkbox label="Don't send me email" bind:checked={draft.values.noEmail} />
		<SaveBar changes={draft.changes} ondiscard={() => { draft.discard(); problem = null; }} {saving} />
	</form>
</Story>
