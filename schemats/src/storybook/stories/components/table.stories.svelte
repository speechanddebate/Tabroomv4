<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import { createRawSnippet } from 'svelte';
	import { Mail, MailOpen } from '@lucide/svelte';
	import type { Problem } from '@tabroom/types';
	import { renderSnippet, type RowSpanContext } from '@tanstack/svelte-table';
	import Table from '../../../lib/components/utils/Table.svelte';
	import TableSearch from '../../../lib/components/utils/TableSearch.svelte';
	import { appFeatures, createAppColumnHelper } from '../../../lib/components/utils/table.hook';
	import type { AppColumnMeta } from '../../../lib/components/utils/table.types';

	const { Story } = defineMeta({
		title: 'Components/Table',
		component: Table,
	});

	type Person = { id: number; name: string; school: string; joined: string };

	const people: Person[] = [
		{ id: 1, name: 'Bravo Jones', school: 'Northview', joined: '2024-09-01' },
		{ id: 2, name: 'Alpha Smith', school: 'Southview', joined: '2023-01-15' },
		{ id: 3, name: 'Charlie Lee', school: 'Eastview', joined: '2025-03-20' },
	];

	const personHelper = createAppColumnHelper<Person>();
	const personColumns = personHelper.columns([
		personHelper.accessor('name', { header: 'Name', sortFn: 'alphanumeric' }),
		personHelper.accessor('school', { header: 'School', sortFn: 'alphanumeric' }),
		personHelper.accessor('joined', { header: 'Joined', sortFn: 'datetime' }),
	]);

	const problem: Problem = {
		type: 'about:blank',
		title: 'Internal Server Error',
		status: 500,
		detail: 'The judge records could not be loaded.',
		instance: '/v1/user/judges/history',
	};

	type Result = { entry: string; wins: number; points: number };

	const results: Result[] = [
		{ entry: 'Northview AB', wins: 5, points: 171.5 },
		{ entry: 'Southview CD', wins: 4, points: 168 },
		{ entry: 'Eastview EF', wins: 2, points: 160.5 },
	];

	const resultHelper = createAppColumnHelper<Result>();
	const sumOf = (rows: { original: Result }[], key: 'wins' | 'points') =>
		rows.reduce((total, row) => total + row.original[key], 0);
	const resultColumns = resultHelper.columns([
		resultHelper.accessor('entry', { header: 'Entry', footer: 'Total' }),
		resultHelper.accessor('wins', {
			header: 'Wins',
			footer: ({ table }) => String(sumOf(table.getRowModel().rows, 'wins')),
		}),
		resultHelper.accessor('points', {
			header: 'Points',
			footer: ({ table }) => String(sumOf(table.getRowModel().rows, 'points')),
		}),
	]);

	type Message = { id: number; read: boolean; subject: string; tourn: string };

	const messages: Message[] = [
		{ id: 1, read: false, subject: 'Pairings for Round 3 are out', tourn: 'Northview Invitational' },
		{ id: 2, read: true, subject: 'Your judging assignment', tourn: 'Southview Classic' },
		{ id: 3, read: true, subject: 'Tournament schedule change', tourn: 'Northview Invitational' },
	];

	// Same shape as the inbox: a status icon column locked at its size, the rest filling the table
	const messageHelper = createAppColumnHelper<Message>();
	const messageColumns = messageHelper.columns([
		messageHelper.accessor('read', {
			id: 'status',
			header: () => renderSnippet(srOnly, 'Status'),
			size: 54,
			enableResizing: false,
			enableSorting: false,
			cell: (info) => renderSnippet(statusIcon, info.getValue()),
		}),
		messageHelper.accessor('subject', { header: 'Subject', sortFn: 'alphanumeric' }),
		messageHelper.accessor('tourn', { header: 'Tournament', sortFn: 'alphanumeric' }),
	]);

	// 25 tournaments, so a page size of 10 gives 3 pages
	type Tourn = { id: string; name: string; state: string; districts: string };

	const states = ['TX', 'CA', 'NY', 'MN', 'IA'];
	const tourns: Tourn[] = Array.from({ length: 25 }, (_, i) => ({
		id: String(i + 1),
		name: i % 5 === 0 ? `District Tournament ${i + 1}` : `Invitational ${i + 1}`,
		state: states[i % states.length],
		districts: i % 5 === 0 ? 'Yes' : 'No',
	}));

	const tournHelper = createAppColumnHelper<Tourn>();
	const tournColumns = tournHelper.columns([
		tournHelper.accessor('name', { header: 'Tournament', sortFn: 'alphanumeric', meta: { filterOrder: 1 } }),
		tournHelper.accessor('state', { header: 'State', meta: { filterOrder: 2 } }),
		// Hidden: only for searching
		tournHelper.accessor('districts', { header: 'District Tournament', meta: { filterOptions: ['Yes', 'No'] } }),
	]);

	const titledColumns = tournHelper.columns([
		tournHelper.accessor('name', { header: 'Tournament' }),
		tournHelper.accessor('state', { header: 'State', meta: { title: 'Two-letter state code' } }),
	]);

	type Note = { name: string; notes: string };

	const longNotes = 'Prefers a slower delivery, flows on paper, and wants clear voting issues at the end of every final focus. Please signpost.';
	const notes: Note[] = [
		{ name: 'Bravo Jones', notes: longNotes },
		{ name: 'Alpha Smith', notes: 'Short note' },
	];

	const noteHelper = createAppColumnHelper<Note>();
	const noteColumns = noteHelper.columns([
		noteHelper.accessor('name', { header: 'Name', size: 120 }),
		noteHelper.accessor('notes', { id: 'truncated', header: 'Truncated (default)', size: 200 }),
		noteHelper.accessor('notes', {
			id: 'wrapped',
			header: 'Wrapped (truncate: false)',
			size: 200,
			meta: { truncate: false, cellClass: 'whitespace-normal' },
		}),
	]);

	// One row per student; entry-level columns span that entry's students
	type Speaker = { ballot: number; side: string; entry: string; student: number; name: string };

	const speakers: Speaker[] = [
		{ ballot: 11, side: 'Aff', entry: 'Northview AB', student: 101, name: 'Ada Byron' },
		{ ballot: 11, side: 'Aff', entry: 'Northview AB', student: 102, name: 'Ben Okafor' },
		{ ballot: 12, side: 'Neg', entry: 'Southview CD', student: 201, name: 'Cy Park' },
		{ ballot: 12, side: 'Neg', entry: 'Southview CD', student: 202, name: 'Dee Ruiz' },
	];

	const speakerHelper = createAppColumnHelper<Speaker>();
	// Merge on the entry's ballot, not the displayed value
	const sameBallot = ({ row, anchorRow }: RowSpanContext<typeof appFeatures, Speaker, string>) =>
		row.original.ballot === anchorRow.original.ballot;

	const pointsInput = createRawSnippet((label: () => string) => ({
		render: () => `<input class="w-16 rounded border border-border px-1" type="number" step="0.5" aria-label="${label()}">`,
	}));

	const inputMeta: AppColumnMeta = { truncate: false, cellClass: 'py-0.5' };
	const pointsColumn = (id: string, header: string) =>
		speakerHelper.display({
			id,
			header,
			cell: (info) => renderSnippet(pointsInput, `${header} points for ${info.row.original.name}`),
			meta: inputMeta,
		});

	const speakerColumns = speakerHelper.columns([
		speakerHelper.accessor('side', { header: 'Side', spanRows: sameBallot, size: 54, enableResizing: false }),
		speakerHelper.accessor('entry', { header: 'Entry', spanRows: sameBallot }),
		speakerHelper.accessor('name', { header: 'Speaker' }),
		speakerHelper.group({
			id: 'points',
			header: 'Points',
			columns: speakerHelper.columns([
				pointsColumn('style', 'Style'),
				pointsColumn('content', 'Content'),
				pointsColumn('strategy', 'Strategy'),
			]),
		}),
	]);
