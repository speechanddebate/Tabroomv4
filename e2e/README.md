# e2e

Full-stack Playwright tests against the prod images, run entirely in Docker.

```bash
npm run test   # build, run, tear down; report lands in playwright-report/
npm run down   # remove leftover containers and volumes
```