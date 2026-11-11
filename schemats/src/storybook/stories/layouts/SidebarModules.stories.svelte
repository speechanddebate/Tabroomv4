<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Home from '../../../routes/user/(sidebar)/Home.svelte';
	import Judging from '../../../routes/user/(sidebar)/Judging.svelte';
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
