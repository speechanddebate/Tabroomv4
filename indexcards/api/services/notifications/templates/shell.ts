import { convert } from 'html-to-text';
import config from '../../../config.js';
import { html, type SafeHtml } from './html.js';

export type EmailShellInput = {
	content: SafeHtml;
} & (
	/** Mail about the person's own account goes out whatever their email setting, so it offers no opt-out */
	| { kind: 'account' }
	/** Everything else Tabroom sends, including mail generated from a tournament's data */
	| { kind: 'tabroom'; unsubscribeUrl: string }
	/** Free text a tournament's staff typed: says who wrote it, and offers a way to report it */
	| { kind: 'tourn'; unsubscribeUrl: string; tournName: string; messageId: number }
);

export type RenderedEmail = { html: string; text: string };

const NSDA_LINE = 'Tabroom.com is a service of the National Speech & Debate Association (NSDA).';
const NSDA_NAME = 'National Speech & Debate Association';
const POSTAL_ADDRESS = [
	NSDA_NAME,
	'6600 Westown Parkway Suite 270',
	'West Des Moines, IA 50266',
	'USA',
];
const HELP_ADDRESS = 'help@tabroom.com';
const PRIVACY_URL = 'https://www.speechanddebate.org/privacy-policy';
const TERMS_URL = 'https://www.speechanddebate.org/terms-conditions';

// Inline styles only: the colors are schemats' app.css tokens
const FONT = 'font-family: Helvetica, Arial, sans-serif;';
const PAGE = '#e5ebed';
const SURFACE = '#fefefe';
const HEADER = '#00445f';
const HEADER_ACCENT = '#00abe8';
const LINK = '#016f94';
const TEXT = '#222222';
const MUTED = '#666666';
const BORDER = '#dddddd';

/**
 * Wraps a message's content in the Tabroom header and the footer for its sender kind, as html and as plain text.
 * The header is a text wordmark, not the logo image: any <img> in a short email trips SpamAssassin's
 * HTML_IMAGE_ONLY rules (up to 2.7 points), and text also shows when a client blocks images
 */
export function renderEmail(input: EmailShellInput): RenderedEmail {
	const linkStyle = `color: ${LINK};`;

	const disclaimer = input.kind === 'tourn'
		? {
			text: `${input.tournName} sent this message through Tabroom.com. The ${NSDA_NAME} (NSDA) does not write or review tournament messages.`,
			reportUrl: `mailto:${HELP_ADDRESS}?subject=${encodeURIComponent(`Report message ${input.messageId} from ${input.tournName}`)}`,
		}
		: null;

	const reason = input.kind !== 'account'
		? {
			html: html`You're getting this email because you have a Tabroom.com account.`,
			text: 'You\'re getting this email because you have a Tabroom.com account.',
		}
		: {
			html: html`You're getting this email because of a change to your Tabroom.com account. If you didn't make it, contact <a href="mailto:${HELP_ADDRESS}" style="${linkStyle}">${HELP_ADDRESS}</a>.`,
			text: `You're getting this email because of a change to your Tabroom.com account. If you didn't make it, contact ${HELP_ADDRESS}.`,
		};

	const footerLinks = [
		...(input.kind !== 'account'
			? [
				{ label: 'Unsubscribe', url: input.unsubscribeUrl },
				{ label: 'Email settings', url: `${config.schemats_url}/user/profile` },
			]
			: []),
		{ label: 'Privacy policy', url: PRIVACY_URL },
		{ label: 'Terms and conditions', url: TERMS_URL },
	];

	const page = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin: 0; padding: 0; background-color: ${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color: ${PAGE};">
<tr><td align="center" style="padding: 24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: ${SURFACE};">
<tr><td bgcolor="${HEADER}" style="background-color: ${HEADER}; padding: 20px 24px;">
<div style="${FONT} font-size: 28px; font-weight: bold; line-height: 1.1; color: #ffffff;">Tabroom.com</div>
<div style="${FONT} font-size: 13px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; color: ${HEADER_ACCENT};">${NSDA_NAME}</div>
</td></tr>
<tr><td style="padding: 24px; ${FONT} font-size: 16px; line-height: 1.5; color: ${TEXT};">
${input.content}
</td></tr>
<tr><td align="center" style="padding: 16px 24px 24px; text-align: center; border-top: 1px solid ${BORDER}; ${FONT} font-size: 13px; line-height: 1.5; color: ${MUTED};">
${disclaimer && html`<p style="margin: 0 0 12px;">${disclaimer.text} <a href="${disclaimer.reportUrl}" style="${linkStyle}">Report this message</a></p>`}
<p style="margin: 0 0 12px;">${reason.html}</p>
<p style="margin: 0 0 12px;">${footerLinks.map((link, i) => html`${i > 0 && ' · '}<a href="${link.url}" style="${linkStyle}">${link.label}</a>`)}</p>
<p style="margin: 0 0 12px;">${NSDA_LINE}</p>
<p style="margin: 0;">${POSTAL_ADDRESS.map((line, i) => html`${i > 0 && html`<br>`}${line}`)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	return {
		html: page.value,
		text: [
			plainText(input.content.value),
			'----------------------------',
			disclaimer && `${disclaimer.text}\nReport this message: ${disclaimer.reportUrl}`,
			reason.text,
			footerLinks.map((link) => `${link.label}: ${link.url}`).join('\n'),
			NSDA_LINE,
			POSTAL_ADDRESS.join('\n'),
		].filter(Boolean).join('\n\n'),
	};
}

/** Html as readable plain text, paragraphs kept, images dropped, links shown after their text */
function plainText(markup: string): string {
	return convert(markup, {
		wordwrap: false,
		selectors: [{ selector: 'img', format: 'skip' }],
	}).trim();
}
