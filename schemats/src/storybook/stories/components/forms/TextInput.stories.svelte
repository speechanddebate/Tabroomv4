<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { TextInput } from '$lib/components/forms';

	const { Story } = defineMeta({
		title     : 'Components/Forms/TextInput',
		component : TextInput,
	});
</script>

<Story name="Types" asChild>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput label="City" value="Des Moines" />
		<TextInput autocomplete="email" label="Email" type="email" value="avery@example.com" />
		<TextInput autocomplete="tel" label="Phone" type="tel" value="5155551234" />
		<TextInput autocomplete="current-password" label="Password" type="password" value="correct horse" />
		<TextInput copyable label="Copyable" value="K7Q2M9" />
	</div>
</Story>

<!-- A password field carries its own reveal toggle, which shows only that field -->
<Story
	name="Password"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getAllByRole('button', { name: 'Show password' })[0]);
		await expect(canvas.getByLabelText('Current password')).toHaveAttribute('type', 'text');
		await expect(canvas.getByLabelText('New password')).toHaveAttribute('type', 'password');
	}}
>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput autocomplete="current-password" label="Current password" type="password" value="correct horse" />
		<TextInput autocomplete="new-password" error="Use at least 8 characters" label="New password" type="password" value="short" />
		<TextInput autocomplete="new-password" label="Password (sm, for dense rows)" size="sm" type="password" value="battery staple" />
		<TextInput disabled label="Disabled" type="password" value="battery staple" />
	</div>
</Story>

<!-- The button copies the value and the icon confirms -->
<Story name="Copyable" asChild>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput copyable label="Calendar link" value="https://www.tabroom.com/index/tourn/ical.mhtml?tourn_id=12345" />
		<TextInput copyable description="Share it with your team" label="Team code" size="sm" value="K7Q2M9" />
	</div>
</Story>

<Story name="Sizes" asChild>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput label="Judge name (md, for forms)" type="search" value="Okafor" />
		<TextInput label="Filter this roster (sm, for dense rows)" size="sm" type="search" value="Lind" />
	</div>
</Story>

<!-- An example of what to type, never the label: it disappears once someone types -->
<Story name="Placeholder" asChild>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput label="Search paradigms" placeholder="Winston Smith" type="search" />
		<TextInput inputmode="decimal" label="Bond per judge owed" placeholder="0.00" prefix="$" />
	</div>
</Story>

<Story name="Units" asChild>
	<div class="flex max-w-sm flex-col gap-4">
		<TextInput inputmode="decimal" label="Bond per judge owed" prefix="$" value="50.00" />
		<TextInput inputmode="decimal" label="Rounds owed per entry" suffix="rounds" value="6" />
		<TextInput error="Enter a number" inputmode="decimal" label="Fine per missing round" prefix="$" value="seventy" />
	</div>
</Story>

<Story name="Date and time" asChild>
	<div class="flex flex-wrap gap-2">
		<TextInput class="w-44" label="Judge details due" type="date" value="2026-12-01" />
		<TextInput class="w-36" label="Time" type="time" value="17:00" />
	</div>
</Story>

<!-- For a control whose table column or row already names it -->
<Story name="Hidden label" asChild>
	<div class="w-20">
		<TextInput hideLabel inputmode="decimal" label="Points for Maya Lindqvist" size="sm" value="28.5" />
	</div>
</Story>

<Story name="With description" asChild>
	<div class="max-w-sm">
		<TextInput description="Shown on pairings and ballots" label="Pronouns" value="they/them" />
	</div>
</Story>

<Story name="With error" asChild>
	<div class="max-w-sm">
		<TextInput error="That phone number is in use" label="Phone" type="tel" value="5155551234" />
	</div>
</Story>

<Story name="Disabled" asChild>
	<div class="max-w-sm">
		<TextInput description="Change it below" disabled label="Email" type="email" value="avery@example.com" />
	</div>
</Story>

<Story
	name="At maxlength"
	asChild
	play={async ({ canvasElement }) => {
		const input = within(canvasElement).getByLabelText('ZIP code');
		await userEvent.type(input, '6');
		await expect(input).toHaveValue('50309');
	}}
>
	<div class="max-w-sm">
		<TextInput label="ZIP code" maxlength={5} value="50309" />
	</div>
</Story>
