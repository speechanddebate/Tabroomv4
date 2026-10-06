<script lang='ts'>

	// A component to show a sidebar link with standard formatting

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	let input = $props();

</script>

	{#if input.mailto}
		<a
			class = 'blue full bg-surface-alt text-xs
				border-s-2 border-primary
				border-y-1 border-y-border
				hover:bg-accent-soft
				${ input.linkClass }
			'
			href = 'mailto:{ input.email }'
		>
			{input.linkText || `Email ${input.email}` }
		</a>
	{:else if input.url}
		<a
			class = 'blue full bg-surface-alt text-xs
				border-s-2 border-primary
				border-y-1 border-y-border
				hover:bg-accent-soft
				${ input.linkClass }
			'
			href = '{input.url}'
		>
			{input.linkText || input.url }
		</a>
	{:else if input.location}
		<a
			class = '
				{ page.url.pathname === input.location
					? 'bg-primary-strong text-accent-soft hover:text-text hover:bg-accent'
					: 'bg-surface-alt text-text hover:bg-accent-soft'
				}
				blue full text-xs
				border-s-2 border-primary
				border-y-1 border-y-border
				${ input.linkClass }
			'
			href = {resolve(input.location,{})}
		>
			{input.linkText || input.location }
		</a>
	{/if}