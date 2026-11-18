import type { RequestHandler } from '@sveltejs/kit';
import { version } from '$app/env';

export const GET: RequestHandler = () => Response.json({ status: 'ok', commit: version });
