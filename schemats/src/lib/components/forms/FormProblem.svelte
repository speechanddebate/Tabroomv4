<script lang="ts">
	import type { Problem } from '@tabroom/types';
	import { CircleAlert } from '@lucide/svelte';

	// A problem with the whole save. When every issue names a field, each Field shows its own
	// message (through fieldErrors) and this stays hidden.
	type Props = {
		problem : Pick<Problem, 'title' | 'detail' | 'issues'> | null | undefined,
		class?  : string,
	};

	let { problem, class: classOverride }: Props = $props();

	let isFieldsOnly = $derived(!!problem?.issues?.length && problem.issues.every(issue => issue.path.length > 0));
</script>

{#if problem && !isFieldsOnly}
	<div
		class={['flex gap-2 rounded border-2 border-danger bg-danger-soft p-3 text-sm text-text', classOverride]}
		role="alert"
	>
		<CircleAlert class="mt-0.5 shrink-0 text-danger" aria-hidden="true" size="16" />
		<div class="flex flex-col gap-0.5">
			<span class="font-semibold">{problem.title}</span>
			{#if problem.detail}
				<span>{problem.detail}</span>
			{/if}
		</div>
	</div>
{/if}
