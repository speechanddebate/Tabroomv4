<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { SaveBar } from '$lib/components/forms';

	// Sticks to the bottom of the screen at the end of a form; Save changes is the form's submit
	const { Story } = defineMeta({
		title     : 'Components/Forms/SaveBar',
		component : SaveBar,
	});
</script>

<Story name="All saved" asChild>
	<SaveBar changes={0} ondiscard={() => {}} />
</Story>

<Story name="Unsaved changes" asChild>
	<SaveBar changes={3} ondiscard={() => {}} />
</Story>

<Story name="Saving" asChild>
	<SaveBar changes={3} ondiscard={() => {}} saving />
</Story>
