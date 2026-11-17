import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import config from '../../../config.js';
import { html, textToHtml } from './html.js';
import { renderEmail } from './shell.js';

const originalSchematsUrl = config.schemats_url;
const unsubscribeUrl = 'https://www.example.org/unsubscribe/token123';

beforeAll(() => {
	Object.assign(config, { schemats_url: 'https://www.example.org' });
});

afterAll(() => {
	Object.assign(config, { schemats_url: originalSchematsUrl });
});

const tabroom = (overrides = {}) => renderEmail({
	kind: 'tabroom',
	unsubscribeUrl,
	content: html`<p>Pairings for <b>round 3</b> are up.</p>`,
	...overrides,
});
const account = (overrides = {}) => renderEmail({
	kind: 'account',
	content: html`<p>Your password was changed.</p>`,
	...overrides,
});
const tourn = (overrides = {}) => renderEmail({
	kind: 'tourn',
	unsubscribeUrl,
	tournName: 'Big Tournament <&> Invitational',
	messageId: 812,
	content: html`<p>Rounds start at 8:00 a.m.</p>`,
	...overrides,
});
const reportUrl = `mailto:help@tabroom.com?subject=${encodeURIComponent('Report message 812 from Big Tournament <&> Invitational')}`;

describe('renderEmail html', () => {
	it('is a full document with the text wordmark, no images, and the content', () => {
		const { html: page } = tabroom();

		expect(page).toMatch(/^<!doctype html>/);
		expect(page).toContain('<meta charset="utf-8">');
		expect(page).toMatch(/>Tabroom\.com<\/div>\n<div [^>]*>National Speech &amp; Debate Association<\/div>/);
		expect(page).not.toContain('<img');
		expect(page).toContain('<p>Pairings for <b>round 3</b> are up.</p>');
		expect(page).not.toContain('<style');
	});

	it('has a row of unsubscribe, settings, privacy, and terms links in the tabroom footer', () => {
		const { html: page } = tabroom();

		expect(page).toContain([
			`<a href="${unsubscribeUrl}" style="color: #016f94;">Unsubscribe</a>`,
			'<a href="https://www.example.org/user/profile" style="color: #016f94;">Email settings</a>',
			'<a href="https://www.speechanddebate.org/privacy-policy" style="color: #016f94;">Privacy policy</a>',
			'<a href="https://www.speechanddebate.org/terms-conditions" style="color: #016f94;">Terms and conditions</a>',
		].join(' · '));
		expect(page).toContain('because you have a Tabroom.com account');
		expect(page).not.toContain('change to your Tabroom.com account');
	});

	it('has no opt-out in the account footer, only where to get help and the privacy and terms links', () => {
		const { html: page } = account();

		expect(page).toContain('because of a change to your Tabroom.com account');
		expect(page).toContain('<a href="mailto:help@tabroom.com"');
		expect(page).toContain([
			'<a href="https://www.speechanddebate.org/privacy-policy" style="color: #016f94;">Privacy policy</a>',
			'<a href="https://www.speechanddebate.org/terms-conditions" style="color: #016f94;">Terms and conditions</a>',
		].join(' · '));
		expect(page).not.toContain('unsubscribe');
		expect(page).not.toContain('Unsubscribe');
		expect(page).not.toContain('/user/profile');
	});

	it('names the tournament, disclaims it, and offers a report link before the tabroom footer in the tourn footer', () => {
		const { html: page } = tourn();

		expect(page).toContain('<p style="margin: 0 0 12px;">Big Tournament &lt;&amp;&gt; Invitational sent this message through Tabroom.com. '
			+ 'The National Speech &amp; Debate Association (NSDA) does not write or review tournament messages. '
			+ `<a href="${reportUrl.replaceAll('&', '&amp;')}" style="color: #016f94;">Report this message</a></p>`);
		expect(page.indexOf('Report this message')).toBeLessThan(page.indexOf('because you have a Tabroom.com account'));
		expect(page).toContain(`<a href="${unsubscribeUrl}" style="color: #016f94;">Unsubscribe</a>`);
	});

	it.each([['tabroom', tabroom], ['account', account]] as const)('has no tournament disclaimer or report link in the %s footer', (_kind, render) => {
		const { html: page, text } = render();

		expect(page).not.toContain('Report this message');
		expect(page).not.toContain('sent this message through Tabroom.com');
		expect(text).not.toContain('Report this message');
	});

	it.each([['tabroom', tabroom], ['account', account], ['tourn', tourn]] as const)('names the NSDA and its postal address in the %s footer', (_kind, render) => {
		const { html: page } = render();

		expect(page).toContain('Tabroom.com is a service of the National Speech &amp; Debate Association (NSDA).');
		expect(page).toContain('National Speech &amp; Debate Association<br>6600 Westown Parkway Suite 270<br>West Des Moines, IA 50266<br>USA');
	});

	it('stays well under the size where Gmail clips a message', () => {
		const lines = Array.from({ length: 400 }, (_, i) => `Entry ${i}\tvs Opponent ${i}\tRoom ${i}\tJudge Name ${i}`).join('\n');
		const { html: page } = tabroom({ content: textToHtml(lines) });

		// Gmail clips html over 102 KB; the shell itself should be a small share of that
		expect(page.length - textToHtml(lines).value.length).toBeLessThan(5_000);
	});
});

describe('renderEmail text', () => {
	it('flattens the content and adds the tabroom footer', () => {
		const { text } = tabroom({ content: html`<p>Your round is in <a href="https://example.com/room">room 12</a>.</p><img src="x.png"><p>Go <b>now</b>.</p>` });

		expect(text).toContain('Your round is in room 12 [https://example.com/room].\n\nGo now.');
		expect(text).not.toContain('<');
		expect(text).toContain([
			`Unsubscribe: ${unsubscribeUrl}`,
			'Email settings: https://www.example.org/user/profile',
			'Privacy policy: https://www.speechanddebate.org/privacy-policy',
			'Terms and conditions: https://www.speechanddebate.org/terms-conditions',
		].join('\n'));
		expect(text).toContain('Tabroom.com is a service of the National Speech & Debate Association (NSDA).');
		expect(text).toMatch(/National Speech & Debate Association\n6600 Westown Parkway Suite 270\nWest Des Moines, IA 50266\nUSA$/);
	});

	it('keeps plain text line breaks and tab indentation', () => {
		const { text } = tabroom({ content: textToHtml('Round 3\nRoom 12\n\nAFF\n\tvs NEG') });

		expect(text).toMatch(/^Round 3\nRoom 12\n\nAFF\n {4}vs NEG\n/);
	});

	it('puts the tournament disclaimer and report link before the tabroom footer in the tourn footer', () => {
		const { text } = tourn();

		expect(text).toContain('----------------------------\n\n'
			+ 'Big Tournament <&> Invitational sent this message through Tabroom.com. '
			+ 'The National Speech & Debate Association (NSDA) does not write or review tournament messages.\n'
			+ `Report this message: ${reportUrl}\n\n`
			+ 'You\'re getting this email because you have a Tabroom.com account.');
		expect(text).toContain(`Unsubscribe: ${unsubscribeUrl}`);
	});

	it('has no opt-out in the account footer', () => {
		const { text } = account();

		expect(text).toContain('Your password was changed.');
		expect(text).toContain('If you didn\'t make it, contact help@tabroom.com.');
		expect(text).toContain('Privacy policy: https://www.speechanddebate.org/privacy-policy\nTerms and conditions: https://www.speechanddebate.org/terms-conditions');
		expect(text).not.toContain('nsubscribe');
		expect(text).not.toContain('/user/profile');
	});
});
