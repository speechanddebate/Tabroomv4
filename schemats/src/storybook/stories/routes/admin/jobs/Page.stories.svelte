<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { HttpResponse, http } from 'msw';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { ScheduledJob } from '@tabroom/types';
	import { getAdminJobRunMockHandler, getAdminJobsMockHandler } from '$indexcards/index.msw';
	import JobsPage from '../../../../../routes/admin/jobs/+page.svelte';
	import { freezeTime } from '../../../../utils/freezeTime';
	import * as fx from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/Admin/Jobs',
		component: JobsPage,
		parameters: { layout: 'padded', session: { Person: fx.admin } },
		beforeEach: () => freezeTime(fx.now),
	});

	const serve = (jobs: ScheduledJob[]) => ({ msw: { handlers: [getAdminJobsMockHandler({ jobs }), getAdminJobRunMockHandler({ name: 'learn-course-sync', jobId: '42' })] } });

	const row = (canvasElement: HTMLElement, name: string) => within(within(canvasElement).getByText(name).closest('tr') as HTMLElement);
</script>

<Story
	name="All states"
	parameters={serve(fx.everyState)}
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);
		await canvas.findByText('learn-course-sync');

		await step('a healthy job shows its schedule, next run, and last result in the admin\'s zone', async () => {
			const learn = row(canvasElement, 'learn-course-sync');
			await expect(learn.getByText('On schedule')).toBeInTheDocument();
			await expect(learn.getByText('Every 30 minutes')).toBeInTheDocument();
			await expect(learn.getByText('in 20 minutes')).toBeInTheDocument();
			await expect(learn.getByText(/12:20/)).toBeInTheDocument();
			await expect(learn.getByText(/4 courses, 0 failed/)).toBeInTheDocument();
			await expect(learn.getByRole('button', { name: /Run now/ })).toBeEnabled();
		});

		await step('a job that is switched off cannot be run', async () => {
			const districts = row(canvasElement, 'districts-import');
			await expect(districts.getByText('Off')).toBeInTheDocument();
			await expect(districts.getByText('Not scheduled')).toBeInTheDocument();
			await expect(districts.getByText('Has not run')).toBeInTheDocument();
			await expect(districts.getByRole('button', { name: /Run now/ })).toBeDisabled();
			await expect(districts.getByText('Switched off here')).toBeInTheDocument();
		});

		await step('failing and overdue jobs say so and can still be run', async () => {
			const points = row(canvasElement, 'points-post');
			await expect(points.getByText('Failing')).toBeInTheDocument();
			await expect(points.getByText(/NSDA 503 Service Unavailable/)).toBeInTheDocument();
			await expect(points.getByRole('button', { name: /Run now/ })).toBeEnabled();
			await expect(row(canvasElement, 'invoice-status').getByText('Overdue')).toBeInTheDocument();
		});

		await step('a job with a run in progress or waiting cannot be run again', async () => {
			const nats = row(canvasElement, 'nats-appearances');
			await expect(nats.getByText('Running')).toBeInTheDocument();
			await expect(nats.getByRole('button', { name: /Run now/ })).toBeDisabled();
			await expect(nats.getByText('A run is in progress')).toBeInTheDocument();
			const inbox = row(canvasElement, 'inbox-cleanup');
			await expect(inbox.getByText('Queued')).toBeInTheDocument();
			await expect(inbox.getByText('A run is waiting to start')).toBeInTheDocument();
		});
	}}
/>

<Story
	name="Empty"
	parameters={serve([])}
	play={async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText('No scheduled jobs.')).toBeInTheDocument();
	}}
/>

<Story
	name="Run now succeeds"
	parameters={(() => {
		// The run request flips the job to queued, which the refetch after it then shows
		const job = { ...fx.learnSync };
		return {
			msw: {
				handlers: [
					getAdminJobsMockHandler(() => ({ jobs: [job] })),
					getAdminJobRunMockHandler(() => {
						job.queued = true;
						return { name: job.name, jobId: '42' };
					}),
				],
			},
		};
	})()}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole('button', { name: /Run now/ }));

		await expect(await canvas.findByText('Queued')).toBeInTheDocument();
		await expect(canvas.getByRole('button', { name: /Run now/ })).toBeDisabled();
		await expect(canvas.getByText('A run is waiting to start')).toBeInTheDocument();
	}}
/>

<Story
	name="Refresh"
	parameters={(() => {
		// The job finishes a failed run between the first load and the refresh
		let loads = 0;
		return {
			msw: {
				handlers: [
					getAdminJobsMockHandler(() => ({ jobs: [loads++ === 0 ? fx.learnSync : { ...fx.learnSync, failing: true }] })),
				],
			},
		};
	})()}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText('On schedule')).toBeInTheDocument();

		await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }));

		await expect(await canvas.findByText('Failing')).toBeInTheDocument();
		await waitFor(() => expect(canvas.getByRole('button', { name: 'Refresh' })).toBeEnabled());
	}}
/>

<Story
	name="Run now refused"
	parameters={{
		msw: {
			handlers: [
				getAdminJobsMockHandler({ jobs: [fx.learnSync] }),
				http.post('*/admin/jobs/:jobName/run', () => HttpResponse.json(
					{ type: 'about:blank', title: 'Conflict', status: 409, detail: 'learn-course-sync already has a run in progress or waiting' },
					{ status: 409, headers: { 'Content-Type': 'application/problem+json' } },
				)),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole('button', { name: /Run now/ }));

		// Refused, so nothing changed: once the request is over the job can be asked for again
		await waitFor(() => expect(canvas.getByRole('button', { name: /Run now/ })).toBeEnabled());
		await expect(canvas.getByText('On schedule')).toBeInTheDocument();
	}}
/>

<Story
	name="Queues unavailable"
	parameters={{
		msw: {
			handlers: [
				http.get('*/admin/jobs', () => HttpResponse.json(
					{ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'The job queues are unavailable right now' },
					{ status: 503, headers: { 'Content-Type': 'application/problem+json' } },
				)),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole('alert')).toHaveTextContent('The job queues are unavailable right now.');
		await expect(canvas.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
	}}
/>

<Story
	name="Phone width"
	globals={{ viewport: { value: 'mobile2', isRotated: false } }}
	parameters={serve(fx.everyState)}
/>
