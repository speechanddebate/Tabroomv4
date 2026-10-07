import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import * as controller from '../../../../../controllers/tab/section/blast.js';

const router = Router();

router.post('/:sectionId/blastPairing', requireAccess('panel', 'write', (req) => Number(req.params.sectionId)), controller.blastSectionPairing);
router.post('/:sectionId/blastMessage', requireAccess('panel', 'write', (req) => Number(req.params.sectionId)), controller.blastSectionMessage);

export default router;
