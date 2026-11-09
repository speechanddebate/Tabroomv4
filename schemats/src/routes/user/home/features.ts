/*
 * Dev and test flags for parts of the user home that aren't ready for everyone. A flagged
 * element is off unless HOME_FEATURES names it; delete its check when it goes live.
 */
import { HOME_FEATURES } from '$app/env/public';

export const homeFeatureNames = [
	'alerts',
	'pastTourns',
	'standby',
	'training',
	'questionnaires',
	'flips',
	'prefs',
	'signups',
	'strikeCards',
	'onsite',
	'registration',
	'judgeFacts',
	'conflictSheet',
	'rounds',
	'results',
	'tab',
] as const;

export type HomeFeature = typeof homeFeatureNames[number];

const isHomeFeature = (name: string): name is HomeFeature => (homeFeatureNames as readonly string[]).includes(name);

// "all" turns everything on; unknown names are dropped
export function parseHomeFeatures(value: string): Set<HomeFeature> {
	const names = value.split(',').map(name => name.trim()).filter(Boolean);
	return new Set(names.includes('all') ? homeFeatureNames : names.filter(isHomeFeature));
}

let enabled = parseHomeFeatures(HOME_FEATURES);

export const isEnabled = (feature: HomeFeature): boolean => enabled.has(feature);

// For stories and tests, which can't set the env
export function setHomeFeatures(features: Iterable<HomeFeature> | 'all') {
	enabled = new Set(features === 'all' ? homeFeatureNames : features);
}
