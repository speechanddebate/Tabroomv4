import config from '../../config.js';

/** How long a request to the NSDA API may take before it is given up on, in ms */
export const NSDA_TIMEOUT = 60_000;

/** A request to the NSDA API that did not come back with a usable answer */
export class NSDAError extends Error {
	/** The HTTP status, when the API answered at all */
	status?: number;

	constructor(message: string, options: { status?: number, cause?: unknown } = {}) {
		super(message, { cause: options.cause });
		this.name = 'NSDAError';
		this.status = options.status;
	}
}

/** Whether this environment has what it needs to call the NSDA API */
export function isNSDAConfigured() {
	return Boolean(config.nsda.endpoint && config.nsda.user_id && config.nsda.key);
}

export type FetchNSDAOptions = {
	/** Default GET */
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	/** Sent as JSON */
	body?: unknown;
	/** How long to wait for an answer, in ms. Default NSDA_TIMEOUT */
	timeout?: number;
};

/**
 * One request to the NSDA API (api2), and the one place that knows its address, its login,
 * and how it fails. `path` is everything after the version, e.g. `/learn/courses/117271`.
 * Returns the parsed JSON body, which the caller checks: several endpoints pass another
 * system's answer straight through, so a 200 is no promise of the shape. Throws NSDAError
 * when the API is not configured, cannot be reached, takes too long, answers with an error
 * status, or sends something that is not JSON. A request it never answers would otherwise
 * wait forever, and a scheduled job that is waiting holds its queue.
 * Error messages leave the query string out, since searches put email addresses in it
 */
export async function fetchNSDA(path: string, options: FetchNSDAOptions = {}): Promise<unknown> {
	const { method = 'GET', body, timeout = NSDA_TIMEOUT } = options;
	const request = `${method} ${path.split('?')[0]}`;

	if (!isNSDAConfigured()) {
		throw new NSDAError('The NSDA API is not configured (nsda.endpoint, nsda.user_id, nsda.key)');
	}

	let response: Response;
	try {
		response = await fetch(`${config.nsda.endpoint}${config.nsda.path}${path}`, {
			method,
			signal: AbortSignal.timeout(timeout),
			headers: {
				Authorization: `Basic ${Buffer.from(`${config.nsda.user_id}:${config.nsda.key}`).toString('base64')}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'TimeoutError') {
			throw new NSDAError(`The NSDA API did not answer ${request} within ${timeout / 1000} seconds`, { cause: error });
		}
		throw new NSDAError(`The NSDA API could not be reached for ${request}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}

	if (!response.ok) {
		// The start of the body is usually the API's own message
		const detail = (await response.text().catch(() => '')).slice(0, 200);
		throw new NSDAError(`The NSDA API answered ${request} with ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`, { status: response.status });
	}

	if (response.status === 204) return undefined;

	try {
		return await response.json();
	} catch (error) {
		throw new NSDAError(`The NSDA API answered ${request} with a body that is not JSON`, { status: response.status, cause: error });
	}
}
