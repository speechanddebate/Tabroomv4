import * as textHelper from './text.js';

describe('profanityCheck', () => {
	it('should return an empty array for clean text', () => {
		expect(textHelper.profanityCheck('This is a clean sentence.')).toEqual([]);
	});

	it('should return the list of found profanities for text with profanity', () => {
		expect(textHelper.profanityCheck('This sentence contains shit.')).toEqual(['shit']);
	});
});

describe('sanitizeHTML', () => {
	it('keeps the tags and attributes classic\'s editor allows', () => {
		const html = '<p style="color:red">Aff won on <strong>framework</strong>. <a href="https://example.com" target="_blank">Card</a></p>';

		expect(textHelper.sanitizeHTML(html)).toBe(html);
	});

	it('normalizes styles', () => {
		expect(textHelper.sanitizeHTML('<p style="color: red">Hi</p>')).toBe('<p style="color:red">Hi</p>');
	});

	it('drops other tags but keeps their text', () => {
		expect(textHelper.sanitizeHTML('<div><p>Clear <font color="red">2AR</font></p></div>')).toBe('<p>Clear 2AR</p>');
	});

	it('drops scripts with their content', () => {
		expect(textHelper.sanitizeHTML('<p>Good round</p><script>alert(1)</script>')).toBe('<p>Good round</p>');
	});

	it('drops attributes that aren\'t allowed', () => {
		expect(textHelper.sanitizeHTML('<p onclick="x()" class="big">Hi</p>')).toBe('<p>Hi</p>');
	});

	it('drops links that aren\'t http or https', () => {
		expect(textHelper.sanitizeHTML('<a href="javascript:alert(1)">Hi</a>')).toBe('<a>Hi</a>');
	});

	it('keeps &nbsp; between words as the character, where classic deleted it', () => {
		expect(textHelper.sanitizeHTML('<p>Good&nbsp;round</p>')).toBe('<p>Good round</p>');
	});

	it('keeps images', () => {
		expect(textHelper.sanitizeHTML('<p><img src="https://example.com/flow.png" alt="flow"></p>')).toBe('<p><img src="https://example.com/flow.png" alt="flow" /></p>');
	});

	it('takes options that override the defaults', () => {
		expect(textHelper.sanitizeHTML('<div>Hi</div>', { allowedTags: ['div'] })).toBe('<div>Hi</div>');
	});

	describe('restrictive, for paradigms', () => {
		it('drops links, images, headings and spans but keeps their text', () => {
			const html = '<h2>Policy</h2><p>Read <a href="https://example.com">this</a> <span style="color:red">first</span><img src="https://example.com/x.png"></p>';

			expect(textHelper.sanitizeHTML(html, { restrictive: true })).toBe('Policy<p>Read this first</p>');
		});

		it('keeps formatting and lists', () => {
			const html = '<p style="color:red"><strong>Speed</strong> is <em>fine</em></p><ul><li>Tech over truth</li></ul>';

			expect(textHelper.sanitizeHTML(html, { restrictive: true })).toBe(html);
		});
	});
});