const env = vi.hoisted(() => ({ HIDE_DEV_PAGES: true }));

vi.mock('$app/env/private', () => env);

import { load } from './+page.server';

const runLoad = () => load({} as Parameters<typeof load>[0]);

describe('push page server load', () => {
	it('returns 404 when dev pages are hidden', () => {
		env.HIDE_DEV_PAGES = true;
		expect(runLoad).toThrow(expect.objectContaining({ status: 404 }));
	});

	it('loads when dev pages are shown', () => {
		env.HIDE_DEV_PAGES = false;
		expect(runLoad).not.toThrow();
	});
});
