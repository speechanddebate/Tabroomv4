<script lang="ts">
	/*
	 * The body for one role on one tournament card, shown in that role's tab.
	 */
	import type { Fine, HomeEntry, HomeJudge, HomeRole, HomeSchool, HomeTourn, Strike } from '@tabroom/types';
	import { Video } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import { showDateTime, showTime } from '$lib/helpers/dt';
	import Facts, { type Fact } from '$lib/components/Facts.svelte';
	import ItemList from './ItemList.svelte';
	import { classic, dueText, feedbackItems, phaseOf, quizItems, quizState, roundLabel, type Tone } from './tasks';

	// The card's tab names the category or school, so a block gets its own heading only when there are several
	const { tourn, role }: { tourn: HomeTourn, role: HomeRole } = $props();

	// Window checks (feedback, prefs) use the browser clock, as tasks.ts does
	const now = new Date().toISOString();
	const phase = $derived(phaseOf(tourn, now));
	const when = (iso: string) => dueText(iso, tourn.tz, now);

	// A departure is just being unavailable from then on, so it shares the Unavailable row
	const conflictTypes: { types: Strike['type'][], label: string, joined: boolean }[] = [
		{ types: ['school'], label: 'Schools', joined: true },
		{ types: ['entry'], label: 'Entries', joined: true },
		{ types: ['departure', 'time'], label: 'Unavailable', joined: false },
	];

	const conflictText = (strike: Strike): string => {
		switch (strike.type) {
			case 'school': return strike.School?.name ?? 'A school';
			case 'entry': return strike.Entry?.code ?? 'An entry';
			case 'departure': return strike.start ? `After ${when(strike.start)}` : 'Departure';
			case 'time': return strike.start && strike.end ? `${when(strike.start)} to ${when(strike.end)}` : 'Time conflict';
		}
	};

	const judgeFacts = (judge: HomeJudge): Fact[] => [
		{ label: 'Judging for', value: judge.School?.name ?? 'Tournament hire' },
		...(judge.code ? [{ label: 'Judge code', value: judge.code }] : []),
		...(judge.Jpools.length > 0 ? [{ label: 'Pools', value: judge.Jpools.map(pool => pool.name).filter(Boolean).join(', ') }] : []),
		{
			label : 'Rounds judged',
			value : judge.obligation ? `${judge.roundsJudged} of ${judge.obligation} owed`
				: judge.hired ? `${judge.roundsJudged} of ${judge.hired} hired`
				: `${judge.roundsJudged}`,
		},
	];

	// roundsJudged counts panels; ballotsEntered counts one ballot row per entry, so a debate round counts twice
	const ballotsEnteredText = (judge: HomeJudge): string => {
		const count = `${judge.roundsJudged} ${judge.roundsJudged === 1 ? 'ballot' : 'ballots'}`;
		if (judge.feedbackUntil && now < judge.feedbackUntil) {
			return `You’ve entered ${count} here. You can edit your feedback until ${when(judge.feedbackUntil)}.`;
		}
		return `You entered ${count} here. Feedback is closed.`;
	};

	const entryStatus = (entry: HomeEntry): { label: string, tone: Tone } => {
		if (entry.dropped) return { label: 'Dropped', tone: 'problem' };
		if (entry.unconfirmed) return { label: 'No coach approval', tone: 'problem' };
		if (entry.waitlist) return { label: 'Waitlisted', tone: 'due' };
		return { label: phase === 'running' ? 'Competing' : phase === 'past' ? 'Competed' : 'Confirmed', tone: 'info' };
	};

	const entryFacts = (entry: HomeEntry): Fact[] => {
		const partners = entry.Students.map(student => `${student.first ?? ''} ${student.last ?? ''}`.trim());
		const prefs = entry.Prefs;
		return [
			...(partners.length > 0 ? [{ label: partners.length === 1 ? 'Partner' : 'Partners', value: partners.join(', ') }] : []),
			...(prefs?.end && phase !== 'past' ? [{
				label : 'Prefs',
				value : prefs.start && now < prefs.start ? `Open ${when(prefs.start)}` : now < prefs.end ? `Due ${when(prefs.end)}` : 'Closed',
			}] : []),
		];
	};

	const sideText = (round: HomeEntry['Rounds'][number]): string => {
		if (round.side === 1) return 'Aff';
		if (round.side) return 'Neg';
		return round.Panel.flip_at ? 'Flip' : '';
	};

	// The person's own points: entry-level scores, or student scores not for a partner
	const result = (entry: HomeEntry, round: HomeEntry['Rounds'][number]) => {
		const decisions = round.Scores.filter(score => score.tag === 'winloss');
		if (decisions.length === 0) return null;
		const wins = decisions.filter(score => score.value === 1).length;
		const partners = new Set(entry.Students.map(student => student.id));
		const points = round.Scores.filter(score => score.tag === 'point' && !(score.student && partners.has(score.student)));
		return {
			win    : wins * 2 > decisions.length,
			split  : decisions.length > 1 ? `${wins}-${decisions.length - wins}` : '',
			points : points.length > 0 ? (points.reduce((sum, score) => sum + score.value, 0) / points.length).toFixed(1) : '',
		};
	};

	const coachFacts = (school: Extract<HomeSchool, { access: 'full' }>): Fact[] => [
		{ label: 'Entries', value: `${school.Counts.entries} in ${school.Counts.events} ${school.Counts.events === 1 ? 'event' : 'events'}` },
		{ label: 'Judges', value: `${school.Counts.judges} entered` },
		...(school.Onsite ? [{ label: 'Check-in', value: school.onsite ? 'Checked in' : 'Not checked in' }] : []),
	];

	const coachActions = (school: HomeSchool) => phase === 'running' ? [
		{ label: 'Competition dashboard', href: classic.dashboard(school.id), primary: true },
		{ label: 'Strike cards', href: classic.strikeCards() },
		{ label: 'Entries and registration', href: classic.entries(school.id) },
	] : phase === 'upcoming' ? [
		{ label: 'Entries and registration', href: classic.entries(school.id), primary: true },
	] : [
		{ label: 'Results', href: classic.schoolResults(school.id), primary: true },
	];

	const tabFacts = (tab: NonNullable<HomeTourn['Tab']>): Fact[] => [
		{ label: 'Your access', value: `${(tab.tag ?? 'staff').replace(/^\w/, c => c.toUpperCase())}${tab.details ? ' (limited)' : ''}` },
		{ label: 'Schools', value: `${tab.Counts.schools} registered` },
		{ label: 'Entries', value: `${tab.Counts.entries}` },
		...(phase === 'past' ? [{ label: 'Results', value: tab.resultsPublished ? 'Published' : 'Not published' }] : []),
	];

	const subhead = 'mb-1 text-sm font-semibold text-primary-deep';
	const link = 'text-sm font-semibold text-primary-strong underline decoration-dotted underline-offset-2 hover:text-primary-deep';
