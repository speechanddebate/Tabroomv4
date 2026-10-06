<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Check, Download, Printer, Trash2 } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';

	const { Story } = defineMeta({
		title     : 'Components/Button',
		component : Button,
		argTypes  : {
			color    : { control: 'select', options: ['default', 'primary', 'success', 'warning', 'danger', 'tertiary'] },
			variant  : { control: 'select', options: ['solid', 'outline', 'ghost'] },
			size     : { control: 'select', options: ['sm', 'md'] },
			disabled : { control: 'boolean' },
		},
	});

	const colors = ['default', 'primary', 'success', 'warning', 'danger', 'tertiary'] as const;
	const variants = ['solid', 'outline', 'ghost'] as const;
</script>

<Story name="Playground" args={{ color: 'primary', variant: 'solid', size: 'md', disabled: false }}>
	{#snippet template(args)}
		<Button color={args.color} disabled={args.disabled} size={args.size} variant={args.variant}>Publish</Button>
	{/snippet}
</Story>

<Story name="All variants" asChild>
	<div class="flex flex-col gap-3">
		{#each variants as variant (variant)}
			<div class="flex flex-wrap items-center gap-2">
				<span class="w-16 text-xs text-muted">{variant}</span>
				{#each colors as color (color)}
					<Button {color} {variant}>{color}</Button>
				{/each}
			</div>
		{/each}
	</div>
</Story>

<Story name="Icon only" asChild>
	<div class="flex flex-col gap-3">
		{#each variants as variant (variant)}
			<div class="flex flex-wrap items-center gap-2">
				<span class="w-16 text-xs text-muted">{variant}</span>
				{#each colors as color (color)}
					<Button {color} label="{color} {variant}" {variant}><Check size="16" /></Button>
				{/each}
			</div>
		{/each}
	</div>
</Story>

<Story name="Sizes" asChild>
	<div class="flex flex-wrap items-center gap-2">
		<Button color="primary" size="sm">Small</Button>
		<Button color="primary" size="md">Medium</Button>
		<Button color="primary" label="Print" size="sm" variant="outline"><Printer size="16" /></Button>
		<Button color="primary" label="Print" size="md" variant="outline"><Printer size="20" /></Button>
	</div>
</Story>

<Story name="With icon and text" asChild>
	<div class="flex flex-wrap items-center gap-2">
		<Button color="primary"><Download size="16" />Export CSV</Button>
		<Button color="danger" variant="outline"><Trash2 size="16" />Delete</Button>
		<Button variant="ghost"><Printer size="16" />Print</Button>
	</div>
</Story>

<Story name="Disabled" asChild>
	<div class="flex flex-col gap-3">
		{#each variants as variant (variant)}
			<div class="flex flex-wrap items-center gap-2">
				<span class="w-16 text-xs text-muted">{variant}</span>
				{#each colors as color (color)}
					<Button {color} disabled {variant}>{color}</Button>
				{/each}
			</div>
		{/each}
	</div>
</Story>

<Story name="As link" asChild>
	<div class="flex flex-wrap items-center gap-2">
		<Button color="primary" href="#as-link">Go to pairings</Button>
		<Button href="#as-link" variant="outline">Back to results</Button>
		<Button color="primary" disabled href="#as-link">Disabled link</Button>
	</div>
</Story>
