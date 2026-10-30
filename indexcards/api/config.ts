import fs from 'fs';
import path from 'path';
import z from 'zod';

/** The SMTP relay outbound mail goes through */
export const SmtpRelaySchema = z.object({
	host: z.string().default('localhost'),
	port: z.int().default(25),
	/** TLS from the first byte, as on port 465. Off, the connection starts plain and upgrades with STARTTLS when the relay offers it */
	secure: z.boolean().default(false),
	/** Verify the relay's certificate. Off for Mailpit and self-signed relays */
	rejectUnauthorized: z.boolean().default(true),
	/** Connections kept open to the relay at once */
	pool: z.int().positive().default(128),
	/** Credentials, for a relay that wants them. Both or neither */
	user: z.string().min(1).optional(),
	pass: z.string().min(1).optional(),
});

/** This schema defines the app config. add comments to a config value to get descriptions at usage. */
export const ConfigSchema = z.object({
	//----------------------------------------------------------------------
	// SERVER
	// ---------------------------------------------------------------------
	host: z.string().min(1).default('0.0.0.0'),
	port: z.number().int().min(1).max(65535).default(8001),
	/** The public origin this API is reached at, for links that point back to it (email list headers) */
	url: z.url().default('https://api.tabroom.com'),
	/** The public origin of the schemats site, for links in email and redirects to its pages */
	schemats_url: z.url().default('https://beta.tabroom.com'),
	dockerhost: z.string().default(process.env.DOCKERHOST ?? 'unknown'),
	/** An IP address, subnet, or an array of IP addresses and subnets to trust as being a reverse proxy. */
	proxy: z.array(z.string().min(1)).min(1).optional(),
	internal_domain: z.string().optional(),
	autoscale: z.object({
		enabled: z.boolean(),
		alert_threshold: z.number().int().min(0),
		alert_15_threshold: z.number().int().min(0),
		scale_threshold: z.number().int().min(0),
		scale_15_threshold: z.number().int().min(0),
		scale_max: z.number().int().min(0),
		scale_min: z.number().int().min(0),
		scale_increment: z.number().int().min(0),
	}).optional(),
	linode: z.object({
		api_url: z.string().min(1).default('https://api.linode.com/v4/linode'),
		api_token: z.string().min(1),
		users_per_server: z.number().int().min(1).default(1250),
		image: z.string().min(1),
		region: z.string().min(1),
		instance_type: z.string().min(1),
		swap_size: z.number().int().min(0),
		interface_label: z.string().min(1),
		ipam_address: z.string().min(1),
		webhost_base: z.string().min(1),
		monitor_targets: z.array(z.string().min(1)),
		stackscript_id: z.number().int().min(0),
		firewall_id: z.number().int().min(0),
		tabweb_cap: z.number().int().min(0),
	}).optional(),
	//--------------------------------------------------------------------------
	// DATABASE
	// ------------------------------------------------------------------------
	db: z.object({
		host: z.string(),
		port: z.int().min(1).max(65535).default(3306),
		database: z.string().default('tabroom'),
		replica: z.string().min(1).optional(),
		user: z.string().default('root'),
		pass: z.string().min(1),
		/** mariadb connection pool options */
		pool: z.object({
			/** Maximum number of connections */
			connectionLimit: z.int().min(1).default(5),
			/** Connections to keep open when idle. Defaults to connectionLimit */
			minimumIdle: z.int().min(0).optional(),
			/** Milliseconds to wait for a free connection before erroring */
			acquireTimeout: z.int().min(0).default(10000),
			/** Seconds an idle connection stays open before it is released */
			idleTimeout: z.int().min(0).default(1800),
			/** Milliseconds before MariaDB aborts a query (max_statement_time). 0 means no limit */
			queryTimeout: z.int().min(0).default(30000),
		}).prefault({}),
	}),
	/** Redis, which backs the BullMQ job queues */
	redis: z.object({
		/** The Redis URL, e.g. redis://user:pass@localhost:6379/0 */
		url: z.string().min(1).default(process.env.REDIS_URL ?? 'redis://localhost:6379'),
	}).prefault({}),
	/** BullMQ job queues */
	queue: z.object({
		/**
		 * Whether this process runs the jobs. Off, it only adds them and a worker process takes
		 * them. One worker per queue; parallelism is each queue's concurrency, not more workers
		 */
		runWorkers: z.boolean().default(true),
	}).prefault({}),
	//------------------------------------------------------------------------------
	// SECURITY
	// -----------------------------------------------------------------------------
	/** a shared secret with classic tabroom. used for shared sessions*/
	shared_secret: z.string().default(''),
	cors: z.object({
		origins: z.array(z.string().min(1)).default(['http://dev.tabroom.com']),
	}).prefault({}),
	cookie: z.object({
		name: z.string().default('TabroomToken'),
		domain: z.string().default('.tabroom.com'),
	}).prefault({}),
	csrf: z.object({
		trusted_origins: z.array(z.string()).default(['http://dev.tabroom.com']),
	}).prefault({}),
	ratelimiter: z.object({
		enabled: z.boolean().default(true),
		window: z.int().default(15*60*1000), // 15 mins
		max: z.int().default(100000),
		delay: z.int().default(0),
		message: z.object({
			window: z.int().default(1),
			max: z.int().default(15*1000),
		}).prefault({}),
		search: z.object({
			window: z.int().default(30*1000),
			max: z.int().default(5),
		}).prefault({}),
	}).prefault({}),
	// -----------------------------------------------------------------
	// LOGGING
	// ----------------------------------------------------------------
	logging: z.object({
		level: z.enum(['error','warn','info','http','verbose','debug','silly']).default('info'),
		/** The value that sets what is considered a slow query for logging */
		slowQueryLimit: z.int().default(5000),
		usePrettyConsole: z.boolean().default(process.env.NODE_ENV === 'development'),
		file: z.object({
			/** The file path to log to. */
			path: z.string().min(1),
		}).optional(),
	}).strict().prefault({}),
	/** OpenTelemetry traces and metrics, pushed over OTLP/HTTP */
	telemetry: z.object({
		/** Start the OpenTelemetry SDK and export traces and metrics */
		enabled: z.boolean().default(false),
		/** The service name reported on every span and metric */
		serviceName: z.string().min(1).default('indexcards'),
		/** The deployment environment reported on every span and metric */
		environment: z.string().min(1).default(process.env.NODE_ENV ?? 'development'),
		/** The OTLP/HTTP URL traces are sent to, e.g. http://tempo:4318/v1/traces. Traces are not exported when unset */
		tracesEndpoint: z.url().optional(),
		/** The OTLP/HTTP URL metrics are sent to, e.g. http://prometheus:9090/api/v1/otlp/v1/metrics. Metrics are not exported when unset */
		metricsEndpoint: z.url().optional(),
		/** Milliseconds between metric exports */
		metricsInterval: z.int().min(1000).default(60000),
	}).strict().prefault({}),
	ERROR_DESTINATION: z.array(z.string().min(1)).optional(), // only used in errorHandler
	//--------------------------------------------------------------------
	// EXTERNAL SERVICES
	// -------------------------------------------------------------------
	nsda: z.object({
		user_id: z.string().min(1).optional(),
		key: z.string().min(1).optional(),
		endpoint: z.string().min(1).optional(),
		path: z.string().min(1).default('/v2'),
		product_codes: z.object({
			tabroom: z.int().optional(),
			nc: z.int().optional(),
			nco: z.int().optional(),
		}).prefault({}),
	}).prefault({}),
	naudl: z.object({
		username: z.string().min(1).optional(),
		pw: z.string().min(1).optional(),
		token: z.string().min(1).optional(),
		client_secret: z.string().min(1).optional(),
		client_id: z.string().min(1).optional(),
		url: z.string().min(1).default('https://urbandebate.my.salesforce.com'),
		tourn_endpoint: z.string().min(1).default('/services/apexrest/v.1/TournamentService'),
		student_endpoint: z.string().min(1).default('/services/apexrest/v.1/StudentServiceTabroom'),
		sta_endpoint: z.string().min(1).default('/services/apexrest/v.1/STATabroomService'),

	}).prefault({}),
	aws: z.object({
		s3_url: z.string().default('https://s3.amazonaws.com/tabroom-files/'),
		accessKeyId: z.string().optional(),
		secretAccessKey: z.string().optional(),
		region: z.string().default('us-east-1'),
		Bucket: z.string().default('tabroom-files'),
	}).prefault({}),
	jitsi: z.object({
		key: z.string(),
		uri: z.string().default('https://campus.speechanddebate.org'),
	}).optional(),
	/** Classic Tabroom, which the API calls for the steps it hasn't ported yet (confirming a ballot) */
	classic: z.object({
		/** Base URL indexcards can reach classic at. */
		url: z.string().min(1).default('https://www.tabroom.com'),
		/** Host header to send, when url isn't the public hostname. Production classic redirects requests for other hosts */
		host: z.string().min(1).optional(),
		/** Milliseconds to wait for classic before checking whether the call worked anyway */
		timeout: z.int().min(1).default(30000),
	}).prefault({}),
	mail: z.object({
		/**
		 * What happens to a message at the relay step.
		 * log: logged and dropped, nothing is handed to a relay. The default, so a machine with no mail config sends nothing.
		 * redirect: every recipient is replaced by redirectTo, for reading real mail in your own inbox.
		 * live: handed to the relay as addressed. Outside production only with allowLiveOutsideProduction,
		 * for a relay that delivers nothing, such as the Mailpit container.
		 */
		mode: z.enum(['log', 'redirect', 'live']).default('log'),
		/** Where every message goes in redirect mode */
		redirectTo: z.array(z.email()).nonempty().optional(),
		/** Lets mode live run when NODE_ENV is not production. Set it only when the relay is a sink  THIS WILL SEND ALL EMAILS TO THE CONFIGURED RELAYS AS ADDRESSED */
		allowLiveOutsideProduction: z.boolean().default(false),
		/** The From address when a message names none */
		from: z.string().default('live@www.tabroom.com'),
		/** The relay every message goes through */
		smtp: SmtpRelaySchema.prefault({}),
	}).prefault({}).superRefine((mail, ctx) => {
		// The dev database is a copy with real addresses, so live delivery is a production-only setting
		if (mail.mode === 'live' && process.env.NODE_ENV !== 'production' && !mail.allowLiveOutsideProduction) {
			ctx.addIssue({
				code: 'custom',
				message: 'mail.mode "live" requires NODE_ENV=production; use log or redirect, or set mail.allowLiveOutsideProduction for a relay that delivers nothing',
			});
		}
		if (mail.mode === 'redirect' && !mail.redirectTo) {
			ctx.addIssue({ code: 'custom', message: 'mail.mode "redirect" needs mail.redirectTo' });
		}
	}),
	/** Web push notifications configuration, web push will fail to start without proper keys configured */
	webpush: z.object({
		/** Engineering contact for web push notifications (e.g., a mailto: address) */
		subject: z.string().min(1).optional(),
		publicKey: z.string().min(1).optional(),
		privateKey: z.string().min(1).optional(),
		allowSelfSigned: z.boolean().optional(),
	}).prefault({}),
	//--------------------------------------------------------------------
	// MISC
	// -------------------------------------------------------------------
	/** feature flags */
	features: z.object({
		/** Hide in-progress endpoints */
		HIDE_DEV_ENDPOINTS: z.boolean().default(true)
	}).prefault({}),
	ip: z.object({
		locationDB: z.string().default('/var/lib/GeoIP/GeoLite2-City.mmdb'),
		ispDB: z.string().default('/var/lib/GeoIP/GeoIP2-ISP.mmdb'),
	}).prefault({}),
});

