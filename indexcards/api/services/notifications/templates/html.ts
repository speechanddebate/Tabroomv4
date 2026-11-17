import type { IOptions } from 'sanitize-html';

/** Markup that is already safe to put in an email: built by `html`, or trusted through `raw` */
export class SafeHtml {
	constructor(readonly value: string) {}
}

export type HtmlValue = SafeHtml | string | number | null | undefined | false | readonly HtmlValue[];

export function escapeHtml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;');
}

function render(value: HtmlValue): string {
	if (value instanceof SafeHtml) return value.value;
	if (Array.isArray(value)) return value.map(render).join('');
	if (value === null || value === undefined || value === false) return '';
	return escapeHtml(String(value));
}

/**
 * Tagged template for email markup. Interpolated strings and numbers are escaped, so they
 * are safe in text and in quoted attributes; SafeHtml and arrays of values pass through;
 * null, undefined, and false render nothing, for conditional pieces
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
	return new SafeHtml(strings.reduce((out, part, i) => out + render(values[i - 1]) + part));
}

/** Marks markup as trusted without escaping it: a stored message body, or a sanitizer's output */
export function raw(markup: string): SafeHtml {
	return new SafeHtml(markup);
}

export function textToHtml(text: string): SafeHtml {
	// Splits on a blank line, even one holding stray spaces or tabs ("Round 3\n \t\nRoom 12")
	const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter(Boolean);
	return raw(paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/\n/g, '<br>')}</p>`).join(''));
}

// A color as a hex code, rgb(), or a name: "#016f94", "rgb(1, 111, 148)", "navy"
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i, /^[a-z]+$/i];

/**
 * What a tournament's staff may put in an email they type: the tags and inline styles Gmail,
 * Outlook, and Apple Mail render alike. Passed to helpers/text.js sanitizeHTML, whose options
 * replace its editor defaults. No images (blocked by most clients, and a tracking pixel under
 * Tabroom's name), no class or id, no layout styles, and links only to web, mail, and phone
 */
const EMAIL_TAGS = [
	'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'h2', 'h3', 'h4',
	'ul', 'ol', 'li', 'blockquote', 'hr', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

export const EMAIL_HTML: IOptions = {
	allowedTags: EMAIL_TAGS,
	// style is allowed on text blocks and cells only; which styles is up to allowedStyles
	allowedAttributes: {
		a: ['href'],
		p: ['style'],
		span: ['style'],
		h2: ['style'],
		h3: ['style'],
		h4: ['style'],
		li: ['style'],
		blockquote: ['style'],
		td: ['colspan', 'rowspan', 'align', 'style'],
		th: ['colspan', 'rowspan', 'align', 'style'],
	},
	allowedStyles: {
		'*': {
			color: COLOR,
			'background-color': COLOR,
			'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/],
			'font-style': [/^(normal|italic)$/],
			'text-decoration': [/^(none|underline|line-through)$/],
			'text-align': [/^(left|right|center|justify)$/],
		},
	},
	allowedSchemes: ['http', 'https', 'mailto', 'tel'],
};

/**
 * What the inbox shows of a stored message. A body notify() wrote is already safe, but classic and
 * masoncards still write rows as typed, and a blast's email row holds its composer's html, so every
 * body is cleaned on the way out. EMAIL_HTML plus what classic's editor lets a composed email carry
 * (images, centering, captions, link targets), under the same style rules
 */
export const INBOX_HTML: IOptions = {
	...EMAIL_HTML,
	allowedTags: [...EMAIL_TAGS, 'img', 'center', 'caption', 'h5', 'h6'],
	allowedAttributes: {
		...EMAIL_HTML.allowedAttributes,
		a: ['href', 'target'],
		img: ['alt', 'height', 'width', 'src'],
		table: ['border', 'cellspacing', 'cellpadding', 'align'],
	},
};
