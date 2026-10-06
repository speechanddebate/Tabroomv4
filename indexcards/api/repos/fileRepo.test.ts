
import fileRepo from './fileRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js'

describe('FileRepo', () => {
	describe('getFile', () => {
		it('does not return unpublished files by default', async () => {
			const file = await factories.file.create({published: false});
			// Arrange
			const result = await fileRepo.getFile(db, file.id);

			// Assert
			expect(result).toBeUndefined();
		});

		it('returns unpublished files when unpublished is true', async () => {
			const file = await factories.file.create({published: false});
			// Arrange
			const result = await fileRepo.getFile(db, file.id, { unpublished: true });

			// Assert
			expect(result).toBeDefined();
			expect(result?.id).toBe(file.id);
		});

	});

	describe('getFiles', () => {
		it('returns only tourn files when given a tournId', async () => {
			// Arrange
			const tourn = await factories.tourn.create();

			await factories.file.create({ tourn: tourn.id });
			const { id: publishedFileId } = await factories.file.create({ tourn: tourn.id, published: true });

			// Act
			const files = await fileRepo.getFiles(db, { tourn: tourn.id });

			// Assert
			expect(files).toBeInstanceOf(Array);
			//expect oneof the files to match the created file
			const matchedFile = files.find(f => f.id === publishedFileId);
			expect(matchedFile).toBeDefined();
			//expect all files to have tournId and published = true
			for (const f of files) {
				expect(f.tourn).toBe(tourn.id);
				expect(f.published).toBe(1);
			}
		});
	});
	describe('createFiles', async () => {
		it('creates files successfully', async () => {
			const file = await fileRepo.createFile(db,{});
			const fetchedFile = await fileRepo.getFile(db, file.id,{unpublished: true});

			//ensure that id, updatedAt and createdAt are present and not null
			expect(fetchedFile).toHaveProperty('id');
			expect(fetchedFile?.id).not.toBeNull();
			expect(fetchedFile?.timestamp).not.toBeNull();
			expect(fetchedFile?.created_at).not.toBeNull();
		});
	});
});

