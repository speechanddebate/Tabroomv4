import config from '../../../../config.js';
import { html } from '../html.js';

/** The email with the link and code that confirm a person's address, sent at sign-up and after an address change */
export function confirmEmail({ code, link }: { code: string; link: string }) {
	const codePage = `${config.schemats_url}/user/profile/confirm`;

	return {
		subject: 'Confirm your email address for Tabroom.com',
		html: html`<p>Confirm this address to get email from Tabroom.com, such as tournament announcements and your ballots.</p>
<p style="text-align: center;"><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #016f94; color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 4px;">Confirm my email address</a></p>
<p>Or enter this code on Tabroom.com:</p>
<p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center;">${code}</p>
<p>Enter it at <a href="${codePage}" style="color: #016f94;">${codePage.replace(/^https?:\/\//, '')}</a>, or select Confirm your email on your Tabroom.com home page.</p>
<p>The link and code work for seven days. If you didn't create a Tabroom.com account or change your email address, ignore this email.</p>`,
	};
}
