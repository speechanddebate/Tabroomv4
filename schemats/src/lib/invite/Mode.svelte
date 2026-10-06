<script lang='ts'>

	let { row } = $props();

	import { Laptop, Users, Blend } from '@lucide/svelte';

</script>

	<div class='flex w-full text-center justify-around m-0'>

		{#if row.inPerson}
			<span
				class = "w-1/3 text-primary-strong
					hover:bg-primary-strong hover:text-white
					py-1"
				title = "{ row.inPerson } event{ row.inPerson > 1 ? 's are' : ' is' } in person"
			>
				<Users class='m-auto size-3' />
				<span class='hidden'>
					In Person
				</span>
			</span>
		{/if}

		{#if row.online}
			<span
				class = "
					w-1/3 text-danger
					hover:bg-danger hover:text-white
					py-1"
				title = "{ row.online } event{ row.online > 1 ? 's are' : ' is' } online"
			>
				<Laptop class='m-auto size-3' />
				<span class='hidden'>
					Online
				</span>
			</span>
		{/if}

		{#if row.hybrid}
			<span
				class = "
					w-1/3 text-tertiary
					hover:bg-tertiary hover:text-white
					py-1"
				title = "{ row.hybrid } event{ row.hybrid > 1 ? 's are' : ' is' } hybrid"
			>
				<Blend class='m-auto size-3' />
				<span class='hidden'>
					Hybrid
				</span>
			</span>
		{/if}

	</div>