import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import factories from '../../../../tests/factories/index.js';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import logger from '../../../helpers/logger.js';
import { verifyUnsubscribeToken } from '../unsubscribe.js';
import { closeMail, emailMessage, getTransporter, sendEmail, type OutboundEmail } from './email.js';

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
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(response), {
			'event.name': 'notification.email.rejected',
			'error.type': String(responseCode),
		});
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
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('check the relay settings'), {
			'event.name': 'notification.email.relay_misconfigured',
			'error.type': '535',
		});
	});

	it.each([
		[421, '421 4.7.0 Too many connections'],
		[450, '450 4.2.0 Greylisted, try again later'],
		[451, '451 4.3.0 Temporary system problem'],
		[452, '452 4.2.2 Mailbox full'],
	])('asks for a retry on a %s reply', async (responseCode, response) => {
		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EENVELOPE', responseCode, response, permanent: false }));

		await expect(sendEmail(message)).resolves.toEqual({ status: 'retry', reason: `relay responded ${responseCode}` });
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('will retry'), {
			'event.name': 'notification.email.retry',
			'error.type': String(responseCode),
		});
	});

	it.each([
		['a refused connection', mailError('connect ECONNREFUSED 10.0.0.5:25', { code: 'ECONNREFUSED' })],
		['a connection failure', mailError('Connection timeout', { code: 'ECONNECTION' })],
		['a greeting timeout', mailError('Greeting never received', { code: 'ETIMEDOUT' })],
		['a dropped socket', mailError('Connection closed unexpectedly', { code: 'ESOCKET' })],
		['a DNS failure', mailError('getaddrinfo ENOTFOUND smtp.example.com', { code: 'EDNS' })],
		['a bad greeting', mailError('Invalid greeting', { code: 'EPROTOCOL' })],
		['a connection reset', mailError('read ECONNRESET', { code: 'ECONNRESET' })],
		// The relay never answered and nodemailer did not say the message was at fault, so the retries decide
		['an error with no code', new Error('Connection closed')],
		['a pool closed mid-send', new Error('Cannot read properties of undefined')],
	])('asks for a retry on %s', async (_label, error) => {
		sendMail.mockRejectedValue(error);

		await expect(sendEmail(message)).resolves.toEqual({ status: 'retry', reason: error.message });
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.error).not.toHaveBeenCalled();
	});

	it.each([
		['an empty envelope', mailError('No recipients defined', { code: 'EENVELOPE' })],
		['a message that cannot be built', mailError('ENOENT: no such file, open attachment.pdf', { code: 'EMESSAGE' })],
		['a broken attachment stream', mailError('Stream error', { code: 'ESTREAM' })],
		['missing credentials', mailError('Missing credentials for "PLAIN"', { code: 'ENOAUTH' })],
		['a TLS failure', mailError('self-signed certificate', { code: 'ETLS' })],
	])('rejects on %s', async (_label, error) => {
		sendMail.mockRejectedValue(error);

		await expect(sendEmail(message)).resolves.toEqual({ status: 'rejected', reason: error.message });
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('asks for a retry on a throw that is not an Error', async () => {
		sendMail.mockRejectedValue('boom');

		await expect(sendEmail(message)).resolves.toEqual({ status: 'retry', reason: 'boom' });
	});

	it('clips a long relay reply in the log', async () => {
		sendMail.mockRejectedValue(mailError('Mail command failed', { code: 'EENVELOPE', responseCode: 550, response: `550 ${'x'.repeat(500)}`, permanent: true }));

		await sendEmail(message);

		const line = String(vi.mocked(logger.warn).mock.calls[0][0]);
		expect(line.length).toBeLessThan(300);
	});
});

