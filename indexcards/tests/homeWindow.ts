import factories from './factories/index.js';

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 1000) * 1000);

/**
 * One full tourn at each edge of the home page window, for tests of what the page shows:
 * ended 8 days ago (out), ended 6 days ago (in), running, upcoming, and a hidden running one (out)
 */
export async function createHomeWindow() {
	const [endedLongAgo, endedRecently, running, upcoming, hidden] = await Promise.all([
		factories.tourn.createFull({ start: daysFromNow(-10), end: daysFromNow(-8) }),
		factories.tourn.createFull({ start: daysFromNow(-7), end: daysFromNow(-6) }),
		factories.tourn.createFull({ start: daysFromNow(-1), end: daysFromNow(1) }),
		factories.tourn.createFull({ start: daysFromNow(3), end: daysFromNow(5) }),
		factories.tourn.createFull({ start: daysFromNow(-1), end: daysFromNow(1), hidden: 1 }),
	]);
	return { endedLongAgo, endedRecently, running, upcoming, hidden };
}
