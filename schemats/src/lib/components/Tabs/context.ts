import { createContext, type Snippet } from 'svelte';

// One registered TabItem. The fields are getters over the item's props, so
// Tabs always reads their current values.
export type TabEntry = {
	readonly id             : string,
	readonly title          : string,
	readonly href?          : string,
	readonly matchPatterns? : string[],
	readonly exact          : boolean,
	readonly open           : boolean,
	readonly disabled       : boolean,
	readonly tooltip?       : string,
	readonly children?      : Snippet,
};

export type TabsContext = {
	register   : (entry: TabEntry) => void,
	unregister : (id: string) => void,
};

export const [getTabsContext, setTabsContext] = createContext<TabsContext>();