describe('emailMessage', () => {
	const originalUrls = { url: config.url, schemats_url: config.schemats_url, shared_secret: config.shared_secret };
	const sent = () => sendMail.mock.calls[0][0] as OutboundEmail;
	/** The token inside the List-Unsubscribe header's angle brackets */
	const headerToken = (mail: OutboundEmail) => mail.headers?.['List-Unsubscribe']?.replace(/^<.*\/unsubscribe\/|>$/g, '') ?? '';

	let Person: { id: number; email: string };

	beforeAll(async () => {
		Person = await factories.person.create({ first: 'Pat', last: 'Coach', no_email: 0 });
	});

	beforeEach(() => {
		config.url = 'https://api.example.org';
		config.schemats_url = 'https://www.example.org';
		config.shared_secret = 'email message test secret';
	});

	afterEach(() => {
		Object.assign(config, originalUrls);
	});

	const newMessage = async (overrides = {}) => await factories.message.create({ person: Person.id, ...overrides });

	const autoReplyHeaders = { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'OOF, AutoReply' };

	it('builds the email from the message row with the shell, list headers, and auto-reply headers', async () => {
		const message = await newMessage({
			subject: 'Round 3 posted',
			body: '<p>You are in room 12</p>',
			url: '/user/judge/ballot/1',
			sender_string: 'Tab <tab@tabroom.com>',
		});

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'sent' });

		const mail = sent();
		expect(mail.to).toBe(`"Pat Coach" <${Person.email}>`);
		// From stays in our domain so the relay signs it; the message's sender is who gets the replies
		expect(mail.from).toBe(config.mail.from);
		expect(mail.replyTo).toBe('Tab <tab@tabroom.com>');
		expect(mail.subject).toBe('[TAB] Round 3 posted');
		expect(mail.html).toContain('<p>You are in room 12</p>');
		expect(mail.html).toContain('>Tabroom.com</div>');
		expect(mail.text).toMatch(/^You are in room 12\n/);
		// The url is the inbox and push tap target; a link the email should show is in the body
		expect(mail.html).not.toContain('/user/judge/ballot/1');
		expect(mail.text).not.toContain('/user/judge/ballot/1');
		expect(mail.text).toContain('Unsubscribe: https://www.example.org/unsubscribe/');
		expect(mail.text).toContain('https://www.example.org/user/profile');

		const token = headerToken(mail);
		expect(mail.headers).toEqual({
			...autoReplyHeaders,
			'List-Unsubscribe': `<https://api.example.org/v1/rest/notify/email/unsubscribe/${token}>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
		});
		expect(mail.text).toContain(`/unsubscribe/${token}`);
		expect(await verifyUnsubscribeToken(token)).toEqual({ id: Person.id, email: Person.email.toLowerCase() });
	});

	it('fills in the subject and sends with no reply-to when the message names no sender', async () => {
		const message = await newMessage({ subject: null, sender_string: null });

		await emailMessage(message.id);

		expect(sent().subject).toBe('[TAB] Message from Tabroom.com');
		expect(sent().from).toBe(config.mail.from);
		expect(sent().replyTo).toBeUndefined();
	});

	it('sends a message\'s own body as the html it was stored as, without guessing its format', async () => {
		// notify() escaped this when it wrote the row; a second guess would treat "< 26 need review" as a tag
		const message = await newMessage({ body: '<p>Room A &amp; B<br>speaks &lt; 26 need review</p>' });

		await emailMessage(message.id);

		expect(sent().html).toContain('<p>Room A &amp; B<br>speaks &lt; 26 need review</p>');
		expect(sent().text).toMatch(/^Room A & B\nspeaks < 26 need review\n/);
	});

	it('escapes a blast email row\'s plain text in the html part', async () => {
		const email = await factories.email.create({ content: 'Room A & B\nspeaks < 26 need review' });
		const message = await newMessage({ body: null, email: email.id });

		await emailMessage(message.id);

		expect(sent().html).toContain('<p>Room A &amp; B<br>speaks &lt; 26 need review</p>');
		expect(sent().text).toMatch(/^Room A & B\nspeaks < 26 need review\n/);
	});

	it('sends html with a flattened text version and both footers', async () => {
		const message = await newMessage({
			body: '<p>Your round is in <a href="https://example.com/room">room 12</a>.</p><img src="x.png"><p>Go <b>now</b>.</p>',
		});

		await emailMessage(message.id);

		const mail = sent();
		expect(mail.html).toContain('<p>Your round is in <a href="https://example.com/room">room 12</a>.</p>');
		expect(mail.html).toMatch(/<a href="https:\/\/www.example.org\/unsubscribe\/[^"]+" style="[^"]*">Unsubscribe<\/a> · <a href="https:\/\/www.example.org\/user\/profile" style="[^"]*">Email settings<\/a>/);
		expect(mail.text).toContain('Your round is in room 12 [https://example.com/room].');
		expect(mail.text).toContain('Go now.');
		expect(mail.text).not.toContain('<');
		expect(mail.text).toContain('Unsubscribe:');
	});

	it('uses the blast email row for content, subject, from, and reply-to when the message has none of its own', async () => {
		const email = await factories.email.create({
			content: '<p>Pairings for <b>round 3</b> are up.</p>',
			subject: 'Pairings posted',
			sender_raw: 'Big Tournament <bigtourn_123_blast@www.tabroom.com>',
			metadata: JSON.stringify({ replyTo: 'tab@bigtourn.org' }),
		});
		const message = await newMessage({ body: null, subject: null, sender_string: 'ignored@example.com', email: email.id });

		await emailMessage(message.id);

		const mail = sent();
		expect(mail.html).toContain('Pairings for <b>round 3</b> are up.');
		expect(mail.text).toContain('Pairings for round 3 are up.');
		expect(mail.subject).toBe('[TAB] Pairings posted');
		expect(mail.from).toBe('Big Tournament <bigtourn_123_blast@www.tabroom.com>');
		expect(mail.replyTo).toBe('tab@bigtourn.org');
	});

	it('falls back to the message sender for reply-to when the email row metadata has none', async () => {
		const email = await factories.email.create({ metadata: 'not json' });
		const message = await newMessage({ email: email.id, sender_string: 'tab@bigtourn.org' });

		await emailMessage(message.id);

		expect(sent().replyTo).toBe('tab@bigtourn.org');

		sendMail.mockClear();
		const silent = await newMessage({ email: email.id, sender_string: null });
		await emailMessage(silent.id);

		expect(sent().replyTo).toBeUndefined();
	});

	it('leaves the name off when the person has none', async () => {
		const Nameless = await factories.person.create({ first: null, last: null });
		const message = await newMessage({ person: Nameless.id });

		await emailMessage(message.id);

		expect(sent().to).toBe(Nameless.email);
	});

	it('sends account mail to someone opted out, without an unsubscribe link or headers', async () => {
		const OptedOut = await factories.person.create({ no_email: 1 });
		const message = await newMessage({ person: OptedOut.id, body: '<p>Your password was changed.</p>' });

		await expect(emailMessage(message.id, { kind: 'account' })).resolves.toEqual({ status: 'sent' });

		const mail = sent();
		expect(mail.headers).toEqual(autoReplyHeaders);
		expect(mail.text).not.toContain('unsubscribe');
		expect(mail.text).toContain('because of a change to your Tabroom.com account');
		expect(mail.html).not.toContain('unsubscribe');
		expect(mail.html).toContain('because of a change to your Tabroom.com account');
		// The email setting does not stop account mail, so the footer points nowhere
		expect(mail.text).not.toContain('/user/profile');
		expect(mail.html).not.toContain('/user/profile');
	});

	it('sends to a given address instead of the person\'s, without an unsubscribe link or headers', async () => {
		const message = await newMessage({ body: 'Your address was changed.' });

		await expect(emailMessage(message.id, { kind: 'account', to: 'old.address@example.org' })).resolves.toEqual({ status: 'sent' });

		const mail = sent();
		expect(mail.to).toBe('"Pat Coach" <old.address@example.org>');
		expect(mail.headers).toEqual(autoReplyHeaders);
		expect(mail.text).not.toContain('unsubscribe');
	});

	it('treats a blank to address as none: ordinary mail to the person, with the unsubscribe link', async () => {
		const message = await newMessage();

		await expect(emailMessage(message.id, { to: '  ' })).resolves.toEqual({ status: 'sent' });

		const mail = sent();
		expect(mail.to).toBe(`"Pat Coach" <${Person.email}>`);
		expect(mail.headers?.['List-Unsubscribe']).toBeDefined();
	});

	it('sends to a given address for a person with none of their own', async () => {
		// Addresses are unique, so only one person can have a blank one; reuse it across runs
		const NoAddress = await db.selectFrom('person').select('id').where('email', '=', '').executeTakeFirst()
			?? await factories.person.create({ email: '' });
		const message = await newMessage({ person: NoAddress.id });

		await expect(emailMessage(message.id, { kind: 'account', to: 'old.address@example.org' })).resolves.toEqual({ status: 'sent' });
		expect(sent().to).toContain('old.address@example.org');
	});

	it('skips a message that does not exist', async () => {
		await expect(emailMessage(999999999)).resolves.toEqual({ status: 'skipped', skipped: 'no message' });
		expect(sendMail).not.toHaveBeenCalled();
	});

	it('skips a deleted message', async () => {
		const message = await newMessage({ deleted_at: new Date() });

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'skipped', skipped: 'deleted' });
		expect(sendMail).not.toHaveBeenCalled();
	});

	it.each(['sent', 'failed'] as const)('skips a message whose email already ended %s, so a rerun job sends nothing', async (email_status) => {
		const message = await newMessage({ email_status });

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'skipped', skipped: 'already delivered' });
		expect(sendMail).not.toHaveBeenCalled();
	});

	it('sends a message whose email is still queued', async () => {
		const message = await newMessage({ email_status: 'queued' });

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'sent' });
	});

	it('skips a person with no address', async () => {
		// Addresses are unique, so only one person can have a blank one; reuse it across runs
		const NoAddress = await db.selectFrom('person').select('id').where('email', '=', '').executeTakeFirst()
			?? await factories.person.create({ email: '' });
		const message = await newMessage({ person: NoAddress.id });

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'skipped', skipped: 'no address' });
		expect(sendMail).not.toHaveBeenCalled();
	});

	it('skips a person who opted out after the message was queued', async () => {
		const Changed = await factories.person.create({ no_email: 0 });
		const message = await newMessage({ person: Changed.id });
		await db.updateTable('person').set({ no_email: 1 }).where('id', '=', Changed.id).execute();

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'skipped', skipped: 'opted out' });
		expect(sendMail).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('opted out'));
	});

	it('passes a refused or busy relay through as the status', async () => {
		const message = await newMessage();
		sendMail.mockRejectedValue(Object.assign(new Error('Mail command failed'), { code: 'EENVELOPE', responseCode: 450, response: '450 try later' }));

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'retry' });
	});

	describe('who it is from', () => {
		// 2026-11-17T18:00:00Z is 1794938400 in epoch seconds
		const timestamp = new Date('2026-11-17T18:00:00Z');
		const originalFrom = config.mail.from;

		beforeEach(() => {
			config.mail.from = 'Tabroom <live@mail.example.org>';
		});

		afterEach(() => {
			config.mail.from = originalFrom;
		});

		it('sends tournament mail under the tournament\'s name, from an address of its own in our domain', async () => {
			const Tourn = await factories.tourn.create({ name: 'The "Big" Tournament', webname: 'big tourn!' });
			const message = await newMessage({ tourn: Tourn.id, timestamp, sender_string: 'tab@bigtourn.org' });

			await emailMessage(message.id, { as: 'tourn' });

			expect(sent().from).toBe('"The Big Tournament" <bigtourn_938400@mail.example.org>');
			expect(sent().replyTo).toBe('tab@bigtourn.org');
		});

		it('sends a person\'s mail under their name, with replies to their own address', async () => {
			const Sender = await factories.person.create({ first: 'Sam', last: 'Tabber' });
			const message = await newMessage({ sender: Sender.id, timestamp, sender_string: null });

			await emailMessage(message.id, { as: 'person' });

			expect(sent().from).toBe('"Sam Tabber" <938400@mail.example.org>');
			expect(sent().replyTo).toBe(`"Sam Tabber" <${Sender.email}>`);
		});

		it('lets the request\'s reply address win over the sender\'s own', async () => {
			const Sender = await factories.person.create();
			const message = await newMessage({ sender: Sender.id, sender_string: 'office@example.org' });

			await emailMessage(message.id, { as: 'person' });

			expect(sent().replyTo).toBe('office@example.org');
		});

		it('keeps a blast email row\'s own From ahead of the request\'s', async () => {
			const Tourn = await factories.tourn.create();
			const email = await factories.email.create({ sender_raw: 'Composer <composer_1@www.tabroom.com>' });
			const message = await newMessage({ tourn: Tourn.id, email: email.id });

			await emailMessage(message.id, { as: 'tourn' });

			expect(sent().from).toBe('Composer <composer_1@www.tabroom.com>');
		});

		it.each([
			['tourn', 'tournament'],
			['person', 'sender'],
		] as const)('sends as Tabroom and warns when the %s it should name is gone', async (as, missing) => {
			const message = await newMessage({ tourn: null, sender: null, sender_string: null });

			await emailMessage(message.id, { as });

			expect(sent().from).toBe('Tabroom <live@mail.example.org>');
			expect(sent().replyTo).toBeUndefined();
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`no ${missing} to send as`), {
				'event.name': 'notification.email.sender_missing',
			});
		});
	});

	it('logs instead of sending in log mode', async () => {
		config.mail = mailConfig({ mode: 'log' });
		const message = await newMessage();

		await expect(emailMessage(message.id)).resolves.toEqual({ status: 'logged' });
		expect(sendMail).not.toHaveBeenCalled();
	});

	describe('tournament mail', () => {
		const staffHtml = '<div class="x"><p>Rounds start at <b>8:00</b>.</p><img src="https://example.com/pixel.gif">'
			+ '<script>alert(1)</script><p><a href="javascript:alert(1)">Bad</a></p></div>';

		let Tourn: { id: number; name: string };

		beforeAll(async () => {
			Tourn = await factories.tourn.create({ name: 'Big Tournament' });
		});

		// A message's own body is sanitized when notify() writes it; a blast's email row is cleaned here
		const blastMessage = async (content: string, tourn: number | null) => await newMessage({
			body: null,
			email: (await factories.email.create({ content })).id,
			tourn,
		});

		it('sanitizes a blast row\'s staff html and names the tournament in the footer with a report link', async () => {
			const message = await blastMessage(staffHtml, Tourn.id);

			await expect(emailMessage(message.id, { kind: 'tourn' })).resolves.toEqual({ status: 'sent' });

			const mail = sent();
			expect(mail.html).toContain('<p>Rounds start at <b>8:00</b>.</p><p><a>Bad</a></p>');
			// The shell's own wordmark is divs, so look for the staff div by its class
			expect(mail.html).not.toContain('class="x"');
			expect(mail.html).not.toContain('pixel.gif');
			expect(mail.html).not.toContain('<script');
			expect(mail.html).not.toContain('javascript:');
			expect(mail.html).toContain('Big Tournament sent this message through Tabroom.com.');
			expect(mail.html).toContain(`mailto:help@tabroom.com?subject=${encodeURIComponent(`Report message ${message.id} from Big Tournament`)}`);
			expect(mail.text).toContain('Report this message: mailto:help@tabroom.com');
			expect(mail.headers?.['List-Unsubscribe']).toBeDefined();
		});

		it('keeps a blast row\'s plain-text staff message as escaped paragraphs', async () => {
			const message = await blastMessage('Room A & B\n\nBring a timer', Tourn.id);

			await emailMessage(message.id, { kind: 'tourn' });

			expect(sent().html).toContain('<p>Room A &amp; B</p><p>Bring a timer</p>');
		});

		it('gives Tabroom mail about a tournament no disclaimer and no sanitizing', async () => {
			const message = await newMessage({ body: '<div><p>Pairings are up.</p></div>', tourn: Tourn.id });

			await emailMessage(message.id);

			expect(sent().html).toContain('<div><p>Pairings are up.</p></div>');
			expect(sent().html).not.toContain('sent this message through Tabroom.com');
			expect(sent().html).not.toContain('Report this message');
		});

		it('falls back to the Tabroom footer and warns when the tournament is gone, still sanitizing', async () => {
			const message = await blastMessage(staffHtml, null);

			await expect(emailMessage(message.id, { kind: 'tourn' })).resolves.toEqual({ status: 'sent' });

			expect(sent().html).not.toContain('Report this message');
			expect(sent().html).toContain('Unsubscribe</a>');
			expect(sent().html).not.toContain('<script');
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`message ${message.id}`), {
				'event.name': 'notification.email.tourn_missing',
			});
		});
	});
});
