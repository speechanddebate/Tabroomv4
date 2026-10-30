import nodemailer, {
	type Attachment,
	type NodemailerError,
	type SendMailOptions,
	type SMTPPoolOptions,
	type SMTPPoolSentMessageInfo,
	type Transporter,
} from 'nodemailer';
import { convert } from 'html-to-text';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import logger from '../../../helpers/logger.js';
import { unsubscribeToken } from '../unsubscribe.js';

/** One message for one address. Formatting (subject prefix, footer, list headers) is the caller's */
export type OutboundEmail = {
	/** One recipient, as a bare address or `Name <address>` */
	to: string;
	from: string;
	replyTo?: string;
	subject: string;
	text: string;
	/** The same content as html, for clients that show it */
	html?: string;
	headers?: Record<string, string>;
	attachments?: Attachment[];
};

export type EmailSendResult =
	| { status: 'sent' }
	/** config.mail.mode is log, so the message was logged and dropped */
	| { status: 'logged' }
	/** The relay refused the message or the address and a retry won't help */
	| { status: 'rejected'; reason: string }
	/** The relay or the network was busy; try again later */
	| { status: 'retry'; reason: string };

/** Milliseconds to wait for the relay to accept a connection, and then to greet */
const CONNECT_TIMEOUT = 10_000;
/** Milliseconds of silence on an open connection before giving the worker slot back */
const SOCKET_TIMEOUT = 60_000;
/** Longest relay response kept in a log line */
const MAX_LOGGED_RESPONSE = 200;

type MailTransporter = Transporter<SMTPPoolSentMessageInfo, SMTPPoolOptions>;

let transporter: MailTransporter | undefined;

/**
 * The pooled connection to the relay, opened on first use and kept for every send after,
 * so consecutive messages reuse a connection instead of each paying for a handshake
 */
export function getTransporter(): MailTransporter {
	if (!transporter) {
		const { host, port, secure, rejectUnauthorized, pool, user, pass } = config.mail.smtp;
		const options: SMTPPoolOptions = {
			host,
			port,
			secure,
			pool: true,
			maxConnections: pool,
			maxMessages: Infinity,
			tls: { rejectUnauthorized },
			connectionTimeout: CONNECT_TIMEOUT,
			greetingTimeout: CONNECT_TIMEOUT,
			socketTimeout: SOCKET_TIMEOUT,
			...(user && pass ? { auth: { user, pass } } : {}),
		};
		transporter = nodemailer.createTransport(options);
	}
	return transporter;
}

/** Closes the relay connections. The next send opens new ones, so this is for shutdown and tests */
export function closeMail(): void {
	transporter?.close();
	transporter = undefined;
}

/**
 * Sends one email to one address. Reports what happened instead of throwing, so the
 * caller decides what a refused or busy relay means. config.mail.mode decides whether
 * the message reaches the relay at all: log drops it after logging, redirect sends it to
 * the configured addresses instead, live sends it as addressed
 */
export async function sendEmail(message: OutboundEmail): Promise<EmailSendResult> {
	const { mode, redirectTo } = config.mail;

	if (mode === 'log') {
		logger.info(`Mail mode is log, not sending "${message.subject}" from ${message.from} to ${message.to}`);
		logger.debug(`Mail text for ${message.to}:\n${message.text}`);
		return { status: 'logged' };
	}

	let outbound: SendMailOptions = message;
	if (mode === 'redirect' && redirectTo) {
		logger.info(`Mail mode is redirect, sending "${message.subject}" for ${message.to} to ${redirectTo.join(', ')}`);
		outbound = { ...message, to: redirectTo, headers: { ...message.headers, 'X-Original-To': message.to } };
	}

	let info: SMTPPoolSentMessageInfo;
	try {
		info = await getTransporter().sendMail(outbound);
	} catch (err) {
		return sendFailure(err, message.to);
	}

	// A relay that takes the connection but not the address answers here rather than throwing
	if (info.rejected.length > 0) {
		const response = info.response.slice(0, MAX_LOGGED_RESPONSE);
		logger.warn(`Email to ${message.to} rejected by the relay: ${response}`);
		return { status: 'rejected', reason: `relay responded ${response}` };
	}

	logger.debug(`Email sent to ${message.to} as ${info.messageId}`);
	return { status: 'sent' };
}

