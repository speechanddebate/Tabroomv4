// Runs cleanup when the process is asked to stop. Only one handler can exit the process, so everything
// that needs to finish first (workers, telemetry) registers here instead of listening for signals itself.
// Imports nothing at load so instrumentation can use it before the SDK patches other modules.

type ShutdownHook = { name: string, run: () => Promise<unknown> };

const hooks: ShutdownHook[] = [];

/** Milliseconds to wait for hooks before exiting anyway. Docker kills the container after 10s by default */
const SHUTDOWN_TIMEOUT = 9000;

let shuttingDown = false;

/** Run a cleanup step on SIGTERM or SIGINT. Hooks run one at a time, most recently registered first */
export function onShutdown(name: string, run: () => Promise<unknown>) {
	hooks.push({ name, run });
}

async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;

	const { default: logger } = await import('./logger.js');
	logger.info(`Received ${signal}, shutting down`);

	setTimeout(() => {
		logger.error(`Shutdown hooks did not finish within ${SHUTDOWN_TIMEOUT}ms, exiting`);
		process.exit(1);
	}, SHUTDOWN_TIMEOUT).unref();

	for (const hook of [...hooks].reverse()) {
		try {
			await hook.run();
		} catch (error) {
			logger.error(`Shutdown step ${hook.name} failed`, error);
		}
	}
	process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
