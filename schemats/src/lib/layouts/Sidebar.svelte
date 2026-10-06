<script lang='ts' module>
	export type SidebarControls = {
		// Closes the sidebar when it is the drawer (below lg) and leaves the
		// column alone at lg and up, e.g. after picking something on mobile.
		closeDrawer: () => void;
	};
</script>

<script lang='ts'>
	import { onMount, type Snippet } from 'svelte';
	import { ChevronRight } from '@lucide/svelte';

	type Props = {
		children: Snippet<[SidebarControls]>;
		// Leave unset for the default: closed below lg, open at lg and up.
		initialOpen?: boolean;
	};

	let { children, initialOpen = undefined }: Props = $props();

	const isLg = () => window.matchMedia('(min-width: 1024px)').matches;

	// undefined until mounted means "use the breakpoint default". CSS handles
	// that case, so the server render is already right on both screen sizes.
	let open = $derived(initialOpen);

	onMount(() => {
		open ??= isLg();
	});

	const controls: SidebarControls = {
		closeDrawer: () => {
			if (!isLg()) open = false;
		},
	};

	const shellClass = $derived([
		open === true ? '' : 'translate-x-full',
		open === false ? 'lg:w-0 lg:border-l-0' : 'lg:w-1/4',
	].join(' '));

	// Closed at lg, the column is w-0, so the content would otherwise rewrap
	// one word per line and stretch the page. Take it out of layout instead.
	// Below lg it stays rendered so the drawer can slide out with it.
	const contentClass = $derived(
		open === undefined ? 'invisible lg:visible' : open ? '' : 'invisible lg:hidden'
	);

	// Chevron points the way the sidebar will move: right to close, left to open.
	const chevronClass = $derived(
		open === undefined ? 'rotate-180 lg:rotate-0' : open ? '' : 'rotate-180'
	);

	// At lg the column animates its width, which would rewrap the content on
	// every frame. While that runs, pin the content to the open column's width
	// (measured by the sizer below, minus the 2px border) and let
	// #sidebar-content clip it. Below lg only translate animates, so this
	// never kicks in there.
	let openWidth = $state(0);
	let animating = $state(false);

	const isWidthTransition = (e: TransitionEvent) =>
		e.target === e.currentTarget && e.propertyName === 'width';

	const menuWidth = $derived(
		animating && openWidth > 0 ? `${openWidth - 2}px` : undefined
	);
</script>

<!--
	lib/layouts/Sidebar.svelte

	Below lg: a drawer fixed to the right edge of the viewport.
	At lg and up: a column beside the page content. The panel inside sticks to
	the top of the viewport so a short sidebar stays put on a long page, and a
	sidebar taller than the viewport scrolls on its own.

	The sizer is a zero-footprint flex item (a quarter of the row wide, pulled
	back by an equal negative margin) that reports the open column's width
	even while the sidebar is closed.
-->
<div
	class="hidden lg:block w-1/4 -ml-[25%] h-0 shrink-0"
	aria-hidden="true"
	bind:clientWidth={openWidth}
></div>
<aside
	class="
		sidebar
		fixed inset-y-0 right-0 z-40
		w-72 max-w-[85vw]
		shrink-0
		bg-surface-alt
		border-l-2 border-border
		transition-[translate,width] duration-200 motion-reduce:transition-none
		lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:translate-x-0
		lg:rounded-tr-md
		{shellClass}
	"
	ontransitioncancel={(e) => { if (isWidthTransition(e)) animating = false; }}
	ontransitionend={(e) => { if (isWidthTransition(e)) animating = false; }}
	ontransitionrun={(e) => { if (isWidthTransition(e)) animating = true; }}
>
	<div class="relative h-full lg:sticky lg:top-0 lg:h-auto">
		<button
			class="
				absolute top-28 -left-7 lg:top-4
				flex items-center justify-center
				w-7 h-12
				bg-surface-alt
				border-2 border-r-0 border-border
				rounded-l-md
				text-primary-strong
				hover:bg-primary-soft hover:text-primary-deep
				focus-visible:outline-2 focus-visible:outline-primary-strong
			"
			aria-controls="sidebar-content"
			aria-expanded={open ?? false}
			aria-label="Toggle sidebar"
			onclick={() => { open = !open; }}
		>
			<ChevronRight
				class="size-4 transition-transform motion-reduce:transition-none {chevronClass}"
			/>
		</button>

		<div
			id="sidebar-content"
			class="h-full overflow-x-hidden overflow-y-auto lg:max-h-dvh {contentClass}"
		>
			<div style:width={menuWidth} class="menu p-2 pt-4 lg:p-4">
				{@render children(controls)}
			</div>
		</div>
	</div>
</aside>
