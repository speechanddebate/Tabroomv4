import webpageRepo from '../../repos/webpageRepo.js';
import { ToPublicPage } from '../mappers/pageMapper.js';
import { db } from '../../data/database.js';
import type { Request, Response } from 'express';

/** Get a list of the public, sitewide pages
 */
export async function getPublicPages(req: Request, res: Response){

	const pages = await webpageRepo.getWebpages(db, {
		sitewide: true,
		slug: req.params.slug[0] ?? undefined,
	});

	if (req.params.slug) {
		if (!pages.length) {
			return res.status(404).json({ message: 'Page with not found' });
		}
		return res.json(ToPublicPage(pages[0]));
	}

	res.json(pages.map(ToPublicPage));
}
