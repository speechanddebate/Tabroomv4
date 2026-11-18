import { html } from '../html.js';

/**
 * Tells the person their password changed, so an owner whose password someone else changed finds
 * out. No link: a link in a security notice reads as phishing
 */
export function passwordChanged() {
	return {
		subject: 'Your Tabroom.com password has been changed',
		html: html`<p>The password on your Tabroom.com account was changed.</p>
<p>If you didn't make this change, contact help@tabroom.com right away.</p>`,
	};
}
