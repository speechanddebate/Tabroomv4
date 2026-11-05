<script lang="ts">
	/*
	 * The user home: every role at once, ordered by urgency. Alerts, then
	 * what's on now, then what's coming, then what just ended (within the
	 * last week, still a full card for results, fines, and feedback).
	 */
	import type { HomeResponse } from '@tabroom/types';
	import { CLASSIC_URL } from '$app/env/public';
	import { createUserHome } from '$indexcards';
	import { showDate } from '$lib/helpers/dt';
	import { handleOrval } from '$lib/helpers/query';
	import Button from '$lib/components/Button.svelte';
	import Loading from '$lib/layouts/Loading.svelte';
	import EmptyHome from './EmptyHome.svelte';
	import PushPrompt from './PushPrompt.svelte';
	import TournCard from './TournCard.svelte';
	import { classic, phaseOf, type Phase } from './tasks';

	const userHomeQuery = createUserHome();

	const home = $derived(handleOrval(userHomeQuery));

	type Banner = {
		id      : string,
		tone    : 'problem' | 'due',
		title   : string,
		body    : string,
		actions : { label: string, href: string, primary?: boolean }[],
	};

	const bannerTones = {
		due     : 'border-primary-strong bg-primary-soft',
		problem : 'border-danger bg-danger-soft',
	};

	// Account-wide alerts that classic forces as interstitials (paradigm review) or gates (email, time zone)
	const banners = (alerts: HomeResponse['Alerts']): Banner[] => [
		...(alerts.paradigmReview ? [{
			id      : 'paradigm',
			tone    : 'due' as const,
			title   : 'Review your paradigm',
			body    : `The NSDA updated its paradigm standards on ${showDate({ dtISO: alerts.paradigmReview.start })}. ${alerts.paradigmReview.lastReviewed ? 'Your paradigm was last approved before then.' : 'You haven’t approved your paradigm yet.'} Read it and approve it, or edit it, before your next round.`,
			actions : [
				{ label: 'Review and approve', href: classic.paradigmReview(), primary: true },
				{ label: 'Edit paradigm', href: classic.paradigm() },
			],
		}] : []),
		...(alerts.emailUnconfirmed ? [{
			id      : 'email',
			tone    : 'problem' as const,
			title   : 'Confirm your email address',
			body    : 'Until you do, you can’t create a school or request a tournament.',
			actions : [{ label: 'Resend link', href: classic.confirmEmail(), primary: true }],
		}] : []),
		...(alerts.tzMissing ? [{
			id      : 'tz',
			tone    : 'problem' as const,
			title   : 'Set your time zone',
			body    : 'Round times show in your time zone. Set it before your tournaments start.',
			actions : [{ label: 'Set time zone', href: '/user/profile', primary: true }],
		}] : []),
	];

	const sections: { phase: Phase, id: string, title: string }[] = [
		{ phase: 'running', id: 'home-now', title: 'Happening now' },
		{ phase: 'upcoming', id: 'home-upcoming', title: 'Coming up' },
		{ phase: 'past', id: 'home-recent', title: 'Just finished' },
	];

	const h2 = 'm-0 mb-2 font-display text-xl tracking-normal text-primary-deep normal-case';
</script>

<div class="flex flex-col gap-4">
	<PushPrompt />
	<div class="rounded-md border border-warning bg-warning-soft p-4 shadow-sm">
		<h2 class="text-lg font-semibold text-text">Page Under Development</h2>
		<p class="mt-2 text-sm text-text">
			This page is still in progress. If you don't see what you need, please visit the
			<a
				class="font-semibold underline hover:text-warning"
				href={`${CLASSIC_URL}/user/setup.mhtml`}
				rel="noopener noreferrer"
				target="_blank"
			>
				legacy user home page
			</a>.
		</p>
	</div>
	{#if home}
		<div class="flex flex-col gap-8">
			{#if banners(home.Alerts).length > 0}
				<div class="flex flex-col gap-2">
					{#each banners(home.Alerts) as banner (banner.id)}
					<div class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-sm border-l-4 px-4 py-3 shadow-sm {bannerTones[banner.tone]}" aria-label={banner.title} role="region">
						<div class="min-w-0 flex-1 basis-80">
							<div class="font-semibold text-text">{banner.title}</div>
							<div class="mt-0.5 max-w-prose text-sm text-text">{banner.body}</div>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each banner.actions as action (action.label)}
								<Button
									color={banner.tone === 'problem' ? 'danger' : 'primary'}
									href={action.href}
									size="sm"
									variant={action.primary ? 'solid' : 'outline'}
								>{action.label}</Button>
							{/each}
						</div>
					</div>
				{/each}
				</div>
			{/if}

			{#if home.Tourns.length === 0}
				<EmptyHome />
			{/if}

			{#each sections as section (section.phase)}
				{@const tourns = home.Tourns.filter(tourn => phaseOf(tourn) === section.phase)}
				{#if tourns.length > 0}
					<section aria-labelledby={section.id}>
						<h2 id={section.id} class={h2}>{section.title}</h2>
						<div class="flex flex-col gap-4">
							{#each tourns as tourn (tourn.id)}<TournCard {tourn} />{/each}
						</div>
					</section>
				{/if}
			{/each}
		</div>
	{:else}
		<Loading />
	{/if}
</div>
