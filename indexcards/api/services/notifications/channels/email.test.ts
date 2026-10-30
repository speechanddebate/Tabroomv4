import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config from '../../../config.js';
import logger from '../../../helpers/logger.js';
import { closeMail, getTransporter, sendEmail, type OutboundEmail } from './email.js';

// The module uses nodemailer's default export. Each createTransport gives a fresh
// transporter whose sendMail and close are the shared spies
const { createTransport, sendMail, close } = vi.hoisted(() => ({
	createTransport: vi.fn(),
	sendMail: vi.fn(),
	close: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const relay = (overrides = {}) => ({
	host: 'smtp.example.com',
	port: 25,
	secure: false,
	rejectUnauthorized: true,
	pool: 20,
	...overrides,
});

const mailConfig = (overrides: Partial<typeof config.mail> = {}): typeof config.mail => ({
	mode: 'live',
	allowLiveOutsideProduction: true,
	from: 'live@www.tabroom.com',
	smtp: relay(),
	...overrides,
});

/** A failed send the way nodemailer reports it: its own code or Node's, plus the relay's reply when there was one */
const mailError = (message: string, extra: { code?: string; responseCode?: number; response?: string; permanent?: boolean } = {}) =>
	Object.assign(new Error(message), extra);

const accepted = (to: string) => ({ accepted: [to], rejected: [], pending: [], response: '250 OK: queued', messageId: '<abc@tabroom.com>', envelope: { from: '', to: [to] } });

const original = config.mail;

beforeEach(() => {
	config.mail = mailConfig();
	createTransport.mockReset().mockImplementation(() => ({ sendMail, close }));
	sendMail.mockReset().mockResolvedValue(accepted('coach@example.com'));
	close.mockReset();
	vi.spyOn(logger, 'debug').mockImplementation(() => logger);
	vi.spyOn(logger, 'info').mockImplementation(() => logger);
	vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	vi.spyOn(logger, 'error').mockImplementation(() => logger);
});

afterEach(() => {
	closeMail();
	config.mail = original;
	vi.restoreAllMocks();
});

describe('getTransporter', () => {
	const builtOptions = () => createTransport.mock.calls[0][0] as Record<string, unknown>;

	it('opens a pooled connection to the relay with timeouts', () => {
		getTransporter();

		expect(createTransport).toHaveBeenCalledOnce();
		expect(builtOptions()).toEqual({
			host: 'smtp.example.com',
			port: 25,
			secure: false,
			pool: true,
			maxConnections: 20,
			maxMessages: Infinity,
			tls: { rejectUnauthorized: true },
			connectionTimeout: 10_000,
			greetingTimeout: 10_000,
			socketTimeout: 60_000,
		});
	});

	it('keeps one transporter across calls', () => {
		const first = getTransporter();

		expect(getTransporter()).toBe(first);
		expect(createTransport).toHaveBeenCalledOnce();
	});

	it('logs in when the relay has credentials', () => {
		config.mail = mailConfig({ smtp: relay({ port: 587, secure: true, user: 'tab', pass: 'secret' }) });
		getTransporter();

		expect(builtOptions()).toMatchObject({ port: 587, secure: true, auth: { user: 'tab', pass: 'secret' } });
	});

	it('passes no credentials when only one half is set', () => {
		config.mail = mailConfig({ smtp: relay({ user: 'half' }) });
		getTransporter();

		expect(builtOptions()).not.toHaveProperty('auth');
	});

	it('passes the certificate setting through', () => {
		config.mail = mailConfig({ smtp: relay({ host: 'mailpit', rejectUnauthorized: false }) });
		getTransporter();

		expect(builtOptions()).toMatchObject({ host: 'mailpit', tls: { rejectUnauthorized: false } });
	});

	it('closeMail closes the transporter and the next call opens a new one', () => {
		const first = getTransporter();

		closeMail();

		expect(close).toHaveBeenCalledOnce();
		expect(getTransporter()).not.toBe(first);
		expect(createTransport).toHaveBeenCalledTimes(2);
	});

	it('closeMail is harmless before anything was opened', () => {
		expect(() => closeMail()).not.toThrow();
		expect(close).not.toHaveBeenCalled();
	});
});

describe('sendEmail', () => {
	const message: OutboundEmail = {
		to: 'Pat Coach <coach@example.com>',
		from: 'Tab <tab@tabroom.com>',
		replyTo: 'tab@tabroom.com',
		subject: 'Round 3 posted',
		text: 'You are in room 12',
		html: '<p>You are in room 12</p>',
		headers: { 'List-Unsubscribe': '<https://www.tabroom.com/unsubscribe/abc>' },
	};

	it('hands the message to the relay as given and reports it sent', async () => {
		await expect(sendEmail(message)).resolves.toEqual({ status: 'sent' });

		expect(sendMail).toHaveBeenCalledOnce();
		expect(sendMail.mock.calls[0][0]).toBe(message);
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('<abc@tabroom.com>'));
	});

	it('reuses the relay connection across sends', async () => {
		await sendEmail(message);
		await sendEmail({ ...message, to: 'other@example.com' });

		expect(createTransport).toHaveBeenCalledOnce();
		expect(sendMail).toHaveBeenCalledTimes(2);
	});

	it('logs and drops the message in log mode', async () => {
		config.mail = mailConfig({ mode: 'log' });

		await expect(sendEmail(message)).resolves.toEqual({ status: 'logged' });

		expect(createTransport).not.toHaveBeenCalled();
		expect(sendMail).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Round 3 posted'));
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('coach@example.com'));
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('You are in room 12'));
	});

	it('sends to the redirect addresses instead and keeps the original recipient in a header', async () => {
		config.mail = mailConfig({ mode: 'redirect', redirectTo: ['me@example.com', 'you@example.com'] });

		await expect(sendEmail(message)).resolves.toEqual({ status: 'sent' });

		expect(sendMail.mock.calls[0][0]).toEqual({
			...message,
			to: ['me@example.com', 'you@example.com'],
			headers: { ...message.headers, 'X-Original-To': 'Pat Coach <coach@example.com>' },
		});
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('me@example.com, you@example.com'));
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('coach@example.com'));
	});

	it('rejects when the relay took the connection but refused the address', async () => {
		sendMail.mockResolvedValue({ ...accepted(message.to), accepted: [], rejected: [message.to], response: '550 5.1.1 No such user' });

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: 'relay responded 550 5.1.1 No such user' });
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it.each([
		[550, 'EENVELOPE', '550 5.1.1 No such user'],
		[552, 'EMESSAGE', '552 Message too large'],
		[554, 'EENVELOPE', '554 Transaction failed'],
	])('rejects on a %s reply', async (responseCode, code, response) => {
		sendMail.mockRejectedValue(mailError("Can't send mail - all recipients were rejected", { code, responseCode, response, permanent: true }));

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: `relay responded ${responseCode}` });
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(response));
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('sorts a reply by its class when nodemailer did not say whether it is permanent', async () => {
		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EENVELOPE', responseCode: 550, response: '550 No such user' }));
		await expect(sendEmail(message)).resolves.toMatchObject({ status: 'rejected' });

		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EPROTOCOL', responseCode: 503, response: '503 Bad sequence of commands' }));
		await expect(sendEmail(message)).resolves.toMatchObject({ status: 'retry' });
	});

	it('rejects and says to check the relay settings when the relay refuses the login', async () => {
		sendMail.mockRejectedValue(mailError('Invalid login', { code: 'EAUTH', responseCode: 535, response: '535 5.7.8 Authentication credentials invalid', permanent: true }));

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: 'relay responded 535' });
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('check the relay settings'));
	});

	it.each([
		[421, '421 4.7.0 Too many connections'],
		[450, '450 4.2.0 Greylisted, try again later'],
		[451, '451 4.3.0 Temporary system problem'],
		[452, '452 4.2.2 Mailbox full'],
	])('asks for a retry on a %s reply', async (responseCode, response) => {
		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EENVELOPE', responseCode, response, permanent: false }));

		await expect(sendEmail(message)).resolves.toEqual({ status: 'retry', reason: `relay responded ${responseCode}` });
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('will retry'));
	});

	it.each([
		['a refused connection', mailError('connect ECONNREFUSED 10.0.0.5:25', { code: 'ECONNREFUSED' })],
		['a connection failure', mailError('Connection timeout', { code: 'ECONNECTION' })],
		['a greeting timeout', mailError('Greeting never received', { code: 'ETIMEDOUT' })],
		['a dropped socket', mailError('Connection closed unexpectedly', { code: 'ESOCKET' })],
		['a DNS failure', mailError('getaddrinfo ENOTFOUND smtp.example.com', { code: 'EDNS' })],
		['a bad greeting', mailError('Invalid greeting', { code: 'EPROTOCOL' })],
		['a connection reset', mailError('read ECONNRESET', { code: 'ECONNRESET' })],
	])('asks for a retry on %s', async (_label, error) => {
		sendMail.mockRejectedValue(error);

		await expect(sendEmail(message)).resolves.toEqual({ status: 'retry', reason: error.message });
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it.each([
		['an empty envelope', mailError('No recipients defined', { code: 'EENVELOPE' })],
		['a message that cannot be built', mailError('ENOENT: no such file, open attachment.pdf', { code: 'EMESSAGE' })],
		['a broken attachment stream', mailError('Stream error', { code: 'ESTREAM' })],
		['missing credentials', mailError('Missing credentials for "PLAIN"', { code: 'ENOAUTH' })],
		['a TLS failure', mailError('self-signed certificate', { code: 'ETLS' })],
		['bad arguments', new Error('Cannot read properties of undefined')],
	])('rejects on %s', async (_label, error) => {
		sendMail.mockRejectedValue(error);

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: error.message });
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('rejects on a throw that is not an Error', async () => {
		sendMail.mockRejectedValue('boom');

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: 'boom' });
	});

	it('clips a long relay reply in the log', async () => {
		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EENVELOPE', responseCode: 550, response: `550 ${'x'.repeat(500)}`, permanent: true }));

		await sendEmail(message);

		const line = String(vi.mocked(logger.warn).mock.calls[0][0]);
		expect(line.length).toBeLessThan(300);
	});
});
