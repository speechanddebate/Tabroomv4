// html-to-text ships no types. Only what indexcards uses is declared here;
// @types/html-to-text has the full set if more is needed.
declare module 'html-to-text' {
	type SelectorDefinition = {
		selector: string;
		options?: Record<string, unknown>;
	};

	type HtmlToTextOptions = {
		wordwrap?: number | false | null;
		selectors?: SelectorDefinition[];
	};

	export function convert(html: string, options?: HtmlToTextOptions): string;
}
