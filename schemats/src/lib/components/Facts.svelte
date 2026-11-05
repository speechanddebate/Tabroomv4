<script lang="ts" module>
	// A list value puts each item on its own line under the one label
	export type Fact = { label: string, value: string | string[] };
</script>

<script lang="ts">
	// A label and value list, label column sized to the longest label
	const { facts }: { facts: Fact[] } = $props();
</script>

{#if facts.length > 0}
	<dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
		{#each facts as fact (fact.label)}
			<dt class="text-muted">{fact.label}</dt>
			{#if Array.isArray(fact.value)}
				<dd>{#each fact.value as item, idx (idx)}<span class="block">{item}</span>{/each}</dd>
			{:else}
				<dd>{fact.value}</dd>
			{/if}
		{/each}
	</dl>
{/if}
