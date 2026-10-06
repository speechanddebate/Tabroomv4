<script lang="ts">
	import type { ParadigmSearchResult } from '$indexcards/schemas';

	let {
		item,
		href,
		onselect,
	}: {
		item: ParadigmSearchResult;
		href?: string;
		// Called when the "View Paradigm" link is clicked.
		onselect?: () => void;
	} = $props();
</script>

<div
	class="
		group
		relative
		rounded-lg
		border border-border
		bg-surface
		shadow-sm
		transition-all
		duration-200
		hover:shadow-lg
		hover:border-border-strong
		overflow-hidden"
>
	<!-- Header with action button -->
	<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-4 sm:p-5 pb-3 sm:pb-3">
		<div class="flex-1 min-w-0">
			<h3 class="text-base sm:text-lg md:text-xl font-semibold text-text truncate">
				{item.name}
			</h3>
		</div>
		<a
			class="
				shrink-0
				px-3
				py-1.5
				sm:px-4
				sm:py-2
				text-xs
				sm:text-sm
				font-medium
				rounded-md
				bg-primary-strong
				text-white
				transition-colors
				hover:bg-primary-deep
				active:bg-primary-deep
				whitespace-nowrap
				cursor-pointer"
			aria-label="View Paradigm for {item.name}"
			href={href}
			onclick={onselect}
		>
			View Paradigm
		</a>
	</div>

	<!-- Content area -->
	<div class="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
		<!-- Tournament stats -->
		{#if item.tournJudged !== undefined && item.tournJudged !== null}
			<div class="flex items-center gap-2">
				<div class="flex-shrink-0 w-1 h-1 bg-border-strong rounded-full"></div>
				<p class="text-xs sm:text-sm text-muted">
					Judged at <span class="font-semibold text-text">{item.tournJudged}</span>
					tournament{item.tournJudged !== 1 ? 's' : ''}
				</p>
			</div>
		{/if}

		<!-- Schools -->
		{#if item.schools && item.schools.length > 0}
			<div class="space-y-2">
				<p class="text-xs sm:text-sm font-semibold text-text">Has judged for:</p>
				<div class="flex flex-wrap gap-2">
					{#each item.schools as school, i (item.id + '-' + i)}
						<span class="
							inline-flex
							items-center
							rounded-full
							bg-primary-soft
							px-2.5
							sm:px-3
							py-1
							text-xs
							sm:text-sm
							font-medium
							text-primary-strong
							border border-primary-soft
							transition-colors
							group-hover:border-primary
						">
							{school.name}
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>