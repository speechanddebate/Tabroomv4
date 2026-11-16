<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import type { Problem } from '@tabroom/types';
	import { FormProblem } from '$lib/components/forms';

	const { Story } = defineMeta({
		title     : 'Components/Forms/FormProblem',
		component : FormProblem,
	});

	// One issue names a field and one doesn't, so the box shows; with field issues only it would hide
	const validation: Problem = {
		type   : 'about:blank',
		title  : 'Request Validation Failed',
		status : 400,
		detail : 'Invalid request body',
		issues : [
			{ path: ['phone'], code: 'custom', message: 'That phone number is in use' },
			{ path: [], code: 'invalid_type', message: 'Expected an object' },
		],
	};
</script>

<Story name="Title only" asChild>
	<FormProblem problem={{ title: 'Invalid or Missing Credentials' }} />
</Story>

<Story name="Title and detail" asChild>
	<FormProblem problem={{ title: 'Invalid or Missing Credentials', detail: 'That email and password don\'t match an account.' }} />
</Story>

<Story
	name="Validation with an issue on no field"
	asChild
	play={async ({ canvasElement }) => {
		const alert = within(canvasElement).getByRole('alert');
		await expect(alert).toHaveTextContent('Request Validation Failed');
		await expect(alert).not.toHaveTextContent('That phone number is in use');
	}}
>
	<FormProblem problem={validation} />
</Story>