/** Errors nodemailer reports for the message itself when the relay never replied: nothing a retry fixes */
const MESSAGE_ERRORS = new Set(['EENVELOPE', 'EMESSAGE', 'ESTREAM']);
/** Errors in how we talk to the relay: credentials or TLS settings, not the message or the network */
const SETUP_ERRORS = new Set(['EAUTH', 'ENOAUTH', 'ETLS', 'EREQUIRETLS', 'ECONFIG']);

/** Sorts a failed send into retry or rejected */
function sendFailure(err: unknown, to: string): EmailSendResult {
	const { code, responseCode, response, permanent, message } = err instanceof Error
		? err as NodemailerError
		: { message: String(err) } as NodemailerError;
	const detail = (response ?? message).slice(0, MAX_LOGGED_RESPONSE);

	if (responseCode !== undefined) {
		const reason = `relay responded ${responseCode}`;

		// nodemailer sets permanent from the reply class: 5xx except 503 is final (no such
		// mailbox, message refused, bad credentials), 4xx is the relay asking for later
		if (permanent ?? (responseCode >= 500 && responseCode !== 503)) {
			if (SETUP_ERRORS.has(code ?? '')) {
				logger.error(`Email rejected, ${reason}, check the relay settings: ${detail}`);
			} else {
				logger.warn(`Email to ${to} rejected, ${reason}: ${detail}`);
			}
			return { status: 'rejected', reason };
		}

		logger.warn(`Email to ${to} failed, ${reason}, will retry: ${detail}`);
		return { status: 'retry', reason };
	}

	// With no reply from the relay, our own message or setup is the problem only when
	// nodemailer says so; anything else is the network or a relay that went quiet
	if (!code || MESSAGE_ERRORS.has(code)) {
		logger.error(`Email to ${to} rejected, ${message}`);
		return { status: 'rejected', reason: message };
	}
	if (SETUP_ERRORS.has(code)) {
		logger.error(`Email rejected, check the relay settings: ${message}`);
		return { status: 'rejected', reason: message };
	}

	logger.warn(`Email to ${to} failed, ${message}, will retry`);
	return { status: 'retry', reason: message };
}

export type EmailMessageResult = {
	/** What sendEmail reported, or skipped when nothing was sent */
	status: EmailSendResult['status'] | 'skipped';
	/** Why nothing was sent, when nothing was */
	skipped?: 'no message' | 'already delivered' | 'deleted' | 'no address' | 'opted out';
};

export type EmailMessageOptions = {
	/** Send even to a person who opted out, for mail about an action on their own account */
	ignoreNoEmail?: boolean;
};

const DEFAULT_SUBJECT = 'Message from Tabroom.com';
/** The prefix every notification subject has carried since classic, so filters built on it keep working */
const SUBJECT_PREFIX = '[TAB] ';
const UNSUBSCRIBE_PATH = '/v1/rest/notify/email/unsubscribe/';

/**
 * Emails one message to its person. Loads the message, its blast email row when it has
 * one, and the person at send time, so an opt-out or an address change since queueing
 * is honored. Reports what happened instead of throwing, so the caller decides what a
 * skip or a refused relay means; only the unexpected (the database is down) throws
 */
