<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '$lib/components/Button.svelte';
	import { Checkbox, SaveBar, Select, Switch, TextInput } from '$lib/components/forms';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import { createDraft } from '$lib/helpers/draft.svelte';
	import SidebarLink from '../../../../routes/user/(sidebar)/SidebarLink.svelte';

	// Two classic screens rebuilt from the form components as full examples of the form rules:
	// labels above, Button's heights, switches that save now, a SaveBar for everything else.
	// Only the page layout here is prototype; editing in a table is set aside, so the custom
	// obligations rows are plain sm inputs.
	const { Story } = defineMeta({
		title      : 'Components/Forms/Examples',
		parameters : { layout: 'fullscreen' },
	});

	// Cards are containers so their rows can share a line whenever the card, not the window, is wide enough
	const card = 'raised @container flex flex-col gap-3 p-4';
	const cardTitle = 'font-display text-xl text-primary-deep normal-case tracking-normal';
	// Two columns once the content area (sidebar excluded) has room for both
	const columns = 'grid items-start gap-3 @3xl:grid-cols-2';
	const column = 'flex min-w-0 flex-col gap-3';
	const help = 'text-xs text-muted';

	const zones = [
		{ value: 'America/New_York', label: 'Eastern' },
		{ value: 'America/Chicago', label: 'Central' },
		{ value: 'America/Denver', label: 'Mountain' },
		{ value: 'America/Los_Angeles', label: 'Pacific' },
	];
	const countries = [
		{ value: 'US', label: 'United States' },
		{ value: 'CA', label: 'Canada' },
		{ value: 'GB', label: 'United Kingdom' },
		{ value: 'AU', label: 'Australia' },
	];
	const stateGroups = [
		{ label: 'United States', options: [{ value: 'IA', label: 'Iowa' }, { value: 'IL', label: 'Illinois' }, { value: 'MN', label: 'Minnesota' }, { value: 'NE', label: 'Nebraska' }] },
		{ label: 'Canada', options: [{ value: 'ON', label: 'Ontario' }, { value: 'QC', label: 'Quebec' }] },
		{ label: 'Other', options: [{ value: '', label: 'N/A' }] },
	];
	const burdenMethods = [
		{ value: 'rounds', label: 'Rounds per entry' },
		{ value: 'judges', label: 'Entries per judge' },
	];

	const sessionsStart = [
		{ id: 1, browser: 'Firefox on Linux', place: 'Des Moines, IA', active: 'Active now', current: true },
		{ id: 2, browser: 'Chrome on Android', place: 'Des Moines, IA', active: '2 hours ago', current: false },
		{ id: 3, browser: 'Safari on iPad', place: 'Ames, IA', active: 'March 3', current: false },
	];

	const otherCategories = ['Congress', 'Policy', 'Public Forum', 'Speech'];

	// Stands in for the request a switch makes
	const saveSetting = () => new Promise<void>(resolve => setTimeout(resolve, 600));
</script>

<script lang="ts">
	const profile = createDraft({
		first   : 'Avery',
		middle  : '',
		last    : 'Okafor',
		pronoun : 'they/them',
		email   : 'avery.okafor@example.org',
		phone   : '515-555-0142',
		street  : '1415 Locust St',
		city    : 'Des Moines',
		state   : 'IA',
		country : 'US',
		zip     : '50309',
		tz      : 'America/Chicago',
		noEmail : false,
	});
	let emailChanged = $derived(profile.values.email.trim().toLowerCase() !== profile.saved.email.toLowerCase());
	let currentPassword = $state('');

	let newPassword = $state('');
	let repeatPassword = $state('');
	let sessions = $state(sessionsStart.map(session => ({ ...session })));

	const category = createDraft({
		name        : 'Lincoln-Douglas',
		abbr        : 'LD',
		codeStart   : '100',
		detailsDate : '2026-12-01',
		detailsTime : '17:00',
		fyoLabel    : 'FYO',
		method      : 'rounds',
		roundsPer   : '6',
		judgePer    : '',
		maxRounds   : '8',
		free        : '2',
		bumpAfter   : '10',
		bumpUnit    : '1',
		minJudges   : '1',
		maxJudges   : '',
		attendFee   : '0.00',
		bondFee     : '50.00',
		missingFine : '75.00',
		custom      : [['1', '4'], ['2', '8'], ['', '']],
	});

	const saveProfile = (event: SubmitEvent) => {
		event.preventDefault();
		profile.commit(profile.changed);
		currentPassword = '';
	};

	const saveCategory = (event: SubmitEvent) => {
		event.preventDefault();
		category.commit(category.changed);
	};
