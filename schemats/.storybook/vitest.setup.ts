import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview';
import { setProjectAnnotations } from '@storybook/sveltekit';
import { inject } from 'vitest';
import * as projectAnnotations from './preview';

declare module 'vitest' {
	export interface ProvidedContext {
		storybookViewport: { width: number, height: number },
	}
}

const { width, height } = inject('storybookViewport');

// Without a default viewport Storybook renders every story at 1200x900, whatever
// STORYBOOK_VIEWPORT says. A story's own viewport global still wins.
const viewportAnnotations = {
	parameters: {
		viewport: {
			options: {
				a11yRun: { name: 'a11y run', styles: { width: `${width}px`, height: `${height}px` }, type: 'other' },
			},
			defaultViewport: 'a11yRun',
		},
	},
};

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations, viewportAnnotations]);
