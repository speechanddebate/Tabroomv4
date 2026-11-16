<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Checkbox } from '$lib/components/forms';

	const { Story } = defineMeta({
		title     : 'Components/Forms/Checkbox',
		component : Checkbox,
	});
</script>

<Story name="Unchecked" asChild>
	<Checkbox label="Don't send me email" />
</Story>

<Story name="Checked" asChild>
	<Checkbox checked label="Don't send me email" />
</Story>

<Story name="With description" asChild>
	<Checkbox description="Messages about your password and email address still come through" label="Don't send me email" />
</Story>

<Story name="Disabled" asChild>
	<div class="flex flex-col gap-3">
		<Checkbox disabled label="Don't send me email" />
		<Checkbox checked disabled label="Don't send me email" />
	</div>
</Story>
