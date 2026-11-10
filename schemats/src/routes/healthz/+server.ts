import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { version } from '$app/env';

export const GET: RequestHandler = () => json({ status: 'ok', commit: version });
