<script lang="ts">

	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';

	import {
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		Dropdown,
		DropdownHeader,
		DropdownItem,
		DropdownGroup,
		Tooltip,
		Indicator,
	} from 'flowbite-svelte';
	import {
		House,
		Mail,
		LogOut,
		LayoutDashboard,
		Search,
	} from '@lucide/svelte';

	import { isAuthenticated, isSuSession, getSessionOwner, getPerson } from '$lib/helpers/SessionContext.svelte';

	//notification placeholders for now
	const { logoutFn, suEndFn, notificationCount = 0 } = $props();
	const rootPerson = $derived(getSessionOwner());
	const activePerson = $derived(getPerson());

	let activeUrl = $derived(page.url.pathname);
	const loginRedirect = $derived(
		encodeURIComponent(`${page.url.pathname}${page.url.search}`)
	);
	const loginHref = $derived(`${resolve('/user/login')}?redirect=${loginRedirect}`);
	const hideAuthControls = $derived(page.url.pathname === '/user/login');

	let loggingOut = $state(false);
	const logout = async (event: Event) => {
		loggingOut = true;
		event?.preventDefault();
		try {
			await logoutFn();
		} finally {
			loggingOut = false;
		}
	};
	let suEnding = $state(false);
	const suEnd = async (event: Event) => {
		suEnding = true;
		event?.preventDefault();
		await suEndFn();
		suEnding = false;
	};

	// Page status updates do not ordinarily trigger reactivity so this is
	// apparently necessary to keep it updated

	$effect( () => {
		activeUrl = page.url.pathname;
	});

	const dropdownItemClasses = 'text-sm hover:bg-accent-soft py-2 flex items-center gap-1';
</script>

