import nodemailer, {
	type Attachment,
	type NodemailerError,
	type SendMailOptions,
	type SMTPPoolOptions,
	type SMTPPoolSentMessageInfo,
	type Transporter,
} from 'nodemailer';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import logger from '../../../helpers/logger.js';
import { sanitizeHTML } from '../../../helpers/text.js';
import { EMAIL_HTML, raw, textToHtml } from '../templates/html.js';
import { renderEmail, type EmailShellInput } from '../templates/shell.js';
import type { EmailKind, EmailSender } from '../notify.js';
import { unsubscribePageUrl, unsubscribeToken } from '../unsubscribe.js';

/** One message for one address. Formatting (subject prefix, shell, list headers) is the caller's */
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
		logger.warn(`Email to ${message.to} rejected by the relay: ${response}`, {
			'event.name': 'notification.email.rejected',
			// An SMTP reply starts with its three-digit code ("550 5.1.1 No such user"); nodemailer
			// gives no responseCode on this path, so take the code from the reply text
			'error.type': response.match(/^\d{3}/)?.[0] ?? '_OTHER',
		});
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
	// OTel error.type: the relay's reply code when it answered, else nodemailer's own code
	const errorType = responseCode === undefined ? code ?? '_OTHER' : String(responseCode);

	if (responseCode !== undefined) {
		const reason = `relay responded ${responseCode}`;

		// nodemailer sets permanent from the reply class: 5xx except 503 is final (no such
		// mailbox, message refused, bad credentials), 4xx is the relay asking for later
		if (permanent ?? (responseCode >= 500 && responseCode !== 503)) {
			if (SETUP_ERRORS.has(code ?? '')) {
				logger.error(`Email rejected, ${reason}, check the relay settings: ${detail}`, {
					'event.name': 'notification.email.relay_misconfigured',
					'error.type': errorType,
				});
			} else {
				logger.warn(`Email to ${to} rejected, ${reason}: ${detail}`, {
					'event.name': 'notification.email.rejected',
					'error.type': errorType,
				});
			}
			return { status: 'rejected', reason };
		}

		logger.warn(`Email to ${to} failed, ${reason}, will retry: ${detail}`, {
			'event.name': 'notification.email.retry',
			'error.type': errorType,
		});
		return { status: 'retry', reason };
	}

	// With no reply from the relay, our own message or setup is the problem only when
	// nodemailer says so; anything else, including an error with no code at all (a pool
	// closed under us, say), is the network or a relay that went quiet, and the retries
	// decide whether it was final
	if (code && MESSAGE_ERRORS.has(code)) {
		logger.error(`Email to ${to} rejected, ${message}`, {
			'event.name': 'notification.email.rejected',
			'error.type': errorType,
		});
		return { status: 'rejected', reason: message };
	}
	if (code && SETUP_ERRORS.has(code)) {
		logger.error(`Email rejected, check the relay settings: ${message}`, {
			'event.name': 'notification.email.relay_misconfigured',
			'error.type': errorType,
		});
		return { status: 'rejected', reason: message };
	}

	logger.warn(`Email to ${to} failed, ${message}, will retry`, {
		'event.name': 'notification.email.retry',
		'error.type': errorType,
	});
	return { status: 'retry', reason: message };
}

export type EmailMessageResult = {
	/** What sendEmail reported, or skipped when nothing was sent */
	status: EmailSendResult['status'] | 'skipped';
	/** Why nothing was sent, when nothing was */
	skipped?: 'no message' | 'already delivered' | 'deleted' | 'no address' | 'opted out';
};

export type EmailMessageOptions = {
	/** Default tabroom; account mail reaches someone opted out */
	kind?: EmailKind;
	/** Whose name it goes out under. Default tabroom */
	as?: EmailSender;
	/** Send here instead of the person's address, such as their old one after a change */
	to?: string;
};

