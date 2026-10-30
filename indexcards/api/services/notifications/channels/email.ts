import nodemailer, {
	type Attachment,
	type NodemailerError,
	type SendMailOptions,
	type SMTPPoolOptions,
	type SMTPPoolSentMessageInfo,
	type Transporter,
} from 'nodemailer';
import config from '../../../config.js';
import logger from '../../../helpers/logger.js';

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
