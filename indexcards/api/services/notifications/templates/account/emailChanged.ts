import { html } from '../html.js';
import { maskEmail } from '../../unsubscribe.js';

/**
 * Tells the old address that the account's address changed, so an owner whose email someone else
 * changed finds out. No link or code: a link here reads as phishing, and the old address mustn't
 * confirm the new one
 */
export function emailChanged({ newAddress }: { newAddress: string }) {
	return {
		subject: 'Your Tabroom.com email address was changed',
		html: html`<p>The email address on your Tabroom.com account was changed to ${maskEmail(newAddress)}. From now on, Tabroom.com email goes to the new address.</p>
<p>If you didn't make this change, contact help@tabroom.com right away.</p>`,
	};
}