</script>

{#snippet fines(rows: Fine[], named: boolean)}
	<div>
		<div class={subhead}>Fines</div>
		<ul class="flex flex-col gap-1 text-sm">
			{#each rows as fine (fine.id)}
				<li>
					<span class="font-semibold text-danger">{fine.currency ?? '$'}{fine.amount ?? 0}</span>
					{named && fine.Judge ? `${fine.Judge.first ?? ''} ${fine.Judge.last ?? ''}: ` : ''}{fine.reason ?? 'Fine'}.
					<span class="text-muted">Billed to {fine.schoolName ?? 'your school'} on {showDateTime({ dtISO: fine.leviedAt, tz: tourn.tz, format: 'medium', joinWord: 'at' })}.</span>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

{#if role === 'judge'}
	<div class="flex flex-col gap-6">
		{#each tourn.Judges as judge (judge.id)}
			<div class="@container flex flex-col gap-4">
				{#if judge.ballotsOpen && phase === 'upcoming'}
					<div class="text-sm text-muted">Online ballots open {when(judge.ballotsOpen)}.</div>
				{/if}

				<div class="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
					<div>
						{#if tourn.Judges.length > 1}<div class={subhead}>{judge.Category.name}</div>{/if}
						<Facts facts={judgeFacts(judge)} />
					</div>

					<div class="flex flex-col gap-4">
						<!--
							While any are unfinished, the count and list are a task in the action
							area. Once all are done the same count and list sit here.
						-->
						{#if judge.Quizzes.length > 0 && judge.Quizzes.every(quiz => quizState(quiz) === 'done')}
							<div>
								<div class={subhead}>Required questionnaires</div>
								<ItemList items={quizItems(judge.Quizzes)} summary="{judge.Quizzes.length} of {judge.Quizzes.length} completed" />
							</div>
						{/if}

						<!-- Conflicts only matter while there are rounds left to assign -->
						{#if phase !== 'past'}
							<div>
								<div class="flex items-baseline justify-between gap-2">
									<div class={subhead}>Your conflicts</div>
									<a class={link} href={classic.conflicts(judge.id)}>Add conflicts</a>
								</div>
								{#if judge.Strikes.length > 0}
									<dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
										{#each conflictTypes as { types, label, joined } (label)}
											{@const values = judge.Strikes.filter(strike => types.includes(strike.type)).map(conflictText)}
											{#if values.length > 0}
												<dt class="text-muted">{label}</dt>
												{#if joined}
													<dd>{values.join(', ')}</dd>
												{:else}
													<dd>{#each values as value, idx (idx)}<span class="block">{value}</span>{/each}</dd>
												{/if}
											{/if}
										{/each}
									</dl>
								{:else}
									<div class="text-sm text-muted">None entered.</div>
								{/if}
							</div>
						{/if}

						{#if judge.Fines.length > 0}{@render fines(judge.Fines, false)}{/if}
					</div>
				</div>

				{#if judge.roundsJudged > 0}
					{@const editable = judge.feedbackUntil && now < judge.feedbackUntil ? feedbackItems(judge.CurrentBallots) : []}
					<div class="flex flex-col gap-1 border-t border-border pt-2 text-sm">
						<div>{ballotsEnteredText(judge)}</div>
						{#if editable.length > 0}
							<ItemList items={editable} summary="Edit feedback on {editable.length} {editable.length === 1 ? 'ballot' : 'ballots'}" />
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

{:else if role === 'competitor'}
	<div class="flex flex-col gap-5">
		{#each tourn.Entries as entry (entry.id)}
			{@const status = entryStatus(entry)}
			{@const facts = entryFacts(entry)}
			<!-- Finished tournaments carry no start times or rooms; drop the empty columns -->
			{@const hasStart = entry.Rounds.some(round => round.start)}
			{@const hasRoom = entry.Rounds.some(round => round.Room)}
			<div>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-bold text-primary-strong" title={entry.Event.name ?? undefined}>{entry.Event.abbr}</span>
					<span class="font-semibold">{entry.Event.name}</span>
					<span class="text-sm text-muted">Your code: <span class="font-semibold text-text">{entry.code}</span></span>
					<span class="rounded-sm px-1.5 py-0.5 text-xs font-semibold {status.tone === 'problem' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}">
						{status.label}
					</span>
				</div>
				{#if facts.length > 0}
					<div class="mt-2"><Facts {facts} /></div>
				{/if}

				{#if entry.Rounds.length > 0}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-xl text-left text-sm">
							<thead class="border-b-2 border-border-strong text-xs text-muted">
								<tr>
									<th class="py-1 pr-3 font-semibold" scope="col">Round</th>
									{#if hasStart}<th class="py-1 pr-3 font-semibold" scope="col">Start</th>{/if}
									{#if hasRoom}<th class="py-1 pr-3 font-semibold" scope="col">Room</th>{/if}
									<th class="py-1 pr-3 font-semibold" scope="col">Side</th>
									<th class="py-1 pr-3 font-semibold" scope="col">Opponent</th>
									<th class="py-1 pr-3 font-semibold" scope="col">Judge</th>
									<th class="py-1 font-semibold" scope="col">Result</th>
								</tr>
							</thead>
							<tbody>
								{#each entry.Rounds as round (round.id)}
									{@const outcome = result(entry, round)}
									<tr class="border-b border-border {outcome || phase !== 'running' ? '' : 'bg-accent-soft'}">
										<th class="py-1.5 pr-3 font-semibold" scope="row">{roundLabel(round)}</th>
										{#if hasStart}<td class="py-1.5 pr-3">{round.start ? showTime({ dtISO: round.start, tz: tourn.tz }) : ''}</td>{/if}
										{#if hasRoom}
											<td class="py-1.5 pr-3">
												{#if round.Room?.url}
													<a class="inline-flex items-center gap-1 font-semibold text-primary-strong underline decoration-dotted underline-offset-2 hover:text-primary-deep" href={round.Room.url} rel="noopener noreferrer" target="_blank">
														<Video aria-hidden="true" size="14" />{round.Room.name ?? 'Online room'}
													</a>
												{:else}
													{round.Room?.name ?? ''}
												{/if}
											</td>
										{/if}
										<td class="py-1.5 pr-3">{sideText(round)}</td>
										<td class="py-1.5 pr-3">{round.Panel.bye ? 'Bye' : round.Opponents.map(opponent => opponent.code).join(', ')}</td>
										<td class="py-1.5 pr-3">{round.Judges.map(judge => judge.last ?? judge.code).filter(Boolean).join(', ')}</td>
										<td class="py-1.5">
											{#if outcome}
												<span class="font-semibold {outcome.win ? 'text-success' : 'text-danger'}">{outcome.win ? 'Win' : 'Loss'}</span>
												<span class="text-muted">{outcome.split} {outcome.points}</span>
											{:else}
												<span class="text-muted italic">{phase === 'running' ? 'Pending' : ''}</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if phase === 'past'}
					<div class="mt-3">
						<Button color="primary" href={classic.tournResults(tourn.id)} size="sm">Full results</Button>
					</div>
				{/if}
			</div>
		{/each}
	</div>

{:else if role === 'coach'}
	<div class="flex flex-col gap-6">
		{#each tourn.Schools as school (school.id)}
			<div class="flex flex-col gap-3">
				{#if school.access === 'full'}
					<div>
						{#if tourn.Schools.length > 1}<div class={subhead}>{school.name}</div>{/if}
						<Facts facts={coachFacts(school)} />
					</div>
					<!-- Every fine billed to the school, judge fines included -->
					{#if school.Fines.length > 0}{@render fines(school.Fines, true)}{/if}
					<div class="flex flex-wrap gap-2">
						{#each coachActions(school) as action (action.label)}
							<Button color="primary" href={action.href} size="sm" variant={action.primary ? 'solid' : 'outline'}>{action.label}</Button>
						{/each}
					</div>
				{:else}
					<div>
						{#if tourn.Schools.length > 1}<div class={subhead}>{school.name}</div>{/if}
						<div class="mb-2 text-sm text-muted">You can fill in pref sheets for this school.</div>
						<Facts facts={school.Prefs.map(sheet => ({
							label : sheet.Category.abbr ?? sheet.Category.name ?? 'Prefs',
							value : `${sheet.entries} ${sheet.entries === 1 ? 'entry' : 'entries'}${sheet.end ? `, due ${when(sheet.end)}` : ''}`,
						}))} />
					</div>
					<div>
						<Button color="primary" href={classic.schoolPrefs(school.id)} size="sm">Pref sheets</Button>
					</div>
				{/if}
			</div>
		{/each}
	</div>

{:else if role === 'tab' && tourn.Tab}
	<div class="flex flex-col gap-3">
		<Facts facts={tabFacts(tourn.Tab)} />
		<div>
			<Button color="primary" href={classic.tabRoom(tourn.id)} size="sm">Open tab room</Button>
		</div>
	</div>
{/if}