</script>

<Story name="User profile" asChild>
	<WithSidebar canvas>
		<div class="@container flex flex-col gap-3">
			<h2 class="font-display text-3xl text-primary-deep normal-case tracking-normal">Your profile</h2>

			<form class={columns} onsubmit={saveProfile}>
				<section aria-labelledby="p-about" class={card}>
					<h3 id="p-about" class={cardTitle}>About you</h3>
					<div class="grid gap-3 @sm:grid-cols-3">
						<TextInput autocomplete="given-name" label="First name" bind:value={profile.values.first} />
						<TextInput autocomplete="additional-name" label="Middle name" bind:value={profile.values.middle} />
						<TextInput autocomplete="family-name" label="Last name" bind:value={profile.values.last} />
					</div>
					<!-- Bottom-aligned so the inputs line up when only one field has a description -->
					<div class="grid items-end gap-3 @sm:grid-cols-2">
						<TextInput description="Shown to judges and competitors in your rounds, not on the public site." label="Pronouns" bind:value={profile.values.pronoun} />
						<TextInput autocomplete="tel" label="Phone" type="tel" bind:value={profile.values.phone} />
					</div>
					<TextInput autocomplete="email" label="Email" type="email" bind:value={profile.values.email} />
					{#if emailChanged}
						<div class="rounded bg-primary-soft p-3">
							<TextInput
								autocomplete="current-password"
								description="Needed to change your email. We'll send a code to the new address."
								label="Current password"
								type="password"
								bind:value={currentPassword}
							/>
						</div>
					{/if}
					<Checkbox
						description="You'll miss tournament announcements. Password and email notices still come."
						label="Don't send me email"
						bind:checked={profile.values.noEmail}
					/>
				</section>

				<section aria-labelledby="p-address" class={card}>
					<h3 id="p-address" class={cardTitle}>Address and time zone</h3>
					<TextInput autocomplete="street-address" label="Street address" bind:value={profile.values.street} />
					<div class="grid gap-3 @sm:grid-cols-[2fr_1fr_1fr]">
						<TextInput autocomplete="address-level2" label="City" bind:value={profile.values.city} />
						<Select autocomplete="address-level1" label="State" options={stateGroups} bind:value={profile.values.state} />
						<TextInput autocomplete="postal-code" label={profile.values.country === 'US' ? 'ZIP code' : 'Postal code'} bind:value={profile.values.zip} />
					</div>
					<div class="grid gap-3 @sm:grid-cols-2">
						<Select autocomplete="country" label="Country" options={countries} bind:value={profile.values.country} />
						<Select label="Time zone" options={zones} bind:value={profile.values.tz} />
					</div>
				</section>

				<SaveBar
					class="@3xl:col-span-2"
					changes={profile.changes}
					ondiscard={() => { profile.discard(); currentPassword = ''; }}
				/>
			</form>

			<div class={columns}>
				<section aria-labelledby="p-password" class={card}>
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h3 id="p-password" class={cardTitle}>Password</h3>
						<span class={help}>Last changed August 14, 2026</span>
					</div>
					<form class="flex flex-col gap-3" onsubmit={event => event.preventDefault()}>
						<TextInput autocomplete="current-password" label="Current password" type="password" />
						<div class="grid items-end gap-3 @sm:grid-cols-2">
							<TextInput
								autocomplete="new-password"
								description="At least 8 characters, not your email or name."
								label="New password"
								type="password"
								bind:value={newPassword}
							/>
							<TextInput autocomplete="new-password" label="Repeat new password" type="password" bind:value={repeatPassword} />
						</div>
						<span class="-mt-2 h-4 text-xs" aria-live="polite">
							{#if repeatPassword && repeatPassword === newPassword}
								<span class="font-semibold text-success">Passwords match</span>
							{:else if repeatPassword}
								<span class="text-muted">Your new passwords don't match yet</span>
							{/if}
						</span>
						<div class="flex flex-wrap items-center gap-3">
							<Button color="primary" type="submit">Change password</Button>
							<span class={help}>Signs you out everywhere else.</span>
						</div>
					</form>
				</section>

				<section aria-labelledby="p-devices" class={card}>
					<h3 id="p-devices" class={cardTitle}>Devices</h3>
					<Switch checked label="Web alerts on this browser" save={saveSetting} />
					<table class="w-full text-sm">
						<caption class="sr-only">Where you're signed in</caption>
						<thead>
							<tr class="border-b-2 border-border-strong text-left text-xs text-muted">
								<th class="py-1 pr-3 font-semibold">Signed in on</th>
								<th class="py-1 pr-3 font-semibold">Last active</th>
								<th class="py-1 font-semibold"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each sessions as session (session.id)}
								<tr class="border-b border-border">
									<td class="py-1.5 pr-3">
										<span class="flex flex-col">
											<span>{session.browser}</span>
											<span class={help}>{session.place}</span>
										</span>
									</td>
									<td class="py-1.5 pr-3">{session.active}</td>
									<td class="py-1.5 text-right">
										{#if session.current}
											<span class="text-xs font-semibold text-muted">This browser</span>
										{:else}
											<Button color="danger" onclick={() => { sessions = sessions.filter(s => s.id !== session.id); }} size="sm" type="button" variant="ghost">
												End session<span class="sr-only"> on {session.browser}</span>
											</Button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			</div>
		</div>

		{#snippet sidebar()}
			<div class="sidenote">
				<h4>Your Account</h4>
				<SidebarLink href="#nsda-sync" selected={false} variant="secondary">Update NSDA points and degrees</SidebarLink>
				<SidebarLink href="#learn-sync" selected={false} variant="secondary">Update NSDA Learn courses</SidebarLink>
				<SidebarLink href="#names" selected={false} variant="secondary">Edit names and phonetic guides</SidebarLink>
				<SidebarLink href="#delete" selected={false} variant="secondary">Delete your account</SidebarLink>
			</div>
			<div class="sidenote">
				<h4>Account Data</h4>
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="text-muted">Tabroom ID</dt><dd>911622</dd>
					<dt class="text-muted">Logins</dt><dd>1,284</dd>
					<dt class="text-muted">Last login</dt><dd>November 16, 8:02 a.m. CT</dd>
				</dl>
			</div>
		{/snippet}
	</WithSidebar>
</Story>

<Story name="Judge category" asChild>
	<WithSidebar canvas>
		<div class="@container flex flex-col gap-3">
			<div class="flex flex-wrap items-end justify-between gap-x-4">
				<h2 class="font-display text-3xl text-primary-deep normal-case tracking-normal">{category.saved.name}</h2>
				<span class="pb-1 text-sm text-muted">Judge category at Bluebonnet Classic</span>
			</div>
			<nav aria-label="Judge category pages" class="overflow-x-auto border-b-2 border-border">
				<ul class="flex gap-1 text-sm font-semibold">
					{#each ['Register', 'Hires', 'Tabbing', 'Ratings', 'Time shifts', 'Pools', 'Messages'] as tab (tab)}
						<li>
							<a
								class={['-mb-0.5 block border-b-2 px-3 py-1.5 whitespace-nowrap', tab === 'Register' ? 'border-primary-strong text-primary-strong' : 'border-transparent text-muted hover:border-border-strong hover:text-text']}
								aria-current={tab === 'Register' ? 'page' : undefined}
								href="#{tab.toLowerCase().replace(' ', '-')}"
							>{tab}</a>
						</li>
					{/each}
				</ul>
			</nav>

			<form class={columns} onsubmit={saveCategory}>
				<div class={column}>
					<section aria-labelledby="j-category" class={card}>
						<h3 id="j-category" class={cardTitle}>Category</h3>
						<div class="grid grid-cols-[1fr_6rem] gap-3">
							<TextInput label="Name" bind:value={category.values.name} />
							<TextInput label="Abbreviation" maxlength={6} bind:value={category.values.abbr} />
						</div>
						<Switch label="Hide judge codes; show names only" save={saveSetting} showChildrenWhen={false}>
							<TextInput class="max-w-40" inputmode="numeric" label="Start judge codes at" bind:value={category.values.codeStart} />
						</Switch>
					</section>

					<section aria-labelledby="j-registration" class={card}>
						<h3 id="j-registration" class={cardTitle}>Judge registration</h3>
						<div class="-my-2 flex flex-col divide-y divide-border">
							<Switch checked class="py-2" label="Publish the judge list online" save={saveSetting} />
							<Switch checked class="py-2" description="So they get ballots and blasts." label="Require judges to link a Tabroom account" save={saveSetting}>
								<Switch label="Require a phone number on those accounts" save={saveSetting} />
							</Switch>
							<Switch class="py-2" label="Ask when judges are leaving" save={saveSetting} />
							<Switch checked class="py-2" label="Print judge contact info on registration sheets" save={saveSetting} />
							<Switch class="py-2" label="Ask for judge qualifications and history" save={saveSetting} />
							<Switch checked class="py-2" label="Coaches can mark first-year judges" save={saveSetting}>
								<TextInput class="max-w-56" label="Label for first-year judges" bind:value={category.values.fyoLabel} />
							</Switch>
							<Switch class="py-2" description="Neutral judges can be placed in any round regardless of school." label="Coaches can mark neutral judges" save={saveSetting} />
							<Switch class="py-2" label="Judges can also register in other categories" save={saveSetting} />
							<Switch class="py-2" label="Ask for a second category each judge can cover" save={saveSetting} />
						</div>
						<div class="flex flex-wrap items-start gap-2">
							<TextInput class="w-48" label="Judge details due" type="date" bind:value={category.values.detailsDate} />
							<TextInput class="w-36" label="Time (Central)" type="time" bind:value={category.values.detailsTime} />
						</div>
					</section>
				</div>

				<div class={column}>
					<section aria-labelledby="j-burden" class={card}>
						<h3 id="j-burden" class={cardTitle}>What schools owe</h3>
						<Select class="max-w-64" label="Count the obligation by" options={burdenMethods} bind:value={category.values.method} />

						{#if category.values.method === 'rounds'}
							<div class="grid gap-3 @sm:grid-cols-2">
								<TextInput inputmode="decimal" label="Rounds owed per entry" suffix="rounds" bind:value={category.values.roundsPer} />
								<TextInput inputmode="decimal" label="Free rounds per school" suffix="rounds" bind:value={category.values.free} />
								<TextInput inputmode="numeric" label="Large school above" suffix="entries" bind:value={category.values.bumpAfter} />
								<TextInput inputmode="decimal" label="owes extra per entry" suffix="rounds" bind:value={category.values.bumpUnit} />
								<TextInput inputmode="numeric" label="Most rounds per judge" suffix="rounds" bind:value={category.values.maxRounds} />
							</div>
							<div class="-my-2 flex flex-col divide-y divide-border">
								<Switch class="py-2" label="Count each flight as a round" save={saveSetting} />
								<Switch checked class="py-2" label="Dropped entries don't add to the obligation" save={saveSetting} />
							</div>
							<div class="flex flex-col gap-1">
								<span id="j-custom-l" class="text-sm font-semibold">Custom obligations</span>
								<span class={help}>Rounds owed by a school with exactly this many entries.</span>
								<table class="w-full max-w-xs text-sm" aria-labelledby="j-custom-l">
									<thead><tr class="text-left text-xs text-muted"><th class="pr-2 font-semibold">Entries</th><th class="font-semibold">Rounds owed</th></tr></thead>
									<tbody>
										{#each category.values.custom as row, i (i)}
											<tr>
												<td class="py-0.5 pr-2"><TextInput hideLabel inputmode="numeric" label="Entries, row {i + 1}" size="sm" bind:value={row[0]} /></td>
												<td class="py-0.5"><TextInput hideLabel inputmode="decimal" label="Rounds owed, row {i + 1}" size="sm" bind:value={row[1]} /></td>
											</tr>
										{/each}
									</tbody>
								</table>
								<div><Button onclick={() => { category.values.custom.push(['', '']); }} size="sm" type="button" variant="ghost">Add a row</Button></div>
							</div>
						{:else}
							<div class="grid gap-3 @sm:grid-cols-2">
								<TextInput inputmode="decimal" label="Entries per judge" suffix="entries" bind:value={category.values.judgePer} />
								<TextInput inputmode="numeric" label="Free judges per school" suffix="judges" bind:value={category.values.free} />
								<TextInput inputmode="numeric" label="Fewest a school owes" suffix="judges" bind:value={category.values.minJudges} />
								<TextInput inputmode="numeric" label="Most a school owes" suffix="judges" bind:value={category.values.maxJudges} />
							</div>
							<Switch checked label="Dropped entries don't add to the obligation" save={saveSetting} />
						{/if}
					</section>

					<section aria-labelledby="j-fees" class={card}>
						<h3 id="j-fees" class={cardTitle}>Fees and fines</h3>
						<div class="grid gap-3 @sm:grid-cols-3">
							<TextInput inputmode="decimal" label="Per judge attending" prefix="$" bind:value={category.values.attendFee} />
							<TextInput inputmode="decimal" label="Bond per judge owed" prefix="$" bind:value={category.values.bondFee} />
							<TextInput inputmode="decimal" label="Per missing round" prefix="$" bind:value={category.values.missingFine} />
						</div>
						<span class="-mt-1 {help}">The bond isn't a hiring fee. Fines skip hired judges and print a warning on invoices.</span>
					</section>
				</div>

				<SaveBar class="@3xl:col-span-2" changes={category.changes} ondiscard={() => category.discard()} />
			</form>
		</div>

		{#snippet sidebar()}
			<div class="sidenote">
				<h4>Judge Categories</h4>
				<SidebarLink href="#ld" selected>Lincoln-Douglas</SidebarLink>
				{#each otherCategories as name (name)}
					<SidebarLink href="#{name.toLowerCase().replace(' ', '-')}" selected={false}>{name}</SidebarLink>
				{/each}
				<SidebarLink href="#add" selected={false} variant="secondary">Add a judge category</SidebarLink>
			</div>
			<div class="sidenote">
				<h4>Events in LD</h4>
				<SidebarLink href="#varsity-ld" selected={false}>Varsity Lincoln-Douglas Debate</SidebarLink>
				<SidebarLink href="#novice-ld" selected={false}>Novice Lincoln-Douglas Debate</SidebarLink>
			</div>
			<div class="sidenote">
				<h4>About Categories</h4>
				<span class="block px-1 text-sm">Events in a judge category share judges and ratings. Use pools to draw a round's judges from part of the category.</span>
			</div>
		{/snippet}
	</WithSidebar>
</Story>