</script>

<script lang="ts">
	// Page state for the Manual Pagination story: the story slices the tourns the way a page backed by a server would
	let manualPagination = $state({ pageIndex: 0, pageSize: 10 });
	const manualPage = $derived(
		tourns.slice(manualPagination.pageIndex * 10, (manualPagination.pageIndex + 1) * 10),
	);
</script>

{#snippet srOnly(label: string)}
	<span class="sr-only">{label}</span>
{/snippet}

{#snippet statusIcon(read: boolean)}
	{#if read}
		<MailOpen class="size-5" aria-hidden="true" />
		<span class="sr-only">Read</span>
	{:else}
		<Mail class="size-5" aria-hidden="true" />
		<span class="sr-only">Unread</span>
	{/if}
{/snippet}

<Story
	name="Sortable"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: /^name/i }));
		const firstName = canvasElement.querySelector('tbody tr td');
		await expect(firstName).toHaveTextContent('Alpha Smith');
	}}
>
	{#snippet template()}
		<Table columns={personColumns} data={people} />
	{/snippet}
</Story>

<Story
	name="Empty"
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByText('No judges found')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table columns={personColumns} data={[]} emptyMessage="No judges found" />
	{/snippet}
</Story>

<Story name="Loading">
	{#snippet template()}
		<Table columns={personColumns} data={[]} isLoading />
	{/snippet}
</Story>

<!-- The problem's title, detail and instance are shown when the API returned one -->
<Story
	name="Error"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Internal Server Error')).toBeInTheDocument();
		await expect(canvas.getByText('The judge records could not be loaded.')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table columns={personColumns} data={[]} isError {problem} />
	{/snippet}
</Story>

<Story name="Error Without Problem">
	{#snippet template()}
		<Table columns={personColumns} data={[]} isError />
	{/snippet}
</Story>

<!-- The tfoot only renders when a column defines a footer -->
<Story
	name="Footer"
	play={async ({ canvasElement }) => {
		const footer = canvasElement.querySelector('tfoot');
		await expect(footer).toHaveTextContent('Total');
		await expect(footer).toHaveTextContent('11');
		await expect(footer).toHaveTextContent('500');
	}}
>
	{#snippet template()}
		<Table columns={resultColumns} data={results} />
	{/snippet}
</Story>

<!-- Rows are only clickable, and highlighted on hover, when onRowClick is set -->
<Story
	name="Clickable Rows"
	args={{ onRowClick: fn() }}
	play={async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByText('Your judging assignment'));
		await expect(args.onRowClick).toHaveBeenCalledWith(messages[1]);
	}}
>
	{#snippet template(args)}
		<Table
			columns={messageColumns}
			data={messages}
			getRowClassName={(row) => (row.read ? '' : 'font-semibold')}
			onRowClick={args.onRowClick}
		/>
	{/snippet}
</Story>

<!-- A column with enableResizing: false is locked at its size; the others share the rest -->
<Story
	name="Locked Width Column"
	play={async ({ canvasElement }) => {
		const status = within(canvasElement).getByRole('columnheader', { name: 'Status' });
		await expect(status.getBoundingClientRect().width).toBeCloseTo(54, 0);
		await expect(status.querySelector('.table-column-resizer')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table columns={messageColumns} data={messages} />
	{/snippet}
</Story>

<Story
	name="Resizing Off"
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('.table-column-resizer')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table columns={personColumns} data={people} enableColumnResizing={false} />
	{/snippet}
</Story>

<!-- columnVisibility hides columns by id; the data and column definitions stay the same -->
<Story
	name="Hidden Columns"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole('columnheader', { name: /school/i })).not.toBeInTheDocument();
		await expect(canvas.queryByText('Northview')).not.toBeInTheDocument();
		await expect(canvas.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table columnVisibility={{ school: false }} columns={personColumns} data={people} />
	{/snippet}
</Story>

<!-- TableSearch goes in Table's above snippet; `pager` shows the pager for the pageSize. The hidden District column is still searchable. -->
<Story
	name="Search and Pager"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const rows = () => canvasElement.querySelectorAll('tbody tr');

		await expect(rows()).toHaveLength(10);
		await expect(canvas.getByText('1-10 of 25')).toBeInTheDocument();
		await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
		await expect(canvas.getByText('Page 2 of 3')).toBeInTheDocument();

		await userEvent.type(canvas.getByRole('searchbox', { name: 'Search Tournament' }), 'district');
		await expect(rows()).toHaveLength(5);
		await expect(canvas.getByText('1-5 of 5')).toBeInTheDocument();

		await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Search by' }), 'District Tournament');
		await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'District Tournament value' }), 'No');
		await expect(canvas.getByText('1-10 of 20')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table
			columnVisibility={{ districts: false }}
			columns={tournColumns}
			data={tourns}
			getRowId={(row) => row.id}
			pageSize={10}
			pager
		>
			{#snippet above(table)}
				<TableSearch {table} />
			{/snippet}
		</Table>
	{/snippet}
</Story>

<!-- With `pagination` the story owns the page state and hands the table one page at a time, as a page backed by a paginated API does -->
<Story
	name="Manual Pagination"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const rows = () => canvasElement.querySelectorAll('tbody tr');

		await expect(rows()).toHaveLength(10);
		await expect(canvas.getByText('1-10 of 25')).toBeInTheDocument();
		await expect(canvas.getByText('District Tournament 1')).toBeInTheDocument();
		await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
		await expect(canvas.getByText('Page 2 of 3')).toBeInTheDocument();
		await expect(canvas.getByText('District Tournament 11')).toBeInTheDocument();
		await expect(canvas.queryByText('District Tournament 1')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<Table
			columns={tournColumns}
			data={manualPage}
			getRowId={(row) => row.id}
			onPaginationChange={(next) => (manualPagination = next)}
			pager
			pagination={manualPagination}
			rowCount={tourns.length}
		/>
	{/snippet}
</Story>

<!-- meta.title puts hover text on a column's body cells -->
<Story
	name="Cell Title"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getAllByTitle('Two-letter state code')).toHaveLength(3);
		await expect(canvas.getByText('TX').closest('td')).toHaveAttribute('title', 'Two-letter state code');
	}}
>
	{#snippet template()}
		<Table columns={titledColumns} data={tourns.slice(0, 3)} />
	{/snippet}
</Story>

<!-- Cells clip to one line by default; meta.truncate: false lets content wrap -->
<Story name="Long Content">
	{#snippet template()}
		<Table columns={noteColumns} data={notes} />
	{/snippet}
</Story>

<!-- The ballot scoring layout: spanned entry columns, a grouped header, inputs, no sorting -->
<Story
	name="Form Table"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('table', { name: 'Speaker points' })).toBeInTheDocument();
		await expect(canvas.getByRole('columnheader', { name: 'Points' })).toHaveAttribute('colspan', '3');
		await expect(canvas.getByText('Northview AB').closest('td')).toHaveAttribute('rowspan', '2');
		await expect(canvasElement.querySelector('.table-sort-button')).not.toBeInTheDocument();

		const style = canvas.getByLabelText('Style points for Ada Byron');
		await userEvent.type(style, '28.5');
		await expect(style).toHaveValue(28.5);
	}}
>
	{#snippet template()}
		<Table
			caption="Speaker points"
			columns={speakerColumns}
			data={speakers}
			enableSorting={false}
			getRowId={(row) => `${row.ballot}-${row.student}`}
			striped={false}
		/>
	{/snippet}
</Story>
