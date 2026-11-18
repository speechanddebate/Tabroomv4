import type { RequestHandler } from '@sveltejs/kit';
import logger from '#lib/helpers/logging/logging.server.ts';

interface ClientLogPayload {
	level: 'error' | 'warn' | 'info' | 'debug';
	message: string;
	error?: {
		message?: string;
		stack?: string;
	};
	context?: Record<string, unknown>;
}

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json()) as ClientLogPayload;

	if (!payload.level || !payload.message) {
		return Response.json({ error: 'Missing level or message' }, { status: 400 });
	}

	// Log via server logger (enriches with app, host, etc.)
	logger[payload.level]('Client error', {
		message: payload.message,
		errorStack: payload.error?.stack,
		errorMessage: payload.error?.message,
		...payload.context,
	});

	return Response.json({ success: true });
};
