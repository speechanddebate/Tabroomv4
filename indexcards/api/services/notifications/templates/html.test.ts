import { describe, it, expect } from 'vitest';
import { sanitizeHTML } from '../../../helpers/text.js';
import { EMAIL_HTML, escapeHtml, html, raw, SafeHtml, textToHtml } from './html.js';

describe('escapeHtml', () => {
	it('escapes the characters that matter in text and quoted attributes', () => {
		expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`))
			.toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;');
	});
});

describe('html', () => {
	it('escapes interpolated strings and numbers', () => {
		const name = '<script>alert(1)</script>';

		expect(html`<p>${name} won ${3} rounds</p>`.value)
			.toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; won 3 rounds</p>');
	});

	it('escapes quotes in an attribute value so it cannot break out', () => {
		const url = 'https://example.com/" onclick="alert(1)';

		expect(html`<a href="${url}">x</a>`.value).toBe('<a href="https://example.com/&quot; onclick=&quot;alert(1)">x</a>');
	});

	it('passes nested html through without escaping it again', () => {
		const inner = html`<b>${'A & B'}</b>`;

		expect(html`<p>${inner}</p>`.value).toBe('<p><b>A &amp; B</b></p>');
	});

	it('joins arrays, escaping the strings in them', () => {
		expect(html`<ul>${['a<', 'b'].map((item) => html`<li>${item}</li>`)}</ul>`.value).toBe('<ul><li>a&lt;</li><li>b</li></ul>');
		expect(html`${['<', html`<br>`]}`.value).toBe('&lt;<br>');
	});

	it('renders nothing for null, undefined, and false', () => {
		expect(html`[${null}${undefined}${false}]`.value).toBe('[]');
	});

	it('renders 0', () => {
		expect(html`${0}`.value).toBe('0');
	});

	it('returns SafeHtml holding the markup', () => {
		const out = html`<p>x</p>`;

		expect(out).toBeInstanceOf(SafeHtml);
		expect(out.value).toBe('<p>x</p>');
	});

	it('does not trust a plain object shaped like SafeHtml', () => {
		const forged = { value: '<script>' } as unknown as string;

		expect(html`${forged}`.value).toBe('[object Object]');
	});
});

describe('raw', () => {
	it('passes markup through as is', () => {
		expect(html`<div>${raw('<p>a & b</p>')}</div>`.value).toBe('<div><p>a & b</p></div>');
	});
});

describe('textToHtml', () => {
	it('makes paragraphs from blank lines and breaks from single newlines', () => {
		expect(textToHtml('Round 3\nRoom 12\n\nJudges\nPat').value).toBe('<p>Round 3<br>Room 12</p><p>Judges<br>Pat</p>');
	});

	it('escapes the text', () => {
		expect(textToHtml('A < B & "C"').value).toBe('<p>A &lt; B &amp; &quot;C&quot;</p>');
	});

	it('treats a line of only spaces or tabs as blank, and drops leading, trailing, and repeated blank lines', () => {
		expect(textToHtml('\n\nOne\n \t\nTwo\n\n\n\nThree\n\n').value).toBe('<p>One</p><p>Two</p><p>Three</p>');
	});

	it('normalizes Windows and old Mac line endings', () => {
		expect(textToHtml('a\r\nb\r\rc').value).toBe('<p>a<br>b</p><p>c</p>');
	});

	it('keeps tab indentation as spaces that do not collapse', () => {
		expect(textToHtml('AFF\n\tvs NEG').value).toBe('<p>AFF<br>&nbsp;&nbsp;&nbsp;&nbsp;vs NEG</p>');
	});

	it('renders nothing for empty text', () => {
		expect(textToHtml('').value).toBe('');
		expect(textToHtml('\n \n').value).toBe('');
	});
});

describe('EMAIL_HTML through sanitizeHTML', () => {
	const clean = (input: string) => sanitizeHTML(input, EMAIL_HTML);

	it('keeps the text tags, lists, tables, and links email clients render', () => {
		const input = '<h2>Round 3</h2><p>Go to <b>Room 12</b>, <em>now</em>.</p><ul><li>Bring a <u>timer</u></li></ul>'
			+ '<blockquote>Quote</blockquote><hr /><table><thead><tr><th colspan="2">Aff</th></tr></thead>'
			+ '<tbody><tr><td align="center">Pat</td><td rowspan="1">Sam</td></tr></tbody></table>'
			+ '<p><a href="https://www.tabroom.com">Tabroom</a></p>';

		expect(clean(input)).toBe(input);
	});

	it('keeps the allowed inline styles', () => {
		const text = '<p style="color:#016f94;text-align:center;font-weight:bold">Hi</p>'
			+ '<span style="background-color:rgb(1, 2, 3);font-style:italic;text-decoration:underline">x</span>';
		const cell = '<table><tbody><tr><td style="color:navy">y</td></tr></tbody></table>';

		expect(clean(text)).toBe(text);
		expect(clean(cell)).toBe(cell);
	});

	it('drops layout styles and keeps the allowed ones beside them', () => {
		expect(clean('<p style="position:absolute;display:none;color:red;width:900px">Hi</p>')).toBe('<p style="color:red">Hi</p>');
	});

	it('drops a style value that only looks like an allowed one', () => {
		expect(clean('<p style="color:expression(alert(1))">Hi</p>')).toBe('<p>Hi</p>');
	});

	it('drops div, font, and center but keeps their text', () => {
		expect(clean('<div><font color="red"><center>Room 12</center></font></div>')).toBe('Room 12');
	});

	it('drops images entirely', () => {
		expect(clean('<p>Flyer<img src="https://example.com/flyer.png" alt="flyer"></p>')).toBe('<p>Flyer</p>');
	});

	it('drops script and style with their contents', () => {
		expect(clean('<p>Hi</p><script>alert(1)</script><style>p { color: red }</style>')).toBe('<p>Hi</p>');
	});

	it('drops class, id, and event handlers', () => {
		expect(clean('<p class="big" id="top" onclick="alert(1)">Hi</p>')).toBe('<p>Hi</p>');
	});

	it('drops a javascript: link but keeps its text', () => {
		expect(clean('<a href="javascript:alert(1)">Click</a>')).toBe('<a>Click</a>');
	});

	it('keeps mailto and tel links', () => {
		expect(clean('<a href="mailto:tab@example.com">Tab</a> <a href="tel:+15155551234">Call</a>'))
			.toBe('<a href="mailto:tab@example.com">Tab</a> <a href="tel:+15155551234">Call</a>');
	});

	it('drops forms and media', () => {
		expect(clean('<form action="https://evil.example"><input name="password"><button>Go</button></form><video src="x.mp4"></video>')).toBe('Go');
	});
});
