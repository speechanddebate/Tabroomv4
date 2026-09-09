
import webpageRepo from './webpageRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('webpageRepo', () => {
	describe('getWebpage', () => {
		it('retrieves webpage by id', async () => {
			const { webpageId } = await factories.webpage.create();
			const result = await webpageRepo.getWebpage(db, webpageId);
			expect(result, 'Expected result not to be null').not.toBeNull();
			expect(result?.id, `Expected webpageId to be ${webpageId} but got ${result?.id}`).toBe(webpageId);
		});
		it('does not include unpublished webpages by default', async () => {
			const { webpageId: publishedPageId } = await factories.webpage.create({ published: true });
			const { webpageId: unpublishedPageId } = await factories.webpage.create({ published: false });
			const result = await webpageRepo.getWebpages(db);
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: publishedPageId }),
				])
			);
			expect(result).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('includes unpublished webpages when unpublished is true', async () => {
			const { webpageId: unpublishedPageId } = await factories.webpage.create({ published: false });
			const result = await webpageRepo.getWebpage(db, unpublishedPageId, { unpublished: true });
			expect(result).toEqual(
				expect.objectContaining({ id: unpublishedPageId }),
			);
		});
	});
	describe('getWebpages', () => {
		let tournId: number, sitewidePageId: number, tournPageId: number, publishedPageId: number, unpublishedPageId: number;
		beforeAll(async () => {
			const { tournId: createdTournId } = await factories.tourn.createTestTourn();
			tournId = createdTournId;
			const sitewide = await factories.webpage.create({ published: true, sitewide: true });
			const tourn = await factories.webpage.create({ tourn: tournId, published: true });
			const pub = await factories.webpage.create({ slug: 'published-page', published: true });
			const unpub = await factories.webpage.create({ published: false });

			sitewidePageId = sitewide.webpageId;
			tournPageId = tourn.webpageId;
			publishedPageId = pub.webpageId;
			unpublishedPageId = unpub.webpageId;
		});
		it('returns an array of webpages', async () => {
			const result = await webpageRepo.getWebpages(db);
			expect(Array.isArray(result)).toBe(true);
		});
		it('returns only sitewide pages when sitewide scope is provided', async () => {
			const result = await webpageRepo.getWebpages(db, { sitewide: true });
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: sitewidePageId }),
				])
			);
			expect(result).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: tournPageId }),
					expect.objectContaining({ id: publishedPageId }),
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('returns only tourn-specific pages when tournId scope is provided', async () => {
			const result = await webpageRepo.getWebpages(db, { tournId });
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: tournPageId }),
				])
			);
			expect(result).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: sitewidePageId }),
					expect.objectContaining({ id: publishedPageId }),
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('does not return unpublished pages by default', async () => {
			const result = await webpageRepo.getWebpages(db);
			expect(result).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('returns unpublished pages when unpublished is true', async () => {
			const result = await webpageRepo.getWebpages(db, {}, { unpublished: true });
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('returns pages matching slug when slug scope is provided', async () => {
			const result = await webpageRepo.getWebpages(db, { slug: 'published-page' });
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: publishedPageId }),
				])
			);
			expect(result).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: sitewidePageId }),
					expect.objectContaining({ id: tournPageId }),
					expect.objectContaining({ id: unpublishedPageId }),
				])
			);
		});
		it('throws an error when invalid scope key is provided', async () => {
			await expect(webpageRepo.getWebpages(db, { invalidKey: 'value' } as object)).rejects.toThrow('Invalid webpage scope key: invalidKey');
		});
	});
	describe('createWebpage', () => {
		it('creates webpage when provided valid data', async () => {
			const webpageData = factories.webpage.createWebpageData();
			const resultId = await webpageRepo.createWebpage(db, webpageData);
			expect(resultId).toBeDefined();
			const result = await webpageRepo.getWebpage(db, resultId);
			expect(result).toBeDefined();
			expect(result?.id).toBe(resultId);
			expect(result?.created_at).toBeDefined();
			expect(result?.timestamp).toBeDefined();
			expect(result?.title).toBe(webpageData.title);
			expect(result?.content).toBe(webpageData.content);
			expect(result?.published).toBe(webpageData.published === 1);
		});
	});
	describe('updateWebpage', () => {
		it('updates webpage when provided valid data', async () => {
			const webpageData = factories.webpage.createWebpageData();
			const { webpageId } = await factories.webpage.create(webpageData);
			const updatedData = { ...webpageData, title: 'Updated Title' };
			await webpageRepo.updateWebpage(db,webpageId, updatedData);
			const result = await webpageRepo.getWebpage(db, webpageId);
			expect(result).toBeDefined();
			expect(result?.id).toBe(webpageId);
			expect(result?.title).toBe(updatedData.title);
		});
	});
	describe('deleteWebpage', () => {
		it('deletes webpage when provided valid id', async () => {
			const { webpageId } = await factories.webpage.create();
			await webpageRepo.deleteWebpage(db, webpageId);
			const result = await webpageRepo.getWebpage(db, webpageId);
			expect(result).toBeUndefined();
		});
	});
});