export async function emailMessage(messageId: number, options: EmailMessageOptions = {}): Promise<EmailMessageResult> {
	const row = await db.selectFrom('message')
		.innerJoin('person', 'person.id', 'message.person')
		.leftJoin('email', 'email.id', 'message.email')
		.select([
			'message.id', 'message.subject', 'message.body', 'message.url', 'message.sender_string', 'message.deleted_at', 'message.email_status',
			'email.content as email_content', 'email.subject as email_subject', 'email.sender_raw', 'email.metadata',
			'person.id as person_id', 'person.email as person_email', 'person.no_email', 'person.first', 'person.last',
		])
		.where('message.id', '=', messageId)
		.executeTakeFirst();

	const skip = (skipped: NonNullable<EmailMessageResult['skipped']>, detail: string = skipped): EmailMessageResult => {
		logger.debug(`Email for message ${messageId} skipped, ${detail}`);
		return { status: 'skipped', skipped };
	};

	// A message deleted between queueing and sending is the recheck working, not an error
	if (!row) return skip('no message');
	// A job run again after its email went out (a stalled worker's job, say) sends nothing;
	// null is a job queued before delivery was recorded
	if (row.email_status && row.email_status !== 'queued') return skip('already delivered', `already ${row.email_status}`);
	if (row.deleted_at) return skip('deleted');
	if (!row.person_email.trim()) return skip('no address', `person ${row.person_id} has no address`);
	if (row.no_email && !options.ignoreNoEmail) return skip('opted out', `person ${row.person_id} opted out`);

	const person = { id: row.person_id, email: row.person_email.trim() };
	const name = [row.first, row.last].filter(Boolean).join(' ').replace(/"/g, '').trim();
	const content = row.body ?? row.email_content ?? '';
	const link = row.url ? absoluteUrl(row.url) : null;
	// Mail about the person's own account goes out even to someone opted out, so an unsubscribe link would be misleading
	const token = options.ignoreNoEmail ? null : await unsubscribeToken(person);

	// From stays in our own domain so the relay signs it; whoever should get the answers goes in
	// Reply-To. A blast's email row can name both; a plain message names only the reply address,
	// which is what its sender_string has always meant to the inbox
	const outbound: OutboundEmail = {
		to: name ? `"${name}" <${person.email}>` : person.email,
		from: row.sender_raw || config.mail.from,
		subject: SUBJECT_PREFIX + (row.subject || row.email_subject || DEFAULT_SUBJECT),
		text: [
			isHtml(content) ? plainText(content) : content,
			link ? `Read more: ${link}` : null,
			textFooter(token),
		].filter(Boolean).join('\n\n'),
	};

	const replyTo = metadataReplyTo(row.metadata) ?? row.sender_string?.trim();
	if (replyTo) outbound.replyTo = replyTo;

	if (isHtml(content)) {
		outbound.html = [
			content,
			link ? `<p>Read more: <a href="${link}">${link}</a></p>` : null,
			htmlFooter(token),
		].filter(Boolean).join('\n');
	}

	// RFC 8058: with both headers, mail clients show their own Unsubscribe button and POST without opening a page
	if (token) {
		outbound.headers = {
			'List-Unsubscribe': `<${config.url}${UNSUBSCRIBE_PATH}${token}>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
		};
	}

	const result = await sendEmail(outbound);
	return { status: result.status };
}

/** Whether the inbox body is html rather than plain text */
function isHtml(content: string): boolean {
	return /<[a-z][\s\S]*>/i.test(content);
}

/** The inbox html as readable plain text, paragraphs kept, images dropped, links shown after their text */
function plainText(html: string): string {
	return convert(html, {
		wordwrap: 78,
		selectors: [{ selector: 'img', format: 'skip' }],
	}).trim();
}

/** A message url as a link that works from an email: site-relative paths get the site in front */
function absoluteUrl(url: string): string {
	return url.startsWith('/') ? `${config.schemats_url}${url}` : url;
}

const profileUrl = () => `${config.schemats_url}/user/profile`;
const unsubscribeUrl = (token: string) => `${config.schemats_url}/unsubscribe/${token}`;

function textFooter(token: string | null): string {
	const lines = ['----------------------------'];
	if (token) {
		lines.push(
			'You received this email because you have an account on Tabroom.com.',
			`Stop these emails: ${unsubscribeUrl(token)}`,
			`Or manage them from your profile: ${profileUrl()}`,
		);
	} else {
		// Account mail goes out whatever the email setting says, so there is nothing to point the person at
		lines.push('You received this email because of an action on your Tabroom.com account.');
	}
	return lines.join('\n');
}

function htmlFooter(token: string | null): string {
	return token
		? `<hr><p>You received this email because you have an account on Tabroom.com. <a href="${unsubscribeUrl(token)}">Stop these emails</a> or manage them from <a href="${profileUrl()}">your profile</a>.</p>`
		: '<hr><p>You received this email because of an action on your Tabroom.com account.</p>';
}

/** The Reply-To a blast's email row recorded, when its metadata is JSON that carries one */
function metadataReplyTo(metadata: string | null): string | undefined {
	if (!metadata) return undefined;
	try {
		const parsed: unknown = JSON.parse(metadata);
		const replyTo = (parsed as { replyTo?: unknown })?.replyTo;
		return typeof replyTo === 'string' && replyTo.trim() ? replyTo : undefined;
	} catch {
		return undefined;
	}
}
