# Indexcards Auth
## Available Authentication Methods
Indexcards currently supports only Cookie auth (the session token in the `TabroomToken` cookie, see `config.cookie.name`). Since API keys aren't issued yet, all access goes through the frontend. API key auth (via the `Authorization` header) will be added later as another [strategy](#strategies). A key will act as the person who owns it, with everything that person can do.

All user authentication is handled under `/auth` routes for example `/auth/login` and `/auth/register`.

TODO: add more details on how each of these work


# Internal Auth
This section describes auth as it is relevant to a developer working on indexcards.

## Request auth state
Every request passes through the [Authentication middleware](/api/middleware/auth/authentication.ts), which always sets these three properties, even for anonymous requests:

| property | what it is |
| --- | --- |
| `req.auth` | **how** the request authenticated: `{ method, sessionId, su }`. `method` is `'cookie'` or `'none'`. |
| `req.person` | the person acting, or `null`. This is the shortcut to use whenever you need the person, e.g. `req.person.id`. |
| `req.actor` | **who** is acting, for authorization decisions. See [Actors](#actors). |

If a cookie is present but invalid, the cookie is cleared and the request continues anonymously. A banned user gets a 403.

### Getting the person in a controller
Routes that act as a person should use `requirePerson` on the router, and the handler should call `getPerson(req)`:
```ts
export async function inboxList(req: Request, res: Response) {
	const person = getPerson(req);
	const messages = await messageRepo.getMessages(db, person.id);
	...
}
```
`getPerson` returns a non-null `SessionPerson`, or throws an `AUTH_UNAUTHENTICATED` error, which `errorHandler` turns into a 401 problem. Where a person is optional (e.g. public endpoints that show extra data when logged in), use `req.person?.id`.

> [!NOTE]
> Why an accessor and not a narrowed request type? TypeScript runs in strict mode, so a handler typed with a non-null `person` can't be passed to an Express route, and a wrapper would break Fastify's type-provider inference. `getPerson(req)` works unchanged in both.

### su
When a site admin su's into another account:
- `req.person` and `req.actor` are the **impersonated** person. Authorization and data access act as that person.
- `req.auth.su` is the admin who su'd in.

Who to credit in logs and messages:
- UI text and records (e.g. dashboard "marked by", backup `created_by`) use the impersonated person.
- Audit change logs set `person` to the impersonated person, with "by admin@email while su'd as person@email" in the description.
- Admin/ops messages (server reboots and scaling) read "Admin Name admin@email while su'd as Person Name person@email".

## Strategies
Authentication is split into strategies, defined alongside the middleware in [`authentication.ts`](/api/middleware/auth/authentication.ts) (currently just `cookieStrategy`). A strategy is a plain function with no Express types:
```ts
type AuthStrategy = (db: Database, input: { cookies, headers }) => Promise<AuthResult>;

type AuthResult =
	| { status: 'none' }                                  // no credentials this strategy handles, try the next one
	| { status: 'invalid'; clearCookie?: boolean }        // credentials present but bad, continue anonymously
	| { status: 'forbidden'; detail: string }             // valid but not allowed, e.g. banned
	| { status: 'success'; auth: AuthInfo; person: SessionPerson };
```
`Authenticate` tries each strategy in order. The first one that doesn't return `none` decides the request. It then sets `req.auth`, `req.person` and `req.actor` from the result.

## Authorization
Authorization is a much more complicated process as it doesn't just rely on *who* you are, but *what* your relationship is to the requested data is, and even more complicated, what that data's relationship is to other data! As such we have abstracted the process of determining how a user can preform an action from needing to be defined on each route and the route must only specify **what** action permission is needed for.

### Simple checks
Some authorization checks rely only on *who* is making the request. [`authorization.ts`](/api/middleware/auth/authorization.ts) provides these as route middleware:
- `requirePerson`: a logged in person
- `requireSiteAdmin`: a site admin

### RBAC
For the rest of Authorization the decisions, information is needed about *who* is making the request, *what* they are requesting and *how* different permissions grant or deny certain access. For this, an api was created to allow a caller to ask "can this `actor` preform this `action` on this `resource`?" without worrying about the myriad of different ways that can be true. This is accomplished with 2 main concepts you need to know about when making a new route, `actors` and `auth contexts`.

### Actors
actors define who or what is acting on a request and provide methods for checking authorization.
>[!NOTE]
> Why actor and not person? not every operation may be initiated by a person, automated process may call the same functions or be limited to specific scopes. An actor object provides this flexibility.

An actor is one of `PersonActor | AnonymousActor` (see [`auth/types.ts`](/api/middleware/auth/types.ts)):
```ts
req.actor = {
	type: 'person',          // 'person' | 'anonymous'
	id: 123,
	Person: { ... },         // person actors only. prefer req.person in controllers
	can: (resource, action, resourceId) => Promise<boolean>,
	assert: (resource, action, resourceId) => Promise<void>, // same as can but throws AUTH_FORBIDDEN (403)
	allowedIds: (resource, action) => { all, ids },          // ids allowed WITHIN THE LOADED AUTH CONTEXT
	grant: (perms) => void,  // used by auth context loaders, see below
};
```
Actors are created with `createActor(db, person)`. They hold their own perms and caches and don't read anything from `req`, so they can be built outside a request (tests, scripts, jobs).

for example, if you wanted to check if an actor had the ability to `read` an `event` with Id `eventId` you would call:
```js
await req.actor.can('event','read',eventId);
```
similarly, if you wanted to get all events that an actor could read (for a given authContext) you would do:
```js
req.actor.allowedIds('event','read');
```
`assert` failures thrown from a handler are turned into a 403 problem by `errorHandler`. Actors can be passed into service functions that need to make fine-grained auth decisions.

### requireAccess Helper
a common scenario is protecting an entire endpoint behind a certain action. for this you can use `requireAccess()` in the route definition as a middleware. for example:
```js
router.route('/:tournId').get(requireAccess('tourn', 'read'), tournController.getTourn)...
```
would require the actor to have read permissions on the tourn in question.
> [!NOTE]
> requireAccess works by literally taking the name of the resource (in this case 'tourn') and looking for a resource + Id path param to determine the target. as such it is required that the resource Id be both in the path and in the correct form.

## What is Auth Context?
So what the hell is this 'AuthContext' you keep talking about? simply put, the authContext is the collection of permissions that are loaded and evaluated when making authorization decisions. Think of it this way, a person may have hundreds of permissions across different tourns, chapters, circuits, etc and only a subset of those will be relevant for a given request It would also be extremely inefficient to have to look these up every time, so, the AuthContext is a way of specifying **what** permissions get loaded and evaluated for a given request.

>[!NOTE]
> you will likely never have to worry about determining the auth context when creating route in an established tree ( under `/tab/tourns` for instance) but it is still extremely important to understand that you are not evaluating ALL of an actors permissions when making a request, but only the ones granted to the actor for that request.

more information on Auth context and creating new ones can be found in the [Implementation Details](#implementation-details) section.

# Implementation Details

These are details about *how* the RBAC system works. they are not necessary to understand to protect your new routes. but can help provide more context for how the whole system works.

## Auth Context
Loaders live in [`authContext.ts`](/api/middleware/auth/authContext.ts) and come in two layers:
- **pure loaders**, e.g. `loadTournPerms(db, personId, tournId)` and `loadChapterPerms(db, personId, chapterId)`, return `Perm[]` and know nothing about the request.
- **adapters**, e.g. `loadTournAuthContext`, are `router.param` handlers that call the loader with `req.db` and pass the result to `req.actor.grant(...)`.

`grant` adds the perms to the actor and clears its cached decisions. In Fastify the same pure loaders run from a `preHandler` hook, since there is no `router.param`.

A perm looks like this:
```ts
type Perm = {
	scope: string;       // the 'scope' of the permission ie tourn, category, event, chapter etc
	id: number;          // the Id of that particular resource. ie if scope was tourn, this would be the tournId
	role: string;        // the role granted at this scope ie tabber, owner etc. must exist in ROLES
	categoryId?: number;
	tournId?: number;
};
```

## checkAccess(resource, action, target, perms)
This is the workhorse of the whole process. It takes the who, what, and where and makes and authorization decision.

this is the function that answers "does any of the permissions in `perms` allow `action` on `resource` either directly, or via another resource like a parent in `target`.

this is probably the most confusing part of the whole system and could benefit from some refinement. The benefit however is that this is a single interface to make a boolean determination on access meaning it can be completely rewritten without changing the caller and it is highly testable as it is a synchronous with rigid inputs.

## building targets
It would be inefficient to build the entire parent-child relationship of permissions on every request. It would also be inefficient to do it again for multiple checks within a single request. Therefore the building of the parent-child relationships is done on demand (`buildTarget(db, resource, id, cache)`) and the result of a certain level is cached. meaning that if we needed to build the tree for an event and then later needed to check permissions on the same event or the parent tourn, we wouldn't need another db call.

## Roles, actions, and parents oh my!
stuff about how roles and actions and parent relationships should be defined and how they work.

> [!WARNING]
> Every perm `role` must have an entry in `ROLES`, or `checkAccess` throws. The `checker` tag in the permission table currently has no role definition.
