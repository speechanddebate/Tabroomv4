// TODO: this tree is not mounted anywhere. Its routers use requireAccess pairs policy.ts has no rule for
// yet (panel write, rpool read and write), which throw at import; add them before mounting.
import { Router } from 'express';

import categoryRouter from './categoryRouter.js';
import districtRouter from './districtRouter.js';
import eventRouter from './eventRouter.js';
import jpoolRouter from './jpoolRouter.js';
import resultRouter from './resultRouter.js';
import rpoolRouter from './rpoolRouter.js';
import sectionRouter from './sectionRouter.js';
import timeslotRouter from './timeslotRouter.js';
import tournRouter from './tournRouter.js';

const router = Router({ mergeParams: true });

router.use('/categories', categoryRouter);
router.use('/districts', districtRouter);
router.use('/events', eventRouter);
router.use('/jpools', jpoolRouter);
router.use('/results', resultRouter);
router.use('/rpools', rpoolRouter);
router.use('/sections',sectionRouter);
router.use('/timeslots', timeslotRouter);
router.use('/tourns', tournRouter);
export default router;