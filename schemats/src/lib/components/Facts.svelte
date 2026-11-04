<script lang="ts" module>
	export type Fact = { label: string, value: string };
</script>

<script lang="ts">
	// A label and value list, label column sized to the longest label
	const { facts }: { facts: Fact[] } = $props();
</script>

{#if facts.length > 0}
	<dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
		{#each facts as fact (fact.label)}
			<dt class="text-muted">{fact.label}</dt>
			<dd>{fact.value}</dd>
		{/each}
	</dl>
{/if}