const DEFAULT_SUBJECT = 'Message from Tabroom.com';
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
		.leftJoin('tourn', 'tourn.id', 'message.tourn')
		.leftJoin('person as sender', 'sender.id', 'message.sender')
		.select([
			'message.id', 'message.subject', 'message.body', 'message.sender_string', 'message.deleted_at', 'message.email_status',
			'message.timestamp',
			'email.content as email_content', 'email.subject as email_subject', 'email.sender_raw', 'email.metadata',
			'tourn.name as tourn_name', 'tourn.webname as tourn_webname',
			'sender.first as sender_first', 'sender.last as sender_last', 'sender.email as sender_email',
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
	const to = options.to?.trim();
	const address = to || row.person_email.trim();
	if (!address) return skip('no address', `person ${row.person_id} has no address`);
	if (row.no_email && options.kind !== 'account') return skip('opted out', `person ${row.person_id} opted out`);

	const name = [row.first, row.last].filter(Boolean).join(' ').replace(/"/g, '').trim();
	// A message's own body was made safe html when notify() wrote it. A blast's email row is
	// whatever its composer stored, text or html, so that is still worked out and cleaned here
	const blast = row.email_content ?? '';
	const blastHtml = isHtml(blast) ? raw(blast) : textToHtml(blast);
	const content = row.body !== null
		? raw(row.body)
		: options.kind === 'tourn' ? raw(sanitizeHTML(blastHtml.value, EMAIL_HTML)) : blastHtml;
	// Mail about the person's own account goes out even to someone opted out, so an unsubscribe link would be
	// misleading; and a token names the person's current address, so mail sent anywhere else can't carry one
	const token = options.kind === 'account' || to ? null : await unsubscribeToken({ id: row.person_id, email: address });

	if (options.kind === 'tourn' && !row.tourn_name) {
		logger.warn(`Tournament message ${messageId} has no tournament to name, sending it with the Tabroom footer`, {
			'event.name': 'notification.email.tourn_missing',
		});
	}
	const shell: EmailShellInput = !token
		? { kind: 'account', content }
		: options.kind === 'tourn' && row.tourn_name
			? { kind: 'tourn', content, unsubscribeUrl: unsubscribePageUrl(token), tournName: row.tourn_name, messageId }
			: { kind: 'tabroom', content, unsubscribeUrl: unsubscribePageUrl(token) };

	// From stays in our own domain so the relay signs it; whoever should get the answers goes in
	// Reply-To. A blast's email row can name both; a plain message names only the reply address,
	// which is what its sender_string has always meant to the inbox
	const sentAs = senderOf(row, options.as);
	const outbound: OutboundEmail = {
		to: name ? `"${name}" <${address}>` : address,
		from: row.sender_raw || sentAs.from,
		subject: SUBJECT_PREFIX + (row.subject || row.email_subject || DEFAULT_SUBJECT),
		...renderEmail(shell),
		headers: {
			'Auto-Submitted': 'auto-generated',
			'X-Auto-Response-Suppress': 'OOF, AutoReply',
		},
	};

	const replyTo = metadataReplyTo(row.metadata) ?? (row.sender_string?.trim() || sentAs.replyTo);
	if (replyTo) outbound.replyTo = replyTo;

	// RFC 8058: with both headers, mail clients show their own Unsubscribe button and POST without opening a page
	if (token) {
		outbound.headers = {
			...outbound.headers,
			'List-Unsubscribe': `<${config.url}${UNSUBSCRIBE_PATH}${token}>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
		};
	}

	const result = await sendEmail(outbound);
	return { status: result.status };
}

/**
 * The From an email goes out under and, for a person, where replies go. Every address is in
 * mail.from's domain, which the relay signs. The local part carries the last six digits of the
 * message's epoch seconds, as classic's does; taken from the row, so the recipients of one
 * notification and every retry share an address. Mail whose tournament or sender is gone goes
 * out as Tabroom
 */
function senderOf(
	row: {
		id: number;
		timestamp: Date;
		tourn_name: string | null;
		tourn_webname: string | null;
		sender_first: string | null;
		sender_last: string | null;
		sender_email: string | null;
	},
	as: EmailSender = 'tabroom',
): { from: string; replyTo?: string } {
	// The domain of mail.from, bare or named: "live@www.tabroom.com", "Tabroom <live@www.tabroom.com>"
	const domain = config.mail.from.match(/@([^>\s]+)/)?.[1];
	const nonce = String(Math.floor(row.timestamp.getTime() / 1000)).slice(-6);

	// Anything a webname holds that an address can't is dropped: "big tourn!" becomes "bigtourn"
	const webname = row.tourn_webname?.replace(/[^\w.-]/g, '');
	if (as === 'tourn' && domain && row.tourn_name && webname) {
		return { from: `"${row.tourn_name.replace(/"/g, '').trim()}" <${webname}_${nonce}@${domain}>` };
	}

	const name = [row.sender_first, row.sender_last].filter(Boolean).join(' ').replace(/"/g, '').trim();
	const address = row.sender_email?.trim();
	if (as === 'person' && domain && name && address) {
		return { from: `"${name}" <${nonce}@${domain}>`, replyTo: `"${name}" <${address}>` };
	}

	if (as !== 'tabroom') {
		logger.warn(`Message ${row.id} has no ${as === 'tourn' ? 'tournament' : 'sender'} to send as, sending it as Tabroom`, {
			'event.name': 'notification.email.sender_missing',
		});
	}
	return { from: config.mail.from };
}

/** Whether a blast's stored content is html rather than plain text */
function isHtml(content: string): boolean {
	return /<[a-z][\s\S]*>/i.test(content);
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
