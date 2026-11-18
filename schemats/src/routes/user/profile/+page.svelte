<script lang="ts">
	import { onMount } from 'svelte';
	import { createUserProfile } from '#indexcards';
	import Button from '#lib/components/Button.svelte';
	import { Switch } from '#lib/components/forms/index.ts';
	import { createPushState } from '#lib/helpers/pushState.svelte.ts';
	import { handleOrval } from '#lib/helpers/query.ts';
	import WithSidebar from '#lib/layouts/WithSidebar.svelte';
	import PasswordForm from './PasswordForm.svelte';
	import ProfileForm from './ProfileForm.svelte';
	import ProfileSidebar from './ProfileSidebar.svelte';
	import SessionList from './SessionList.svelte';

	// Also edited on classic, so a reload fetches it fresh rather than showing a stored copy
	const profileQuery = createUserProfile(() => ({ query: { meta: { persist: false } } }));
	const profile = $derived(handleOrval(profileQuery));

	const push = createPushState();

	onMount(() => {
		push.readPermission();
	});

	// Only these states can change; the rest say why under the switch
	const canToggle = $derived(push.state === 'on' || push.state === 'off' || push.state === 'undecided');

	const card = 'raised @container flex flex-col gap-3 p-4';
	const cardTitle = 'font-display text-xl text-primary-deep normal-case tracking-normal';
</script>

<WithSidebar canvas>
	<div class="@container flex flex-1 flex-col gap-3">
		<h2 class="font-display text-3xl text-primary-deep normal-case tracking-normal">Your profile</h2>

		{#if profile?.forcePasswordChange}
			<!-- Classic's rule: nothing else on the page until the password is changed -->
			<section class={['max-w-md', card]} aria-labelledby="profile-forced" data-testid="forced-password-change">
				<h3 id="profile-forced" class={cardTitle}>Choose a new password</h3>
				<p class="text-sm text-text">Your password was reset, so choose a new one before you edit your profile.</p>
				<PasswordForm />
			</section>
		{:else}
			{#if profile}
				<ProfileForm {profile} />
			{/if}

			<div class="grid items-start gap-3 @3xl:grid-cols-2">
				<section class={card} aria-labelledby="profile-password">
					<h3 id="profile-password" class={cardTitle}>Password</h3>
					<PasswordForm />
				</section>

				<section class={card} aria-labelledby="profile-devices">
					<h3 id="profile-devices" class={cardTitle}>Devices</h3>
					<Switch
						checked={push.state === 'on'}
						disabled={!canToggle || push.busy}
						label="Receive notifications on this browser"
						save={on => (on ? push.enable() : push.turnOff())}
					/>
					{#if push.state === 'on'}
						<Button
							class="self-start"
							disabled={push.busy}
							onclick={push.sendTest}
							size="sm"
							variant="outline"
						>
							Send test notification
						</Button>
					{/if}

					{#if push.state === 'unsupported'}
						<p class="text-sm text-muted" data-testid="push-note">This browser doesn't support push notifications.</p>
					{:else if push.state === 'su'}
						<p class="text-sm text-muted" data-testid="push-note">Push notifications can't be changed while su'd.</p>
					{:else if push.state === 'unavailable'}
						<p class="text-sm text-muted" data-testid="push-note">Push notifications aren't available right now.</p>
					{:else if push.state === 'denied'}
						<p class="text-sm text-muted" data-testid="push-note">
							Notifications from Tabroom are blocked in this browser. To get them, open your
							browser's site settings for Tabroom and allow notifications.
						</p>
					{/if}

					<SessionList tz={profile?.tz ?? null} />
				</section>
			</div>
		{/if}
	</div>

	{#snippet sidebar()}
		<ProfileSidebar forcePasswordChange={profile?.forcePasswordChange ?? false} />
	{/snippet}
</WithSidebar>
