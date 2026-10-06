<script lang='ts'>

	// One tab inside <Tabs>. With an href it's a link to another page;
	// without one, its children are the panel shown when it's selected.
	// Renders nothing itself. It registers with the parent Tabs, which draws
	// the tab strip and the active panel.

	import { onDestroy, type Snippet } from 'svelte';
	import { getTabsContext } from './context';

	type Props = {
		title          : string,
		href?          : string,
		matchPatterns? : string[],
		exact?         : boolean,
		open?          : boolean,
		disabled?      : boolean,
		tooltip?       : string,
		children?      : Snippet,
	};

	let {
		title,
		href,
		matchPatterns,
		exact    = false,
		open     = false,
		disabled = false,
		tooltip,
		children,
	}: Props = $props();

	const id = $props.id();
	const tabs = getTabsContext();

	tabs.register({
		id,
		get title()         { return title; },
		get href()          { return href; },
		get matchPatterns() { return matchPatterns; },
		get exact()         { return exact; },
		get open()          { return open; },
		get disabled()      { return disabled; },
		get tooltip()       { return tooltip; },
		get children()      { return children; },
	});

	onDestroy(() => tabs.unregister(id));

</script>

<!--
@component
A tab inside `<Tabs>`.
@prop title          Tab label
@prop href           Makes this a link tab; children are ignored
@prop matchPatterns  Link tabs: also active when the path contains any of these
@prop exact          Link tabs: active only on an exact href match
@prop open           Panel tabs: select this tab until the user picks another
@prop disabled
@prop tooltip
-->
