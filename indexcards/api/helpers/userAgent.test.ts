import { parseUserAgent, readAgent } from './userAgent.js';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const firefoxLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0';

describe('parseUserAgent', () => {
	it('builds classic\'s agent_data fields', () => {
		expect(parseUserAgent(iphone)).toEqual({
			brand: 'Apple',
			device: 'iPhone',
			os: 'iOS 18.1',
			os_version: '18.1',
			browser: 'Safari',
			browser_version: '18.1',
		});
	});

	it('uses the OS version name where there is one', () => {
		const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
		expect(parseUserAgent(windows)).toMatchObject({ os: 'Windows 10', browser: 'Microsoft Edge' });
	});

	it('leaves out what it can\'t tell', () => {
		expect(JSON.stringify(parseUserAgent('curl/8.0'))).toBe('{}');
	});
});

describe('readAgent', () => {
	it('reads classic\'s JSON', () => {
		expect(readAgent('{"browser":"Chrome","os":"Mac OS X 10.15.7","brand":"Apple"}')).toEqual({ browser: 'Chrome', os: 'Mac OS X 10.15.7' });
	});

	it('parses a raw User-Agent', () => {
		expect(readAgent(firefoxLinux)).toEqual({ browser: 'Firefox', os: 'Linux' });
	});

	it('returns nulls for nothing stored or nothing known', () => {
		expect(readAgent(null)).toEqual({ browser: null, os: null });
		expect(readAgent('')).toEqual({ browser: null, os: null });
		expect(readAgent('{}')).toEqual({ browser: null, os: null });
		expect(readAgent('null')).toEqual({ browser: null, os: null });
		expect(readAgent('curl/8.0')).toEqual({ browser: null, os: null });
	});
});