<div>
	<Navbar
		class = 'items-start flex-nowrap flex-row
			bg-primary-deep
			sm:px-2 xl:px-4'
		breakpoint="lg"
		fluid = {true}
		navContainerClass = 'flex-nowrap py-1 justify-stretch'
	>
		<NavBrand
			class = 'flex-wrap mt-2 mb'
			href  = {resolve('/')}
		>
			<div class="flex nowrap
				p-0 m-0
				justify-center items-center
				ms-4 ps-2
			">
				<img
					class = "
						xl:h-[70.4px] xl:w-[48.3px]
						xl:pb-1
						lg:h-14 lg:w-[38.6px]
						md:h-[42.2px] md:w-7.25
						h-[28.2px] w-[19.3px]
						mr-0.5
						md:mr-1
					"
					alt   = "Tabroom Logo"
					src   = "/img/tabroom-sparky.png"
				/>
				<div>
					<h1
						class="
						hidden sm:inline
							whitespace-nowrap font-semibold text-white
							text-[28px]
							md:text-[36px] md:leading-4 md:tracking-[0.02em]
							lg:text-[42px] lg:tracking-[.02em] lg:py-1 lg:leading-7 pe-2
							xl:tracking-wider xl:text-[2.8rem] xl:py-1 xl:leading-8 xl:pb-1
							md:block
						"
					>
						TABROOM.COM
					</h1>
					<div class="
						text-accent italic w-auto font-semibold
						sm:inline
						md:text-[12px] md:ms-1 md:pb-1
						lg:text-[14px] lg:ms-1 lg:pb-1
						xl:text-xs xl:text-[15px] xl:tracking-[0.02em] xl:pl-1
						hidden
					">
						National Speech &amp; Debate Association
					</div>
				</div>
			</div>

		</NavBrand>
		<NavHamburger />
		<NavUl
			class = 'items-start text-base md:text-center
					order-2'
			{activeUrl}
			classes={{
				ul: 'bg-primary-deep border-primary-strong lg:bg-inherit lg:border-none lg:flex-row lg:justify-around lg:p-2 lg:text-xs lg:font-medium lg:mt-0 xl:mt-0',
				active: '!text-white font-semibold underline underline-offset-4 decoration-accent decoration-solid hover:bg-primary-strong hover:!text-white lg:hover:bg-transparent lg:hover:!text-accent lg:hover:underline lg:ps-2 lg:pe-2 lg:w-[12ex] xl:w-[12ex]',
				nonActive: '!text-primary-soft tracking-wide hover:bg-primary-strong hover:!text-white lg:hover:bg-transparent lg:hover:!text-accent lg:hover:underline lg:hover:underline-offset-4 lg:ps-2 lg:pe-2 lg:w-[11ex] xl:w-[12ex]',
			}}
		>
			<NavLi
				href  = "/"
			>Home</NavLi>

			<NavLi
				href="/circuits"
			>Circuits</NavLi>

			<NavLi
				href  = "/results"
			>Results</NavLi>

			<NavLi
				href  = "/paradigms"
			>Paradigms</NavLi>

			<NavLi
				href  = "/page/help"
			>Help</NavLi>
		</NavUl>

		<div class="flex grow w-1/12 order-2">
		</div>

		<!-- The Flowbite Svelte Search module proved to be a real PITA of obscurity -->
		<div id="search-bar"
			class="text-primary-soft mx-1
				md:flex
				md:order-3 md:w-1/6 md:ml-2 mr-2
				xl:ps-1 xl:pe-1 xl:w-1/5
				hidden
		">
			<form class='w-full'>
			<label
				class = "mb-2 text-sm font-medium text-text sr-only"
				for   = "default-search"
			>
				Search
			</label>
			<div class="relative">
				<div class="absolute inset-y-0 inset-s-0 flex items-center ps-3 pointer-events-none">
					<Search class="w-4 h-4 text-accent-soft" />
				</div>
				<input
					id    = "default-search"
					class = "block w-full p-2 ps-9 text-xs italic
						rounded-lg
						bg-primary-strong
						text-white
						border border-primary
						focus:border-accent
						lg:placeholder-primary-soft
						placeholder-transparent
					"
					placeholder = "Ctrl-s to search..."
					required
					type        = "search"
				/>
			</div>
			</form>
		</div>

		<div id="auth-controls"
			class="
				order-last ml-auto mr-1
				w-auto
				grow-0 shrink-0
				flex items-center justify-end
			"
			>
			{#if hideAuthControls} 	<!-- Intentionally hide auth controls on the login page -->
			{:else if isAuthenticated()}
			<div class="flex flex-col items-end gap-2">
				<div id="auth-user-buttons" class="flex gap-2">
					{#snippet authButton({href,linkLabel,tooltip, type}:
						{href?: string, linkLabel: string, tooltip: string, type: 'home' | 'User: Inbox' | 'profile'})}
						<svelte:element
							this={href ? 'a' : 'button'}
							id="{type}-button"
							class="
								relative
								inline-flex items-center justify-center
								w-12 h-12
								rounded-full
								border-2 border-primary
								bg-surface
								text-2xl font-semibold
								text-primary-deep
								hover:text-warning
								focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
							"
							aria-label={linkLabel}
							{href}
							type={href ? undefined : 'button'}
						>
						{#if type === 'home'}<House class="h-6 w-6" strokeWidth={2.5} />{/if}
						{#if type === 'User: Inbox'}
							<Mail class="h-6 w-6" strokeWidth={2.5} />
							{#if notificationCount > 0}
							<Indicator color="red" placement="top-right" size="xl">
								<span class="text-xs font-bold text-white">{notificationCount > 99 ? '99+' : notificationCount}</span>
							</Indicator>
							{/if}
						{/if}
						{#if type === 'profile'}
							{activePerson?.first?.[0]}{activePerson?.last?.[0]}
						{/if}
						</svelte:element>
						<Tooltip placement="bottom">{tooltip}</Tooltip>
					{/snippet}
					{@render authButton({href: resolve('/user/home'), linkLabel: 'go to user Home', tooltip: 'Home', type: 'home'})}
					{@render authButton({href: resolve('/user/inbox'), linkLabel: 'go to user Inbox', tooltip: 'User: Inbox', type: 'User: Inbox'})}
					{@render authButton({linkLabel: 'open user dropdown', tooltip: 'Profile', type: 'profile'})}
				</div>
				<div id="auth-user-details"
					class="flex flex-col leading-tight pe-1 ps-1 text-right w-full">
					{#if isSuSession()}
					<span class="text-xs italic text-accent whitespace-nowrap">
						{rootPerson?.email}
					</span>
					{/if}
					<a class="text-xs italic text-accent-soft whitespace-nowrap hover:underline"
					href="{resolve('/user/home')}">
						{isSuSession() ? 'as ' : ''}{activePerson?.email}
					</a>
				</div>
			</div>
			<Dropdown
				placement="bottom-end"
				transition = {slide}
				triggeredBy = "#profile-button"
			>
				<DropdownHeader
					class = "block w-full px-2 pt-1 border-b border-warning text-primary-deep"
				>
						<span class="block text-xs font-semibold">
							{activePerson?.first} {activePerson?.last}
						</span>
						{#if isSuSession()}
							<span class="block text-[10px] italic font-medium">
								{rootPerson?.email}
							</span>
						{/if}
						<span class="block text-[10px] italic font-medium">
							{isSuSession() ? 'as ' : ''}{activePerson?.email}
						</span>
				</DropdownHeader>
				<DropdownGroup>
					<DropdownItem
					class={dropdownItemClasses}
					href={resolve('/user/home')}
					><House class="w-4 h-4" />Home</DropdownItem>
				<DropdownItem
						class={dropdownItemClasses}
						href={resolve('/user/inbox')}
						>
						<span class="relative inline-flex items-center">
							<Mail class="w-4 h-4" />
							{#if notificationCount > 0}
								<Indicator color="red" placement="top-right" size="xs"/>
							{/if}
						</span>
						Inbox
				</DropdownItem>
				<DropdownItem
					class="{dropdownItemClasses} opacity-50 cursor-not-allowed"
					aria-disabled="true"
					><LayoutDashboard class="w-4 h-4" />Dashboard</DropdownItem>
				</DropdownGroup>
				<DropdownGroup>
				{#if isSuSession()}
				<DropdownItem
					class="{dropdownItemClasses} cursor-pointer"
					disabled={suEnding}
					onclick={suEnd}
					><LogOut class="w-4 h-4" />End Su Session</DropdownItem>
				{/if}
				<DropdownItem
					class="{dropdownItemClasses} cursor-pointer"
					disabled={loggingOut}
					onclick={logout}
					><LogOut class="w-4 h-4" />{loggingOut ? 'Logging out...' : 'Logout'}</DropdownItem>
				</DropdownGroup>
			</Dropdown>
			{:else} <!-- Logged out state -->
			<div class="flex items-center gap-2">
				<a
					class='
						bg-accent
						text-text
						hover:bg-accent-soft
						focus:ring-4 focus:outline-hidden focus:ring-accent
						font-medium rounded-md text-sm
						px-2 py-1.5
						text-center
						border border-accent
					'
					href="https://www.tabroom.com/user/login/new_user.mhtml"
				>
					SIGN UP
				</a>

				<a
					class='
						text-white
						bg-primary-strong
						hover:bg-primary-deep
						focus:ring-4 focus:outline-hidden focus:ring-primary
						font-medium rounded-md text-sm
						px-2 py-1.5
						text-center
						border border-primary-deep
						hover:border-primary
					'
					href={loginHref}
				>
					LOGIN
				</a>
			</div>

			{/if}
		</div>
	</Navbar>
</div>