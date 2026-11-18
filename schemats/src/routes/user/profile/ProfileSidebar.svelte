<script lang="ts">
	import { CLASSIC_URL } from '$app/env/public';
	import SidebarLink from '../(sidebar)/SidebarLink.svelte';

	type Props = {
		/** Classic's rule: while a password change is required, only the notices show */
		forcePasswordChange: boolean,
	};

	let { forcePasswordChange }: Props = $props();

	const classicProfile = `${CLASSIC_URL}/user/login/profile.mhtml`;
	const notice = 'mb-2 text-sm text-text';
</script>

{#if !forcePasswordChange}
	<div class="sidenote" data-testid="account-functions">
		<h4>Account Functions</h4>
		<p class={notice}>
			Syncing NSDA points and Learn courses and deleting your account are still on the classic site.
		</p>
		<SidebarLink href={classicProfile} variant="secondary">Your profile on the classic site</SidebarLink>
	</div>
{/if}

<div class="sidenote">
	<h4>Don't Share Passwords</h4>
	<p class={notice}>
		Your password controls your records, ballots, schools, and tournaments. Never share it:
		everyone needs their own Tabroom.com account. An account whose password is shared may be
		closed, and its owner is responsible for everything done with it.
	</p>
	<p class={notice}>
		To let someone help with your school or tournament, give them access on their own account
		instead. Contact help if you aren't sure how.
	</p>

	<h4>Privacy</h4>
	<p class={notice}>
		Tabroom.com is run by the National Speech &amp; Debate Association (NSDA). Circuit officials
		and tournament directors can see the contact details of the coaches and judges who register,
		but not those of competitors, and they can't contact competitors directly.
	</p>
	<p class={notice}>
		NSDA and Tabroom.com staff can see all contact details to run the site. We never sell or give
		your contact details to anyone else without your consent.
	</p>
</div>
