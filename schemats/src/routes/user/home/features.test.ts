import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({ HOME_FEATURES: 'standby, flips' }));

import { homeFeatureNames, isEnabled, parseHomeFeatures, setHomeFeatures } from './features';

describe('parseHomeFeatures', () => {
	it('reads a comma list, trimming whitespace', () => {
		expect(parseHomeFeatures('standby, flips ,tab')).toEqual(new Set(['standby', 'flips', 'tab']));
	});

	it('treats empty as nothing on', () => {
		expect(parseHomeFeatures('')).toEqual(new Set());
		expect(parseHomeFeatures(' , ')).toEqual(new Set());
	});

	it('drops unknown names', () => {
		expect(parseHomeFeatures('standby,nope,Flips')).toEqual(new Set(['standby']));
	});

	it('turns everything on with "all"', () => {
		expect(parseHomeFeatures('fines,all')).toEqual(new Set(homeFeatureNames));
	});
});

describe('isEnabled', () => {
	it('starts from the env', () => {
		expect(isEnabled('standby')).toBe(true);
		expect(isEnabled('fines')).toBe(false);
	});

	it('follows setHomeFeatures', () => {
		setHomeFeatures(['fines']);
		expect(isEnabled('fines')).toBe(true);
		expect(isEnabled('standby')).toBe(false);
		setHomeFeatures('all');
		expect(homeFeatureNames.every(isEnabled)).toBe(true);
		setHomeFeatures([]);
		expect(homeFeatureNames.some(isEnabled)).toBe(false);
	});
});
