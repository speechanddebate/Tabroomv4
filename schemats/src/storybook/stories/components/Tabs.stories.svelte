<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import { Tabs, TabItem } from '../../../lib/components/Tabs';

	// Story children are passed to Tabs as its children, so each story lists
	// only the TabItems.
	const { Story } = defineMeta({
		title: 'Components/Tabs',
		component: Tabs,
	});

	// Stories that drive the tab strip, which only shows from sm up
	const wide = { viewport: { value: 'desktop', isRotated: false } };
</script>

<Story name="Panels" args={{ label: 'Tournament details' }}>
	<TabItem title="Tab 1">Tab 1 content</TabItem>
	<TabItem open title="Tab 2">Tab 2 content</TabItem>
	<TabItem title="Tab 3">Tab 3 content</TabItem>
	<TabItem disabled title="Tab 4" tooltip="Tab 4 tooltip">Tab 4 content</TabItem>
</Story>

<!-- One selected and one unselected tab with an alert -->
<Story
	name    = "Alerts"
	args    = {{ label: 'Tournament details' }}
	globals = {wide}
	play    = {async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('tab', { name: 'Entries (needs attention)' })).toBeInTheDocument();
		await expect(canvas.getByRole('tab', { name: 'Judges (needs attention)' })).toBeInTheDocument();
	}}
>
	<TabItem title="Invite">Invite content</TabItem>
	<TabItem alert open title="Entries">Entries content</TabItem>
	<TabItem alert title="Judges">Judges content</TabItem>
	<TabItem title="Pairings">Pairings content</TabItem>
</Story>

<!-- Arrows move focus without selecting; Enter selects. Disabled tabs take focus but not selection. -->
<Story
	name    = "Panels Keyboard"
	args    = {{ label: 'Tournament details', onchange: fn() }}
	globals = {wide}
	play    = {async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const [first, second, , disabled] = canvas.getAllByRole('tab');

		await userEvent.tab();
		await expect(first).toHaveFocus();
		await userEvent.keyboard('{ArrowRight}');
		await expect(second).toHaveFocus();
		await expect(first).toHaveAttribute('aria-selected', 'true');
		await expect(args.onchange).not.toHaveBeenCalled();

		await userEvent.keyboard('{Enter}');
		await expect(second).toHaveAttribute('aria-selected', 'true');
		await expect(args.onchange).toHaveBeenCalledWith('Tab 2');
		await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Tab 2 content');

		await userEvent.keyboard('{End}');
		await expect(disabled).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		await expect(second).toHaveAttribute('aria-selected', 'true');

		await userEvent.keyboard('{Home}');
		await expect(first).toHaveFocus();
		await userEvent.keyboard('{ArrowLeft}');
		await expect(disabled).toHaveFocus();
	}}
>
	<TabItem title="Tab 1">Tab 1 content</TabItem>
	<TabItem title="Tab 2">Tab 2 content</TabItem>
	<TabItem title="Tab 3">Tab 3 content</TabItem>
	<TabItem disabled title="Tab 4" tooltip="Tab 4 tooltip">Tab 4 content</TabItem>
</Story>

<!-- onchange fires when the user picks another tab, not for the first selection -->
<Story
	name    = "Panels On Change"
	args    = {{ label: 'Tournament details', onchange: fn() }}
	globals = {wide}
	play    = {async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await expect(args.onchange).not.toHaveBeenCalled();
		await userEvent.click(canvas.getByRole('tab', { name: 'Tab 2' }));
		await expect(args.onchange).toHaveBeenCalledWith('Tab 2');
	}}
>
	<TabItem title="Tab 1">Tab 1 content</TabItem>
	<TabItem title="Tab 2">Tab 2 content</TabItem>
</Story>

<!-- Below sm the strip becomes a menu. Picking a row selects its panel and closes the menu. -->
<Story
	name    = "Panels Phone Width"
	args    = {{ label: 'Tournament details', onchange: fn() }}
	globals = {{ viewport: { value: 'mobile2', isRotated: false } }}
	play    = {async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const button = canvas.getByRole('button', { name: /Tournament details: Entries/ });
		await expect(button).toHaveAccessibleName(/another section needs attention/);

		await userEvent.click(button);
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await expect(canvas.getByText('Opens after pairings')).toBeVisible();
		await expect(canvas.getByRole('button', { name: /Results/ })).toBeDisabled();

		await userEvent.click(canvas.getByRole('button', { name: /^Judges/ }));
		await expect(args.onchange).toHaveBeenCalledWith('Judges');
		await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Judges content');
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(button).toHaveFocus();
	}}
>
	<TabItem title="Invite">Invite content</TabItem>
	<TabItem alert open title="Entries">Entries content</TabItem>
	<TabItem alert title="Judges">Judges content</TabItem>
	<TabItem title="Pairings">Pairings content</TabItem>
	<TabItem disabled title="Results" tooltip="Opens after pairings">Results content</TabItem>
</Story>

<!-- Escape closes and returns focus to the button; a press outside closes too -->
<Story
	name    = "Phone Width Closing"
	args    = {{ label: 'Tournament details' }}
	globals = {{ viewport: { value: 'mobile2', isRotated: false } }}
	play    = {async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const button = canvas.getByRole('button', { name: /Tournament details: Tab 1/ });

		await userEvent.click(button);
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await userEvent.keyboard('{Escape}');
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(button).toHaveFocus();

		await userEvent.click(button);
		await userEvent.click(canvas.getByRole('tabpanel'));
		await expect(button).toHaveAttribute('aria-expanded', 'false');
	}}
>
	<TabItem title="Tab 1">Tab 1 content</TabItem>
	<TabItem title="Tab 2">Tab 2 content</TabItem>
</Story>

<Story
	name       = "Links Phone Width"
	args       = {{ label: 'Tournament' }}
	globals    = {{ viewport: { value: 'mobile2', isRotated: false } }}
	parameters = {{
		sveltekit_experimental: {
			state: { page: { url: new URL('http://localhost/invite/nats/events') } },
		},
	}}
	play       = {async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: /Tournament: Events/ }));
		await expect(canvas.getByRole('link', { name: /Events/ })).toHaveAttribute('aria-current', 'page');
		await expect(canvas.getByRole('link', { name: /Disabled/ })).toHaveAttribute('aria-disabled', 'true');
		await expect(canvas.getByText('Opens after pairings')).toBeVisible();
	}}
>
	<TabItem exact href="/tab" title="Tab" />
	<TabItem alert href="/invite/nats/events" title="Events" />
	<TabItem alert href="/invite/nats/judges" title="Judges" />
	<TabItem disabled href="/invite/nats/rounds" title="Disabled" tooltip="Opens after pairings" />
</Story>

<Story
	name       = "Links"
	args       = {{ label: 'Tournament' }}
	parameters = {{
		sveltekit_experimental: {
			state: { page: { url: new URL('http://localhost/invite/nats/events') } },
		},
	}}
>
	<TabItem exact href="/tab" title="Tab" />
	<TabItem exact href="/tooltip" title="Tooltip" tooltip="Tooltip" />
	<TabItem alert href="/invite/nats/events" title="Events" />
	<TabItem disabled href="/invite/nats/rounds" title="Disabled" tooltip="Tooltip" />
</Story>
