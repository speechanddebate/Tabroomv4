<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import type { Problem, UserProfile, UserProfileUpdate } from '@tabroom/types';
	import { STATE_GROUPS } from '@tabroom/types/constants';
	import { TriangleAlert } from '@lucide/svelte';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createUserProfileUpdate, getUserProfileQueryKey } from '#indexcards';
	import { Checkbox, FormProblem, SaveBar, Select, TextInput } from '#lib/components/forms/index.ts';
	import { createDraft } from '#lib/helpers/draft.svelte.ts';
	import { fieldErrors } from '#lib/helpers/forms.ts';
	import { handleMutation } from '#lib/helpers/query.ts';
	import { isSuSession } from '#lib/helpers/SessionContext.svelte.ts';
	import { toast } from '#lib/helpers/toasts.ts';
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
	// The API refuses an email change while su'd
	const su = isSuSession();
	let currentPassword = $state('');
	// The API stores addresses trimmed and lowercased, so an edit of only case or spaces isn't a new address
	const emailChanging = $derived(draft.values.email.trim().toLowerCase() !== draft.saved.email.trim().toLowerCase());

	// a legend sits outside its fieldset's flex flow, so the gap below it is its own margin
	const legend = 'mb-3 font-display text-xl text-primary-deep normal-case tracking-normal';

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
		// Without a password the API would refuse it, and it would change nothing anyway
		if (!emailChanging) draft.values.email = draft.saved.email;
		if (saving || !draft.changes) {
			return;
		}
		const sent = draft.changed;
		problem = null;
		saving = true;
		const data = { ...sent, ...(sent.email ? { currentPassword } : {}) } as UserProfileUpdate;
		const saved = await handleMutation(update.mutateAsync({ data }), {
			Problem: (result) => { problem = result; },
		});
		if (saved) {
			draft.commit(sent, profileForm(saved));
			queryClient.setQueryData(getUserProfileQueryKey(), (old: { data: UserProfile } | undefined) => old && { ...old, data: saved });
			if (sent.email) {
				currentPassword = '';
				toast.success({ message: `We sent a confirmation code to ${saved.email}` });
			}
		}
		saving = false;
	};

	const discard = () => {
		draft.discard();
		currentPassword = '';
		problem = null;
	};
</script>

<form class={['flex flex-col gap-3', classOverride]} onsubmit={save}>
	<FormProblem {problem} />

	<div class="raised @container">
		<div class="grid items-start gap-x-8 gap-y-6 p-4 @3xl:grid-cols-2">
			<!-- Each group is its own container so its field rows break on its own width -->
			<div class="@container min-w-0">
				<fieldset class="flex min-w-0 flex-col gap-3">
					<legend class={legend}>About you</legend>
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
					<!-- Bottom-aligned so the email lines up with the password field's input under its description -->
					<div class="grid items-end gap-3 @sm:grid-cols-2" data-testid="profile-email">
						<div class="flex flex-col gap-1">
							<TextInput
								autocomplete="email"
								description={su ? 'Email can\'t be changed while su\'d.' : undefined}
								error={errors.email}
								label="Email"
								readonly={su}
								type="email"
								bind:value={draft.values.email}
							/>
							{#if profile.emailUnconfirmed && !emailChanging}
								<p class="flex items-center gap-1 text-xs text-muted">
									<TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
									<span>Not confirmed yet. <a class="font-semibold text-primary-strong underline" href="/user/profile/confirm">Confirm your email</a></span>
								</p>
							{/if}
						</div>
						{#if emailChanging}
							<TextInput
								autocomplete="current-password"
								description="Needed to change your email. We'll send a code to the new address."
								error={errors.currentPassword}
								label="Current password"
								required
								type="password"
								bind:value={currentPassword}
							/>
						{/if}
					</div>
					{#if !profile.emailUnconfirmed}
						<Checkbox
							description="You will not receive ANY tournament notices, pairings, or announcements. You will still receive notices about your Tabroom account."
							label="Don't send me email"
							bind:checked={draft.values.noEmail}
						/>
					{/if}
				</fieldset>
			</div>

			<div class="@container min-w-0">
				<fieldset class="flex min-w-0 flex-col gap-3">
					<legend class={legend}>Address and time zone</legend>
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
				</fieldset>
			</div>
		</div>

		<SaveBar attached changes={draft.changes} ondiscard={discard} {saving} />
	</div>
</form>
