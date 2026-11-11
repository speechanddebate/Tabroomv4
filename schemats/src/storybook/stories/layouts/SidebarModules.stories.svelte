<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import Home from '../../../routes/user/(sidebar)/Home.svelte';
	import Judging from '../../../routes/user/(sidebar)/Judging.svelte';
	import SiteAdmin from '../../../routes/user/(sidebar)/SiteAdmin.svelte';
	import UserAccount from '../../../routes/user/(sidebar)/userAccount.svelte';
	import Sidebar from '../../../lib/layouts/Sidebar.svelte';

	const { Story } = defineMeta({
		title: 'Layouts/Sidebar/Sidebar Modules',
		component: Sidebar,
		parameters: {
			layout: 'fullscreen',
		},
	});
</script>

<Story name="User Modules">
	<Home />
	<Judging />
	<UserAccount />
</Story>

<Story
	name="Site admin"
	parameters={{ session: { Person: { id: 4410, first: 'Avery', last: 'Quinn', email: 'aquinn@tabroom.example', tz: 'America/Chicago', site_admin: 1 } } }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('heading', { name: 'Site Admin' })).toBeInTheDocument();
		await expect(canvas.getByRole('link', { name: 'Scheduled Jobs' })).toHaveAttribute('href', '/admin/jobs');
	}}
>
	<SiteAdmin />
	<Judging />
	<UserAccount />
</Story>

<Story
	name="Site admin group hidden from everyone else"
	parameters={{ session: { Person: { id: 4411, first: 'Maya', last: 'Okafor', email: 'mokafor@lakesideisd.example', tz: 'America/Chicago', site_admin: 0 } } }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole('heading', { name: 'Site Admin' })).not.toBeInTheDocument();
		await expect(canvas.getByRole('heading', { name: 'Judging' })).toBeInTheDocument();
	}}
>
	<SiteAdmin />
	<Judging />
	<UserAccount />
</Story>
