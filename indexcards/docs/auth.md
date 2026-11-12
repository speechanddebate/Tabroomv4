# Indexcards auth

How indexcards decides who is calling and what they may do. Read [How it works](#how-it-works) once, then use the [recipes](#recipes) when you build something.

## How it works

Every request answers two questions in order:

1. **Who is calling?** (authentication) `Authenticate` reads the session cookie and sets `req.auth`, `req.person`, and `req.actor`, even for anonymous requests.
2. **May they do this?** (authorization) A route's guards decide before the handler runs. Handlers and services ask for decisions that depend on data they've loaded.

```
cookie ─▶ Authenticate ─▶ csrfMiddleware ─▶ route guards ─────────────▶ handler ─▶ errorHandler
          req.auth          cookie writes    requirePerson                req.actor.can/assert/which
          req.person        need a trusted   requireSiteAdmin
          req.actor         Origin           requireAccess(resource, action)
                                             visibility middleware (hidden tourns, unreleased rounds)
```

### The authorization engine

Every decision about a specific resource ("may this person write to this event?") goes through one engine in `api/middleware/auth/`. It has three parts:

- **Roles** ([`relations.ts`](/api/middleware/auth/relations.ts), the `roles` object) say **who** holds a kind of permission, defined once. A role joins the `permission` table, which classic writes, on a scope's id and names the tags it accepts. `categoryTab`, for example, means an owner or tabber row on that category.
- **Relations** ([`relations.ts`](/api/middleware/auth/relations.ts), the `relations` object) say **how** one resource reaches the column a role needs. The judge resource reaches its category through `judge.category`, so its `categoryTab` relation is `roles.categoryTab(<judge joined to category>, 'judge.category')`. A relation that isn't a permission is a plain query, like being the judge (`judge.person`) or a competitor on an entry (`entry_student` → `student.person`).
- **The policy** ([`policy.ts`](/api/middleware/auth/policy.ts)) lists, for each resource and action, the relations that allow it. It is the whole rule:
  ```ts
  event: {
  	read: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
  	write: ['tournTab', 'eventTab'],
  },
  ```

The engine ([`access.ts`](/api/middleware/auth/access.ts)) answers three questions from those:

| function | answers | how |
| --- | --- | --- |
| `can(db, person, resource, action, id)` | may this person do it? | One `select exists (…) or exists (…)`, a branch per listed relation, each filtered on its own indexed columns. MariaDB stops at the first match. |
| `who(db, resource, action, id)` | everyone who may, and why | The same branches as a `union all`, returning `{ personId, relation }`. |
| `which(db, person, resource, action, { tourn })` | everything in one tourn this person may act on | The same branches filtered by person and tourn, returning `{ all, ids }`. |

A site admin passes every `can` without a query, and `which` gives them `{ all: true, ids: [] }`. A resource id that doesn't exist matches no relation, so the answer is "no", which never reveals whether the id exists. Answers are fresh on every request; don't cache them across requests, because classic writes the permission tables directly.

`req.actor` wraps the engine for the request's person: `can`, `assert` (throws `AUTH_FORBIDDEN`, a 403), and `which`. It caches answers for the request. `createActor(db, person)` builds one anywhere, including jobs and scripts.

### Roles

| role | who |
| --- | --- |
| `tournStaff` | any owner, tabber, or checker row at the tourn, at any scope |
| `tournTab`, `tournOwner`, `tournChecker` | tourn-wide rows (`Tab` means owner or tabber) |
| `eventTab`, `eventChecker`, `categoryTab`, `categoryChecker` | rows on that event or category |
| `coach`, `prefsCoach` | `chapter` and `prefs` rows on a chapter |
| `circuitAdmin`, `regionAdmin` | circuit and region rows |
| `districtChair`, `districtMember`, `districtWsdc` | an NSDA district's committee |

A role only matches the tags it names, so tags no role uses (`contact`, `limited`) grant nothing.

### Actions

The action names come from how classic divides tourn access:

| action | meaning |
| --- | --- |
| `staff` | knows a hidden tourn exists. Everyone on its staff, not contacts or circuit admins. |
| `read` | metadata: the tourn, its events, rounds, rooms, and staff. Checkers read; circuit admins read the tourn only. |
| `check` | room checker work: marking rounds started, seeing every room, online ballot review. |
| `activate` | marking an entry or judge present at the tourn (classic's `active`). |
| `write` | everything else tab does in that scope: setup, registration, pairings, ballots, results, publishing. Only tourn-wide owners and tabbers write the tourn itself (settings, schools, money, rooms, staff). |
| `owner` | managing owners, deleting or cloning the tourn. |

Scope comes from the resource. Event staff reach their event's rounds, panels, and entries. Category staff reach their category's judges and judge pools, not its events. School pages keep event and category staff and checkers out.

A few actions name one specific job:
- `entry.flip`: competitors, the entering school's coaches, and tourn and event tabbers.
- `entry.prefs` and `chapter.prefs`: coaches, prefs-only coaches, and competitors when the chapter allows it with `self_prefs`.
- `entry.observe`: the entering school's coaches, joining a campus round as observers.
- `school.dashboard`: the one thing a school contact sees.
- `student.self`: a student acting on their own record.
- `judge.conflicts`: the judge and tab.
- `district.worlds`: the WSDC roster.

### What stays outside the engine

The engine answers "may this person act on this resource". These decide something else, and stay where they are:

- **Who is logged in.** `requirePerson`, `requireSiteAdmin`, and `getPerson` in [`authorization.ts`](/api/middleware/auth/authorization.ts).
- **Visibility of data by its state.** These are in `api/policy/`:
  - `requirePublicTourn` returns 404 for a hidden tourn, even to its staff: a hidden tourn has no public invite, schedule, or results.
  - `requirePublicForAttn` returns 404 for a hidden tourn unless the caller passes `tourn.staff`.
  - `requireRoundOutToJudges` lets tab staff (who can read the panel) through. Everyone else gets a 404 on ballot routes until the round is out to judges, and a 404 for a ballot they can't read, so a stranger can't tell released rounds from unreleased ones.

  They answer 404 so hidden things don't show they exist.
- **Rules about state or a row:** a closed conflict sheet, which strike rows a judge may remove, whether a flip is open, a paradigm save waiting on email confirmation. These live in services like `ballotRules`, `flipRules`, and `conflictRules`.
- **Impersonation limits, rate limits, cache flags:** for example, refusing push settings while su'd, or the site-admin rate-limit bypass on student search.
- **The caller's own data.** `/v1/user` routes return the logged-in person's records by filtering on `person.id`. They don't address other people's resources by id.
## Recipes

### Protect a route on a resource
Name the path param `<resource>Id`, because `requireAccess` reads `req.params[resource + 'Id']`. Check the resource the route acts on, not only its parent. The route order is guard, then `ValidateRequest`, then the controller.
```ts
router.route('/:tournId/events/:eventId')
	.put(requireAccess('event', 'write'), ValidateRequest, controller.updateEvent);
```
- Checking the event matters: its relations find the event's real tourn. A check on `tourn` alone would let tourn A's staff edit tourn B's event by id.
- `requireAccess` returns 401 to anonymous callers, 400 for a malformed id, and 403 when no relation matches.
- It throws when the route is built for a pair `policy.ts` has no rule for, so a typo fails at boot.
- A resource with a composite id takes a resolver: `requireAccess('ballot', 'write', req => ({ judgeId: Number(req.params.judgeId), panelId: Number(req.params.panelId) }))`.
- Zod in `requestParams` stays the declared validation. It runs after the guards, so a guard that runs earlier checks its own ids with `isPositiveId` ([`validation.ts`](/api/middleware/validation.ts)).

### Decide inside a handler or service
When the decision depends on data you've loaded, ask the actor:
```ts
if (!await req.actor.can('event', 'check', room.event_id)) return NotFound(req, res, 'No such room');
await req.actor.assert('tourn', 'write', tournId);   // throws a 403 through errorHandler
```
Services take the actor as a parameter. Don't read `req` or the `permission` table yourself; if the engine has no rule for what you need, add one.

### List what a person can act on
Use one `which` instead of `can` in a loop:
```ts
const { all, ids } = await req.actor.which('event', 'read', { tourn: tournId });
const events = all ? allEvents : allEvents.filter(event => ids.includes(event.id));
```
The tourn bound is required. Chapters, students, circuits, regions, and districts belong to no tourn, so `which` can't list them.

### Find everyone who can act on something
For notifications and audits, for example everyone who may flip for an entry:
```ts
const people = await who(db, 'entry', 'flip', entryId);   // [{ personId, relation: 'coach' }, …]
```
Site admins aren't listed.

### Change who can do something
Edit the list in `policy.ts`, with the most common relation first (`can` stops at the first match). Then:
- If the rule deliberately breaks the pattern, add an edge case to [`policy.test.ts`](/api/middleware/auth/policy.test.ts). Breaking the pattern means something like category staff not reaching events, or a rule that lists `eventTab` without `tournTab`; such a rule also needs an entry in its `exceptions` list.
- The hierarchy test there fails if a rule lists `eventTab` or `categoryTab` without `tournTab`.

### Cover a new resource
1. Add its relations to `relations.ts`. Build permission relations on a role, and give each relation its resource id column, person column, and tourn column (none for resources outside a tourn). Pick the tourn join path that lets MariaDB start from the person's rows.
2. Add its rules to `policy.ts`.
3. In [`relations.test.ts`](/api/middleware/auth/relations.test.ts), add the resource to the fixture and one case per relation: the exact fixture people it matches. Add near misses to the fixture (another event, a retired student, another chapter's coach) so they prove themselves by not being on the list. The suite fails if a relation has no case.
4. Check the SQL on the dev DB (below).

### Add a new kind of permission
Add a role to `roles` in `relations.ts` naming the tags it accepts, then relations that use it on each resource it applies to, as above.

### Act on the logged-in person's own data
Routes under `/v1/user` get `requirePerson` at the mount and use `getPerson(req)`:
```ts
export async function inboxList(req: Request, res: Response) {
	const person = getPerson(req);
	res.json(await messageRepo.getMessages(db, person.id));
}
```
Filter every query by `person.id`; never take another person's id from the request. A route that addresses a resource by id belongs under `/rest` with `requireAccess`.

### Hide data by its state
Use visibility middleware, or a rule in the service that owns the state, and answer 404 so the data's existence doesn't leak. Don't put state in a relation: relations would then answer differently by time, for `who` and `which` too.

### Test a guarded route
Router tests check wiring only: 401 anonymous, 403 for a stranger, and success for one allowed person. Who may do what is `relations.test.ts`'s job. Give the allowed person a real row, because the engine reads the database:
```ts
await factories.permission.create({ person: tabber.id, tourn: tourn.id, tag: 'tabber' });
const { userkey } = await factories.session.create({ person: tabber.id });
expect((await request(server).get(url).asPerson(userkey)).status).toBe(200);
```
Event and category rows carry their `tourn` in real data, so set it in tests too. `.asPerson` sets both the cookie and a trusted Origin. Test as a non-admin: site admins skip every check, so a broken guard still passes for them.

### Check a decision from a job or script
```ts
const actor = createActor(db, person);
if (await actor.can('tourn', 'write', tournId)) …
```

### Credit the right person while su'd
`req.person` is the impersonated person and `req.auth.su` is the admin.
- UI text and records credit the impersonated person.
- Audit change logs set `person` to the impersonated person and add "by admin@email while su'd as person@email".
- Admin and ops messages read "Admin Name admin@email while su'd as Person Name person@email".

### Check performance
For each new relation, EXPLAIN the generated SQL on the dev DB (it has production-sized data). Capture it by passing `db.withPlugin({ transformQuery })` to `can` or `which`.
- A `can` branch should read a handful of rows through an index, and a denied check runs every branch (about 0.25 ms each), so keep rules to about eight relations.
- `which` should start from the person's rows, not walk every row in the tourn.
- Use `or exists`, never `exists (… union all …)`: MariaDB runs every branch of a union even after one matches.

## Reference

### Request auth state
| property | what it is |
| --- | --- |
| `req.auth` | **how** the request authenticated: `{ method, sessionId, su }`. `method` is `'cookie'` or `'none'`. |
| `req.person` | the person acting, or `null`. While su'd, the impersonated person. |
| `req.actor` | who is acting, for authorization: `can`, `assert`, and `which`. |

### Authentication
- **Strategies** ([`authentication.ts`](/api/middleware/auth/authentication.ts)): a strategy is `(db, { cookies, headers }) => AuthResult` (`none`, `invalid`, `forbidden`, or `success`). `Authenticate` tries each in order, and the first that isn't `none` decides. Today there's one, `cookieStrategy`. To add API keys, add a member to `AuthMethod` in [`types.ts`](/api/middleware/auth/types.ts), a strategy to `strategies`, and a scheme in [`security.ts`](/api/routes/openapi/security.ts).
- **Sessions:** the session key is in the `TabroomToken` cookie (`config.cookie.name`), shared with classic. The cookie is `httpOnly`, `sameSite: lax`, on `config.cookie.domain`, and `secure` in production. An unknown or expired key clears the cookie and continues anonymously. `session.expires` is set by classic (48 hours on one-time-password logins) and compared with the database clock; a null `expires` never expires. A banned person's session is deleted, with a 403. Banned means a `banned` person setting other than empty or `'0'` (`isBanned` in [`AuthService.ts`](/api/services/AuthService.ts), shared by login and the cookie strategy). `last_access` is refreshed at most hourly.
- **CSRF** ([`csrfMiddleware.ts`](/api/middleware/csrfMiddleware.ts)): cookie writes must carry an `Origin` in `config.csrf.trusted_origins`, or they get a 403. Non-cookie auth and `GET`/`HEAD`/`OPTIONS` are exempt. A login from a browser with no session is non-cookie auth, so it passes; a login from a browser that already has one is checked, so a cross-site page can't swap the account.

### `/auth` routes
| route | what it does |
| --- | --- |
| `POST /v1/auth/login` | checks the username and password, creates a session, sets the cookie. The session key is only in the cookie, never the body. 401 for bad credentials, 403 if banned. An unknown username still costs one password hash, so timing doesn't reveal which accounts exist. |
| `POST /v1/auth/logout` | deletes the session and clears the cookie. Always 204. |
| `POST /v1/auth/su` | site admins only: starts impersonating `suId`. Dev-gated. |
| `POST /v1/auth/suend` | ends an su session. |
| `POST /v1/auth/register` | creates an account and a session. Dev-gated. |
| `GET /v1/user/session` | the logged-in `Person` and `Su`; schemats calls it on every page load. |

su is stored on the session row: `su` sets `session.person` to the target and `session.su` to the admin, and `suend` swaps them back. su'ing again from inside an su session (possible only when the target is also a site admin) keeps the original admin in `session.su`, so `suend` always returns to them. Password reset and email confirmation still live in classic.

### Status codes
| code | when |
| --- | --- |
| 400 | a malformed id (`requireAccess`, visibility middleware, then `ValidateRequest`) |
| 401 | no session |
| 403 | logged in, but no relation allows the action (including a resource that doesn't exist), or banned |
| 404 | hidden or unreleased data from visibility middleware (including a ballot the caller can't read), or a missing resource reached by a site admin |

### OpenAPI
A route is marked as requiring `cookieAuth` when it sits behind a function in the `authMiddleware` WeakSet (`requirePerson`, `requireSiteAdmin`, every `requireAccess`). A new guard must call `authMiddleware.add(fn)`, or the spec shows its route as public.

### Tests
| file | owns |
| --- | --- |
| [`relations.test.ts`](/api/middleware/auth/relations.test.ts) | who each relation matches, and its tourn column |
| [`access.test.ts`](/api/middleware/auth/access.test.ts) | the engine's mechanics |
| [`policy.test.ts`](/api/middleware/auth/policy.test.ts) | the hierarchy invariant and edge cases |
| [`authorization.test.ts`](/api/middleware/auth/authorization.test.ts) | the guards and the actor |

### Troubleshooting
- **Everyone but site admins gets 403.** The param probably isn't named `<resource>Id`, or a pathless `router.use(requireAccess(...))` can't see it.
- **`requireAccess: no policy for …` at startup.** Add the rule to `policy.ts`, or fix the action name.
- **A test's permission has no effect.** The engine reads the database; create a row with `factories.permission.create`, with `tourn` set on event and category rows.
- **A checker can't reach something.** Checkers only read and check; category checkers never reach events, rounds, or panels.