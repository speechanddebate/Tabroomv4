<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { CLASSIC_URL } from '$app/env/public';
	import type { Problem, UserProfile, UserProfileUpdate } from '@tabroom/types';
	import { STATE_GROUPS } from '@tabroom/types/constants';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createUserProfileUpdate, getUserProfileQueryKey } from '$indexcards';
	import { Checkbox, FormProblem, SaveBar, Select, TextInput } from '$lib/components/forms';
	import { createDraft } from '$lib/helpers/draft.svelte';
	import { fieldErrors } from '$lib/helpers/forms';
	import { handleMutation } from '$lib/helpers/query';
	import { countryOptions, profileForm, showsZip, timeZoneOptions } from './profile';

	type Props = {
		profile : UserProfile,
		class?  : string,
	};

	let { profile, class: classOverride }: Props = $props();

	// The form starts from the profile it was given; later refetches don't overwrite edits
	// svelte-ignore state_referenced_locally
	const draft = createDraft(profileForm(profile));
	const update = createUserProfileUpdate();
	const queryClient = useQueryClient();
	const countries = countryOptions();
	// svelte-ignore state_referenced_locally
	const zones = timeZoneOptions(profile.tz ?? '');

	let problem: Problem | null = $state(null);
	let saving = $state(false);
	const errors = $derived(fieldErrors(problem));

	const card = 'raised @container flex flex-col gap-3 p-4';
	const cardTitle = 'font-display text-xl text-primary-deep normal-case tracking-normal';

	beforeNavigate((navigation) => {
		if (!draft.changes) {
			return;
		}
		// Leaving the site: cancelling makes the browser ask
		if (navigation.willUnload) {
			navigation.cancel();
		} else if (!confirm('You have unsaved changes. Leave this page without saving them?')) {
			navigation.cancel();
		}
	});

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		// An edit to the code field the country no longer shows can't be seen or fixed, so it isn't sent
		const hidden = showsZip(draft.values.country) ? 'postal' : 'zip';
		draft.values[hidden] = draft.saved[hidden];
		if (saving || !draft.changes) {
			return;
		}
		const sent = draft.changed;
		problem = null;
		saving = true;
		const saved = await handleMutation(update.mutateAsync({ data: sent as UserProfileUpdate }), {
			Problem: (result) => { problem = result; },
		});
		if (saved) {
			draft.commit(sent, profileForm(saved));
			queryClient.setQueryData(getUserProfileQueryKey(), (old: { data: UserProfile } | undefined) => old && { ...old, data: saved });
		}
		saving = false;
	};

	const discard = () => {
		draft.discard();
		problem = null;
	};
</script>

<form class={['grid items-start gap-3 @3xl:grid-cols-2', classOverride]} onsubmit={save}>
	<FormProblem class="@3xl:col-span-2" {problem} />

	<section class={card} aria-labelledby="profile-about">
		<h3 id="profile-about" class={cardTitle}>About you</h3>
		<div class="grid gap-3 @sm:grid-cols-3">
			<TextInput autocomplete="given-name" error={errors.first} label="First name" required bind:value={draft.values.first} />
			<TextInput autocomplete="additional-name" error={errors.middle} label="Middle name" bind:value={draft.values.middle} />
			<TextInput autocomplete="family-name" error={errors.last} label="Last name" required bind:value={draft.values.last} />
		</div>
		<!-- Bottom-aligned so the inputs line up when only one field has a description -->
		<div class="grid items-end gap-3 @sm:grid-cols-2">
			<TextInput
				description="Shown to judges and competitors in your rounds, not on the public site."
				error={errors.pronoun}
				label="Pronouns"
				bind:value={draft.values.pronoun}
			/>
			<TextInput autocomplete="tel" error={errors.phone} label="Phone" type="tel" bind:value={draft.values.phone} />
		</div>
		<div class="flex flex-col gap-0.5 text-sm" data-testid="profile-email">
			<span class="font-semibold text-text">Email</span>
			<span class="text-text">{profile.email}</span>
			{#if profile.emailUnconfirmed}
				<span class="text-xs text-muted">Not confirmed yet</span>
			{/if}
			<a class="text-xs font-semibold text-primary-strong underline" href={`${CLASSIC_URL}/user/login/profile.mhtml`}>
				Change your email on the classic site
			</a>
		</div>
		{#if !profile.emailUnconfirmed}
			<Checkbox
				description="You'll miss tournament announcements. Password and email notices still come."
				label="Don't send me email"
				bind:checked={draft.values.noEmail}
			/>
		{/if}
	</section>

	<section class={card} aria-labelledby="profile-address">
		<h3 id="profile-address" class={cardTitle}>Address and time zone</h3>
		<TextInput autocomplete="street-address" error={errors.street} label="Street address" bind:value={draft.values.street} />
		<div class="grid gap-3 @sm:grid-cols-[2fr_1fr_1fr]">
			<TextInput autocomplete="address-level2" error={errors.city} label="City" bind:value={draft.values.city} />
			<Select autocomplete="address-level1" error={errors.state} label="State" options={STATE_GROUPS} bind:value={draft.values.state} />
			{#if showsZip(draft.values.country)}
				<TextInput autocomplete="postal-code" error={errors.zip} label="ZIP code" bind:value={draft.values.zip} />
			{:else}
				<TextInput autocomplete="postal-code" error={errors.postal} label="Postal code" bind:value={draft.values.postal} />
			{/if}
		</div>
		<div class="grid gap-3 @sm:grid-cols-2">
			<Select autocomplete="country" error={errors.country} label="Country" options={countries} bind:value={draft.values.country} />
			<Select error={errors.tz} label="Time zone" options={zones} bind:value={draft.values.tz} />
		</div>
	</section>

	<SaveBar class="@3xl:col-span-2" changes={draft.changes} ondiscard={discard} {saving} />
</form>