type RuntimeConfig = z.infer<typeof ConfigSchema>;

// Load a config file from path. A missing file is fine (defaults apply), but a
// file that exists and can't be read or parsed is fatal, e.g. a failed docker
// bind mount leaves an empty directory at the path
function loadConfigFile(filePath: string): Record<string, object> {
  if (!fs.existsSync(filePath)) {
    if(process.env.NODE_ENV !== 'test') console.info(`Config not found at ${filePath}`);
    return {};
  }
  try {
    const configText = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(configText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load config at ${filePath}: ${reason}`, { cause: error });
  }
}

// Load and validate runtime config from JSON files
async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const configDir = process.env.CONFIG_DIR || './config';
  const nodeEnv = process.env.NODE_ENV || 'development';

  const baseConfigPath = path.join(configDir, 'config.json');
  const envConfigPath = path.join(configDir, `config.${nodeEnv}.json`);

  // Load base config
  const baseConfig = loadConfigFile(baseConfigPath);
  if (Object.keys(baseConfig).length > 0) {
    if(process.env.NODE_ENV !== 'test') console.info(`Loaded base configuration from ${baseConfigPath}`);
  }

  // Load environment-specific override
  const envConfig = loadConfigFile(envConfigPath);
  if (Object.keys(envConfig).length > 0) {
    if(process.env.NODE_ENV !== 'test') console.info(`Loaded ${nodeEnv}-specific overrides from ${envConfigPath}`);
  }

  // Merge: base → env-specific
  const mergedData = { ...baseConfig, ...envConfig };

  // Validate against schema
  try {
    const validated = ConfigSchema.parse(mergedData);
    if(process.env.NODE_ENV !== 'test') console.info('Configuration validated successfully against schema');

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation error:', error.issues);
      throw new Error(`Invalid configuration: ${error.message}`);
    }
    throw error;
  }
}

// Load runtime config with schema defaults
const config = await loadRuntimeConfig();

export default config;
