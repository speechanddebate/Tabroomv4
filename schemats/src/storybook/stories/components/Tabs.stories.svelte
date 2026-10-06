<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Tabs, TabItem } from '../../../lib/components/Tabs';

	// Story children are passed to Tabs as its children, so each story lists
	// only the TabItems.
	const { Story } = defineMeta({
		title: 'Components/Tabs',
		component: Tabs,
	});
</script>

<Story name="Panels" args={{ label: 'Tournament details' }}>
	<TabItem title="Tab 1">Tab 1 content</TabItem>
	<TabItem open title="Tab 2">Tab 2 content</TabItem>
	<TabItem title="Tab 3">Tab 3 content</TabItem>
	<TabItem disabled title="Tab 4" tooltip="Tab 4 tooltip">Tab 4 content</TabItem>
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
	<TabItem disabled href="/invite/nats/rounds" title="Disabled" tooltip="Tooltip" />
</Story>
