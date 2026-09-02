import type { z } from 'zod';
import { HomepageAdSchema } from '@tabroom/types';

export const HomepageAdExample = [
	{
		url: 'https://example.com',
		imgSrc: 'https://example.com/ad.jpg',
		background: '#FFFFFF',
	},
] satisfies Array<z.output<typeof HomepageAdSchema>>;