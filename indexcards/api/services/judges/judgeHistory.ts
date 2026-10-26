// Pure helpers for a judge's history at a tournament

// British Parliamentary positions by speaker order
const WUDC_POSITIONS: Record<number, string> = {
	1: '1G',
	2: '1O',
	3: '2G',
	4: '2O',
};

/**
 * The side or position label shown next to an entry on a judge's panel: the event's own
 * aff/neg labels for two-sided debate, the BP position for WUDC, nothing for speech.
 */
export function sideLabel(
	eventType: string | null,
	side: number | null,
	speakerorder: number | null,
	affLabel: string | null,
	negLabel: string | null,
): string | null {
	if (eventType === 'wudc') {
		return (speakerorder && WUDC_POSITIONS[speakerorder]) || null;
	}
	if (side === 1) return affLabel ?? 'Aff';
	if (side === 2) return negLabel ?? 'Neg';
	return null;
}
