<script lang="ts">
	// The landing screen for someone who has no tourns for their account yet.
	import { CLASSIC_URL } from '$app/env/public';
	import Button from '$lib/components/Button.svelte';

	const paths = [
		{
			who     : 'Coaches and program directors',
			what    : 'Register your team for tournaments, or run your own.',
			actions : [
				{ label: 'Create a school or team', href: `${CLASSIC_URL}/user/chapter/create.mhtml`, primary: true },
				{ label: 'Request a tournament', href: `${CLASSIC_URL}/user/tourn/request.mhtml` },
			],
		},
		{
			who     : 'Judges',
			what    : 'Get your assignments and enter ballots online.',
			actions : [{ label: 'Link your account to a judge', href: '/user/judge/search', primary: true }],
		},
		{
			who     : 'Competitors',
			what    : 'Sign up for tournaments and see your rounds and results.',
			actions : [{ label: 'Link your account to a competitor', href: '/user/student/search', primary: true }],
		},
	];
</script>

<div class="raised w-full p-4 sm:p-6">
	<h2 class="m-0 font-display text-3xl tracking-normal text-primary-deep normal-case">Welcome to Tabroom.com</h2>
	<div class="mt-1 text-text">Nothing is linked to your account yet. Start with the one that fits you.</div>
	<ul class="mt-4 divide-y divide-border border-y border-border">
		{#each paths as path (path.who)}
			<li class="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
				<div class="min-w-0 flex-1 basis-64">
					<div class="font-semibold">{path.who}</div>
					<div class="text-sm text-muted">{path.what}</div>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each path.actions as action (action.label)}
						<Button color="primary" href={action.href} size="sm" variant={action.primary ? 'solid' : 'outline'}>{action.label}</Button>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
	<div class="mt-3 text-sm text-muted">
		New to Tabroom? The <a class="font-semibold text-primary-strong underline decoration-dotted" href="https://docs.tabroom.com">Tabroom manual</a> walks through each one.
	</div>
</div>
