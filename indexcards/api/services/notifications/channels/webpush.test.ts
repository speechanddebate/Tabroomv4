import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webPush from 'web-push';
import config from '../../../config.js';
import logger from '../../../helpers/logger.js';
import { checkPushHost, getVapid, initWebPush, isPushConfigured } from './webpush.js';

describe('checkPushHost', () => {
	it.each([
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://web.push.apple.com/abc',
		'https://wns2-by3p.notify.windows.com/w/?token=abc',
	])('accepts %s', (endpoint) => {
		expect(checkPushHost(new URL(endpoint))).toBe(true);
	});

	it.each([
		['a lookalike suffix', 'https://fcm.googleapis.com.evil.com/send'],
		['a lookalike prefix', 'https://evilfcm.googleapis.com/send'],
		['a subdomain of an exact host', 'https://evil.fcm.googleapis.com/send'],
		['the bare wildcard domain', 'https://push.apple.com/abc'],
		['an IP literal', 'https://10.19.25.1/send'],
		['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
		['an explicit port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
		['userinfo', 'https://user:pass@fcm.googleapis.com/fcm/send/abc'],
		['a username only', 'https://user@fcm.googleapis.com/fcm/send/abc'],
		['an unrelated host', 'https://example.com/send'],
	])('rejects %s', (_label, endpoint) => {
		expect(checkPushHost(new URL(endpoint))).toBe(false);
	});
});

describe('initWebPush', () => {
	const original = config.webpush;
	const keys = webPush.generateVAPIDKeys();
	const valid = { subject: 'mailto:test@tabroom.com', publicKey: keys.publicKey, privateKey: keys.privateKey };

	beforeEach(() => {
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		config.webpush = original;
		vi.restoreAllMocks();
	});

	it('configures push when all keys are present', () => {
		config.webpush = valid;
		initWebPush();

		expect(isPushConfigured()).toBe(true);
		expect(getVapid()?.publicKey).toBe(keys.publicKey);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('gives a stable 16 hex character fingerprint', () => {
		config.webpush = valid;
		initWebPush();
		const first = getVapid()?.fingerprint;
		initWebPush();

		expect(first).toMatch(/^[0-9a-f]{16}$/);
		expect(getVapid()?.fingerprint).toBe(first);
	});

	it.each(['subject', 'publicKey', 'privateKey'] as const)('warns and stays unconfigured without %s', (key) => {
		config.webpush = { ...valid, [key]: undefined };
		initWebPush();

		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith('Web push keys not present, web push will not work');
		expect(isPushConfigured()).toBe(false);
		expect(getVapid()).toBeNull();
	});

	it('warns and stays unconfigured when the keys are malformed', () => {
		config.webpush = { ...valid, publicKey: 'not-a-key', privateKey: 'also-not-a-key' };

		expect(() => initWebPush()).not.toThrow();
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(isPushConfigured()).toBe(false);
		expect(getVapid()).toBeNull();
	});

	it('clears an earlier configuration when re-run without keys', () => {
		config.webpush = valid;
		initWebPush();
		config.webpush = {};
		initWebPush();

		expect(isPushConfigured()).toBe(false);
	});
});
