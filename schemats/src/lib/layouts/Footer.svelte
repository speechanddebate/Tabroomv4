<script lang="ts">

	import { version } from '$app/env';

	import {
		Footer,
		FooterCopyright,
		FooterLink,
		FooterLinkGroup,
	} from 'flowbite-svelte';

	const footerLinkClass = `
		hover:text-white
		hover:bg-primary-strong
		text-center
		p-4
		radius-lg
		hover:underline
		hover:decoration-solid decoration underline-offset-4 hover:decoration-accent
	`;

</script>

<div>

	<Footer
		class="bg-primary-deep rounded-none shadow-none"
		role="contentinfo"
	>
		<div class='items-center py- w-full block'>
			<div class='md:w-3/4 content-center mx-auto'>
			<nav aria-label="Footer links">
				<FooterLinkGroup
					class = "flex flex-wrap items-center mt-2
						text-md text-accent w-full
						sm:mt-0 font-semibold sm:items-center sm:justify-between
					"
				>
				<FooterLink
					class={footerLinkClass}
					href="https://www.speechanddebate.org/join/"
					rel="noopener noreferrer"
				>Join the NSDA</FooterLink>
				<FooterLink
					class={footerLinkClass}
					href="https://www.speechanddebate.org/mission"
					rel="noopener noreferrer"
				>Mission</FooterLink>
				<FooterLink
					class={footerLinkClass}
					href="/page/about">About</FooterLink>
				<FooterLink
					class={footerLinkClass}
					href="/page/help">Help</FooterLink>
				<FooterLink
					class={footerLinkClass}
					href="https://www.speechanddebate.org/privacy-policy"
					rel="noopener noreferrer"
				>Privacy</FooterLink>
				<FooterLink
					class={footerLinkClass}
					href="https://www.speechanddebate.org/terms-conditions"
					rel="noopener noreferrer"
				>Terms</FooterLink>

				</FooterLinkGroup>
			</nav>
			</div>

			<div class='mx-auto w-full py-4'>
				<FooterCopyright
					class = "text-primary-soft hover:text-accent font-medium mx-auto text-center pt-4"
					by    = "National Speech & Debate Assocation™"
					href  = "https://www.speechanddebate.org"
					rel   = "noopener noreferrer"
					year  = {new Date().getFullYear()}
				/>
				<p class="text-primary-soft text-xs text-center pt-2">
					build {version}
				</p>
			</div>
		</div>
	</Footer>

</div>