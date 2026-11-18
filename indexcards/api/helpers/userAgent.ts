import Bowser from 'bowser';

/**
 * Classic's session.agent_data shape (mason funclib/session_agent.mas), so classic's profile
 * page reads the rows indexcards writes. `os` carries the version, as classic's does
 */
export type AgentData = {
	brand?: string;
	device?: string;
	os?: string;
	os_version?: string;
	browser?: string;
	browser_version?: string;
};

export function parseUserAgent(userAgent: string): AgentData {
	const { browser, os, platform } = Bowser.parse(userAgent);
	return {
		brand: platform.vendor,
		device: platform.model,
		os: [os.name, os.versionName ?? os.version].filter(Boolean).join(' ') || undefined,
		os_version: os.version,
		browser: browser.name || undefined,
		browser_version: browser.version || undefined,
	};
}

/**
 * The browser and OS of a stored agent_data. Classic writes JSON; indexcards logins before it
 * wrote the same shape stored the raw User-Agent header
 */
export function readAgent(stored: string | null): { browser: string | null; os: string | null } {
	if (!stored) return { browser: null, os: null };
	let data: AgentData;
	try {
		data = JSON.parse(stored) ?? {};
	} catch {
		data = parseUserAgent(stored);
	}
	return { browser: data.browser || null, os: data.os || null };
}
