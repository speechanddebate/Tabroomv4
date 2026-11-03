# Email types sent by classic, masoncards, and indexcards

Survey date: October 30, 2026. Input for designing a `blast()` in indexcards that builds and formats a blast and hands it to `notify()`.

Sources surveyed, read-only: `../mason/web` (classic Perl/Mason), `../masoncards/api` (Node, the API classic calls), and `indexcards/api` outside `services/notifications`. Line numbers are from that date.

## 1. How mail leaves each codebase

### Classic (`mason/web`)

| Helper | What it does | Formatting it adds |
|---|---|---|
| `funclib/send_notify.mas` with `ids` | POSTs JSON to masoncards `/ext/mason/blast`. Fields: `from`, `to` (default `noreply@www.tabroom.com`), `sender` (person id), `url`, `noWeb`, `noEmail`, `noInbox`, `ignoreNoEmail`, `subject`, `ids`, `tourn`, `emailId`, `append`, `replyTo`, `cc`, `html`, `text`. | Strips html to 72-column text for `text`. Recipient resolution, opt-out, inbox, and push happen server side. About 70 call sites. |
| `funclib/send_notify.mas` with `array`/`raw` (no ids) | MIME::Lite direct SMTP, BCC batches of 15, prod hostnames only. | No `[TAB]` prefix, default subject "Tabroom Update", default From `epoch@www.tabroom.com`, no footer, no opt-out check. |
| `funclib/send_email.mas` | Email::Stuffer direct SMTP, BCC batches of 10, prod hostnames only. Args: `body`, `subject`, `from`, `from_string`, `to`, `array`, `accounts`, `cc_accounts`, `raw`, `cc`, `no_footer`, `attachment_*`, `override`, `is_html`. | Always `[TAB] ` prefix. Footer unless `no_footer`. `from_string => "nsda"` gives an NSDA From with `info_<epoch>@speechanddebate.org`. From a person object gives `First Last <epoch@www.tabroom.com>` with Reply-To = that person. `to`/`accounts` honor `no_email` unless `override`; `array`/`raw` do not. Text is turned into html. About 30 call sites. No `email` row, no sender recorded. |
| Direct MIME::Lite | `api/this_weekend.mhtml`, `index/oh_crap.mhtml`, `api/auto_queue.mhtml`, `api/auto_flip.mhtml`. | Ops mail only. |
| Client JS to masoncards | `panel/schemat/blast.mhtml`, `blast_pairing.mas`, `blast_message.mas`, `section_blast.mhtml`, `flight_judge_save.mhtml`, `api/strike_card_process.mhtml`. | Pairing and message blasts are built server side in masoncards. |

The `email` table row is written in only two places in classic: `register/emails/send.mhtml:1141-1155` (tournament composer) and `user/circuit/email_send.mhtml:14-20` (circuit email). SMS is not used anywhere; `cell_domains.mas` has no callers.

### masoncards (`masoncards/api`)

| Helper | What it does | Formatting it adds |
|---|---|---|
| `helpers/blast.js` `notify(inputData)` | Fan-out. Requires `ids`. Flags `noEmail`, `noWeb`, `noInbox`, `noReply`, `ignoreNoEmail`. Runs `emailNotify`, `webBlast`, `inboxMessage` in parallel. | `emailNotify` drops `no_email` people unless `ignoreNoEmail`, then appends `emailInclude` (Slack address). `webBlast` posts to OneSignal for people with a push session in the last 60 days, does not check `no_email`, heading = subject or "Message from Tab", url default `/user/home.mhtml`. `inboxMessage` writes one `message` row per id with `body` = html or text, `sender_string` = replyTo or from, `email` only if `emailId` passed (no caller passes it). |
| `helpers/mail.js` `emailBlast` | One nodemailer send, every recipient in BCC, `to` and `from` default `MAIL_FROM`. | `[TAB] ` prefix always, default subject "Message from Tab", html-to-text when only html given, `append` before the footer, footer "You received this email through your account on tabroom.com ... No Emails", attachments as base64. `share` flag uses the share SMTP host. Sends only in production or `MAIL_TEST`. Writes no `email` row. |
| `helpers/admin.js` `adminBlast` | Recipients in To, not BCC. | Default subject `[TAB] Admin Blast`, a supplied subject is not prefixed. Footer "Admin blast from Tabroom". No opt-out check. |
| `helpers/pairing.js` `formatPairingBlast` + `sendPairingBlast` | Builds per-judge, per-entry, per-school text and html, then one `notify()` per group. | Subjects below. Judge html links to `/user/judge/panels.mhtml`. Writes `change_log` rows. |
| `helpers/followers.js` | `getFollowers` (ids or raw emails of judges, entries, and their followers in a panel, section, round, or timeslot) and `getPairingFollowers` (`{judges, entries, schools}` buckets, `no_email = 0` throughout). | `getFollowers` only filters `no_email` on section share followers. `returnEmails` path has no opt-out check. |

Inbound routes classic uses: `POST /ext/mason/blast` (body straight into `notify`), `POST /ext/mason/section/:id/blastPairing`, `POST /ext/mason/round/:id/blast`, `POST /ext/share/sendShareFile`, `POST /ext/share/makeShareRooms`.

### indexcards (`tabroom/indexcards/api`)

Every sender goes through `services/notifications/notify.ts`, except the error handler, which mails `ERROR_DESTINATION` straight through `sendEmail` on purpose so a bug report still goes out when the queue is down. The legacy `helpers/mail.js` and `helpers/admin.js` were deleted on October 30, 2026 once share invites (`controllers/tab/round/share.js`) moved onto `notify()`. `helpers/blast.js` never existed here. No password, registration, or login mail exists in indexcards yet.

## 2. Email types

Columns: **Src** = C classic, M masoncards, I indexcards (I items are the ports of the M items unless noted). **Ch** = E email, I inbox message, P push. **Opt-out** = whether `no_email` is honored: yes, bypass (intentional account mail), leak (unintentional bypass).

### A. Accounts and auth (classic only; none ported yet)

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Password reset key | C | `user/login/forgot_send.mhtml:88-117` | User submits forgot form | Account person id | "Tabroom Password Reset <iforgot_N@www.tabroom.com>" | Your Tabroom.com Password Reset | html: 6-char key, link valid 15 min, IP, timestamp | E | bypass |
| 2 | Password changed | C | `user/login/passwd.mhtml:117-144`, `forgot_save.mhtml:119-144` | User changes or resets password | Target person id | account address | Your Tabroom.com password has been changed | html with URLs | E (+I on passwd) | bypass |
| 3 | Login throttle/ban | C | `user/login/login_save.mhtml:142-192` | Failed-login threshold | Account person | "Tabroom Accounts <account_N@...>" | Your Tabroom.com Password Reset (same as #1) | html | E | bypass |
| 4 | Email confirmation code | C | `funclib/email_confirm.mas:56-85` (callers: new_user_save, confirm, profile_save) | Signup or email change | New account person; sets `no_email=1` until confirmed | "Tabroom.com Confirmation <accounts_N@...>" / Reply-To "Tabroom Help <help@tabroom.com>" | Tabroom.com email confirmation | html, 6-char code | E | bypass |
| 5 | Email address changed | C | `user/login/profile_save.mhtml:85-117, 168-181` | Profile save | Same person id sent twice (old and new address intent) | "Tabroom.com Account <accounts_N@...>" | Your Tabroom.com email address has been changed | html | E | bypass |
| 6 | Name records changed | C | `user/login/name_check.mhtml:253-285` | Name change | Person | sender = person | Your Tabroom.com name records have changed | text | E I P | yes |
| 7 | Sender address verification | C | `register/emails/senders.mhtml:39-45` | Tourn adds a verified sender | Raw address, no person row | "Tabroom <noreply@www.tabroom.com>" | Tabroom.com email confirmation | text | E | n/a (raw) |
| 8 | Test notification | C | `user/login/test_notify.mhtml:24-31` | User clicks test | Self | "Tab Central <test_notify@www.tabroom.com>" | Tabroom Test Notification | text | E I P | yes |
| 9 | Admin userbot notices (site admin powers, ban, un-ban) | C | `user/admin/person_save.mhtml:97-102,176,227-232`, `person_switch.mhtml:46,61-66` | Admin action | Hardcoded ids 1, 25656 | "Tabroom Userbot <littlesnitch@www.tabroom.com>" | "Site admin powers", "Tabroom User Un-Banned by ..." | html | E I P | yes |
| 10 | Excessive account access | C | `funclib/nsda/advisor_access.mas:67-72` | Page view / membership sync | Hardcoded ids 1, 3, 25656, 911622 | "Tabroom Excessive Account Access <littlesnitch@...>" | Too Many Roles Pending | text | E I P | yes |
| 11 | Live updates registration | C | `index/tourn/updates/send_confirmation.mas:64-72` | Public signs up for live updates | Person | "<tourn name> <webname>_N@..." | Tabroom.com Live Updates Registration | text + url | E P | yes |

### B. Students, chapters, followers

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 12 | Follower notice: tournament signup | C | `user/student/signup_save.mhtml:242,337-343` | Student signs up | Followers (ids) | tourn | `<student> tournament signup` | text | E I P | yes |
| 13 | Entry dropped from signup sheet | C | `user/student/drop_entry.mhtml:47,69-74` | Student drops | send_email `array` | tourn | `Entry in <event abbr> dropped at <tourn>` | text | E | leak |
| 14 | Stopped following student | C | `user/student/follower_switch.mhtml:46,58-63` | Student removes follower | Raw email of removed follower | default | `You are no longer following <student> on Tabroom` | text | E | n/a (raw) |
| 15 | Now following student | C | `user/chapter/follow.mhtml:75,89-94` | Coach adds parent | Raw parent email | default | `You are now following <student> on Tabroom` | text | E | n/a (raw) |
| 16 | Added to team roster | C | `user/chapter/student_search.mhtml:101,106-112` | Coach adds student | Student person | default | `[TabRoom] Added to the <chapter> team roster` | text | E | bypass |
| 17 | NAUDL message to chapter | C | `user/chapter/save.mhtml:158,182-187` | Chapter save | One NAUDL contact | default | `<chapter> <naudl message>` | text | E | yes |
| 18 | Student claim request | C, I | C `user/student/claim.mhtml:43,59-65`; I `studentsController.ts:68-80,93-104` | Student requests access | Chapter admins with email, not opted out | Reply-To = requester | `[Tabroom] <email> requests access to competitor <name>` | text | E I P | yes |
| 19 | Judge claim request | C, I | C `user/judge/claim.mhtml:39,67-73`; I `judgesController.ts:108-121,311-322` | Judge requests access | Chapter admins | Reply-To = requester | `[Tabroom] <email> requests access to judge <name>` | text | E I P | yes |
| 20 | Student ballot blast | C | `setup/events/student_ballot_blast.mhtml:31,140-148` | Tab staff | Entries + coaches (ids) | tourn / Reply-To = sender | `<event abbr> <label>` | text | E I P | yes |

### C. Judges and hires

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 21 | Judge registered for tournament | C | `funclib/judge_reg_email.mas:31-70` (5 callers) | Coach or tab registers a judge | Judge person | tourn name + webname, or `from_email` / Reply-To = registrar | `You have been registered to judge <cat abbr> at <tourn>!` | text: dates, location, registrar, category `registration_email` setting | E | yes |
| 22 | Hire offer accepted (to school) | C | `user/enter/hire_confirm.mhtml:69,93`; `register/school/hire_confirm.mhtml:50,78` | Judge accepts | School contact | person | Your judge hire offer was accepted | text | E | yes |
| 23 | Hire rescinded (to judge) | C | `user/enter/hire_cancel.mhtml:68,84`; `register/school/hire_cancel.mhtml:52,68` | School cancels | Judge person | person | `<person> rescinded your hire` | text | E | yes |
| 24 | Hire rescinded (to school) | C | `user/judge/hire_cancel.mhtml:41,65`; `register/judge/hire_cancel.mhtml:28,49` | Judge cancels | School admin | person | `Judge <name> rescinded your hire` | text | E | yes |
| 25 | Hired judging changes | C | `register/school/hire_accept.mhtml:33,66-72` (`hire_requests_save.mhtml:124` is commented out) | Tab accepts hires | Schools | tourn | `Hired Judging Changes: <tourn>` | text | E | yes |
| 26 | Judge summoned / result ready | C | `user/judge/panel_summon.mhtml:69-76` | Judge action | Followers (ids) | tourn | `<room> Result Ready` | text | E I P | yes |
| 27 | Ballot training blast | C | `register/judge/blast_untrained.mhtml:40-47` | Tab staff | Untrained judges (ids) | tourn | Ballot Training | text from form | E I P | yes |
| 28 | Fine for missing judge | C | `panel/schemat/judge_rm.mhtml:181,259-265`; `judge_remove.mhtml:170,224-230`; `register/judge/bond_revoke.mhtml:89,107-113` | Tab removes judge | School or hire contacts (ids) | tourn | Fine levied for missing judge | html: amount, reason, tmoney link | E I P | yes |
| 29 | Judge pool message | C, M, I | C `panel/judge/jpool_blast.mhtml:57,68-76`; M `tab/jpool/blast.js:3-128`; I `tab/jpool/blast.js:8-113` | Tab staff | Judges in pool (or free judges when `free`) | `<tourn> <webname_N@www.tabroom.com>` / Reply-To = sender (C only) | `subject || "Message to <jpool> judges"` | text | E I P | yes |
| 30 | Released judge notice (free, standby) | M, I | `tab/timeslot/blast.js:158-274` and `:276-393` (standby variant unrouted in M) | Tab staff | One notify per judge: judge person + followers | `<tourn> <webname@www.tabroom.com>` | `Judge <first> <last> Released` | text: header + message | E I P | yes |

### D. Rounds, pairings, results, flips

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 31 | Pairing to judge | M, I | `helpers/pairing.js:474-486` (M), `:440,482-490` (I) | Round/section/timeslot blast, cron autoblast, strike cards, judge swap | `getPairingFollowers.judges`: judge person + judge followers | `<tourn> <webname_<seconds>@www.tabroom.com>`; no Reply-To; sender not recorded (change_log only) | `<first> <last> <eventAbbr> <round name>` | text + html: section, judges, entries, "Access Your Ballot" link; optional `append` | E I P | yes |
| 32 | Pairing to entry | M, I | `helpers/pairing.js:397-424` (M), `:363` (I) | same | entry students + entry followers | same | `<code> <round name> <eventAbbr>` | text + html | E I P | yes |
| 33 | Pairing to school | M, I | `helpers/pairing.js:431,535,563-571` (M), `:397` (I) | same | school followers | same | `<school> Round Assignments ` (trailing space) | text + html with ENTRIES and JUDGES sections | E I P | yes |
| 34 | Round free-text message | C(js), M, I | M `tab/round/blast.js:16-29`; I `:10-50`; C UI `panel/schemat/blast_message.mas` | Tab staff | `getFollowers(req.body)` with `flight`, `speaker`, `status`, `eventIds`, `recipients` (all/judges/entries), `noFollowers` | `<tourn> <webname_<seconds>@...>` | none, so "[TAB] Message from Tab" | text | E I P | yes (per person in emailNotify) |
| 35 | Section free-text message | C(js), M, I | M `tab/section/blast.js:7-58`; I `:10-56` | Tab staff | `getFollowers({sectionId, recipients})` | same | none | text | E I P | yes |
| 36 | Section pairing | C, M, I | M `tab/section/blast.js:61-103`, `ext/mason/blast.js:35-84`; I `:59-98`; C callers `flight_judge_save.mhtml:116-139`, `api/strike_card_process.mhtml:193-216` | Judge swap ("Judge swap X instead of Y"), strike cards completed | `getPairingFollowers` | same | #31-33 subjects | `append` only | E I P | yes |
| 37 | Timeslot free-text message | C(js), M, I | M `tab/timeslot/blast.js:10-85`; I `:15-88` | Tab staff | `getFollowers` limited to session's events | `<tourn> <webname@...>` (no suffix) | none | text | E I P | yes |
| 38 | Timeslot pairings | C(js), M, I | M `tab/timeslot/blast.js:88-153`; I `:90-150` | Tab staff | loops `blastRoundPairing` per round | same as #31 | #31-33 | #31-33 | E I P | yes |
| 39 | Scheduled pairing blast | C | `api/scheduled_blasts.mhtml:26-40` calls `panel/schemat/blast.mhtml` | Cron | as #31-33 | same | same | same | E I P | yes |
| 40 | Scheduled follower notice | C | `api/scheduled_blasts.mhtml:54-77` (syntax errors at :70, :73) | Cron | Event followers (ids) | tourn | `<event name> <round realname>` | text from blast `value_text` | E I P | yes |
| 41 | Coin flip status | C | `funclib/blast_flips.mas:164,193-223,302-310` (4 callers) | Flip | ids (raw contact emails built at :299, :312 but dropped) | `<tourn><webname>_<panel>_flips@...` | Coinflip status update | html + url `flip.mhtml` | E I P | yes |
| 42 | Flips done | C | `panel/schemat/flips.mhtml:746-753` | Tab staff | Followers (ids) | tourn | `<event abbr> <round> flips done` | text | E I P | yes |
| 43 | Strike cards released / strike card | C | `panel/schemat/strike_cards.mhtml:86,120-127,159-165` | Tab staff | ids | tourn | `<round> strike card released`; `Strike Card: <event> <round>` | text + url | E I P | yes |
| 44 | Ballot milestones: first ballot, changed ballot, last ballot | C | `funclib/round_done.mas:66-83,96-134,150-166` (7 callers) | Ballot save | Followers (ids) | `<tourn><webname>_<round id>_done@...` | `First ballot in <abbr>`; `<abbr> alert: Changed Ballot`; `Last ballot in <abbr>` | html + text | E I P | yes |
| 45 | Round results to followers | C | `funclib/blast_results.mas:54-101` | Publish panel | entry_follower emails + raw school follower emails, via `array` (MIME path) | `<tourn><webname>_<panel>_results@...` | `<round label> Result ` | text: winner + judge votes | E | leak (school followers) |
| 46 | Missing from room | C | `tabbing/status/blast_missing.mhtml:211-217` | Tab staff | ids | tourn | `Missing from <room>` | text | E I P | yes |
| 47 | Tabber/staff notice | C | `funclib/blast_tabbers.mas` | none (dead) | followers | tourn | `<event name> notice` | text | E I P | yes |
| 48 | Speech document share room invite | M, I | M `tab/round/share.js:18-100`; cron `auto/autoBlastPairings.js:116`. I `tab/round/share.js` now calls `notify()` by person id, email only, Reply-To `<phrase>@share.tabroom.com` | Autoblast for `auto_docshare` panels, or tab action | M: `getFollowers({panelId, noFollowers, returnEmails})` raw emails as BCC. I: the same people by id | M: none (MAIL_FROM); To `<phrase>@share.tabroom.com`; `share: true` transport. I: Reply-To the room address | `<tourn> <round label> (<phrase>) - Speech Documents` | text + html | E | M leak, I yes |
| 49 | Share file relay | M | `ext/share/sendShareFile.js:4-83` | share.tabroom.com posts a file | `getFollowers({sectionId, noFollowers, sectionFollowers, returnEmails})` | "Tabroom Share <share@share.tabroom.com>" / Reply-To `<phrase>@share.tabroom.com`; To noreply@share | same as #48 | same + base64 attachments | E | leak |

### E. Tournament composer, Nationals, registration

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 | Tournament email composer | C | `register/emails/send.mhtml` (email row :1141-1155; per-school :1244-1255; individuals :1277-1287) | Tab staff composes | Flags: `diodirs`, `everybody` (schools with active entries), `judge_short`, `money_short`, `tba`, `problems`. Per-school send to school contacts; individual send to judges, directors, admins, sender | `<tourn><webname>_<key>@...` / Reply-To = sender person or verified sender | from form | html only: `<p>School: name</p>` + content + unpaid balance + tmoney link; `append => 1`; `emailId` = the email row; `nosend` saves only | E I P | yes |
| 51 | Nationals registration issues | C | `register/emails/problem_emails.mas:44-45,201-209` | Composer `problems` flag | School contacts | Reply-To info@speechanddebate.org | `Nationals Registration Issues for <school>` | html | E I P | yes |
| 52 | Unregistered supplemental entries | C | `register/emails/unregged_supps.mas:14,91-100` | Composer | ids | Reply-To info@ | `Unregistered Supplemental Entries:<school>` | html | E I P | yes |
| 53 | Supplemental locations (team) | C | `register/emails/supp_team.mas:24,98-109` | Composer | ids | tourn | `Your School's Supplemental Locations: <school>` | text | E I P | yes |
| 54 | Supp location confirm | C | `user/enter/nats/supp_confirm.mhtml:36,70-79` | Coach confirms | ids | Reply-To = person | `Supp Locations: Team <label>` | html | E I P | yes |
| 55 | Nationals registration ready / LCQ posted | C | `tabbing/publish/register_nationals.mhtml:249-275` | NSDA staff publish | school contacts via `array` | `from_string "nsda"`, `nsda_reply_to` | `<school>'s registration to NSDA Nationals is ready!` / `<school>'s Last Chance Qualifiers posted!` | html, `no_footer` | E | leak |
| 56 | Nationals registration overdue | C | `register/data/fine_their_ass.mhtml:291-296` | NSDA staff | raw `all_emails` | "nsda" | Alert: Nationals Registration Overdue | text | E | n/a (raw) |
| 57 | School declined all Nationals entries | C | `user/enter/nats/permareject.mhtml:94,114-120` | Coach | admins via `array`, cc chair | person | `<school> has declined all entries to Nationals` | text | E | leak |
| 58 | Nationals entry reject / promotion | C | `funclib/promote_slot.mas:248-263` (3 callers) | Entry rejected or promoted | ids + cc | Reply-To info@ | Nationals Entry Reject/Promotion | text | E I P | yes |
| 59 | Waitlist accepted | C | `funclib/unwaitlist_entry.mas:47,87-96` (3 callers) | Tab admits | ids | tourn | `<event abbr> entry accepted from waitlist: <tourn>` | text, `noWeb` | E I | yes |
| 60 | No-show entry | C | `register/event/drop_forfeit.mhtml:30,53-58` | Tab drops | contacts via `array` | tourn | `No show entry: <entry>` | text | E | leak |
| 61 | Coach-to-school message | C | `user/enter/send_email.mhtml:110,119-126` | Coach | school contacts (ids) | Reply-To = coach | `Message about <tourn>` default | text | E I P | yes |
| 62 | Leg ballot notice | C | `register/event/leg_ballot_blast.mhtml:19,124-131` | Tab staff | entries + coaches (ids) | tourn | `<event abbr> <label>` | text | E I P | yes |
| 63 | PayPal receipt | M | `user/enter/acceptPayPal.js:37-50` | PayPal callback | payer email from payload (raw) | MAIL_FROM | `Tabroom.com payment receipt for <tourn>` | text | E | n/a (raw) |
| 64 | Authorize.net receipt | M | `user/enter/processAuthorizeNet.js:204-223` | Payment success | `orderData.person_email` (raw) | MAIL_FROM | same as #63 | text + amount + payment id | E | n/a (raw) |

### F. Circuit, NSDA office, reports, billing, ops

| # | Email type | Src | Where | Trigger | Recipients | From / Reply-To | Subject | Body | Ch | Opt-out |
|---|---|---|---|---|---|---|---|---|---|---|
| 65 | Circuit email | C | `user/circuit/email_send.mhtml:12,14-20,62-67` | Circuit admin composes | full members' chapter admins, or school admins of an entered tourn, raw emails | default | `[<circuit abbr>] <subject>` | text; writes `email` row | E | yes |
| 66 | Circuit tournament requested | C | `user/tourn/confirm.mhtml:34,70-80`; `setup/tourn/circuit_add.mhtml:49,80-86` | Tourn requests circuit | circuit admins | tourn / person | `<circuit abbr> Tournament Requested` | text + url approvals | E I P / E | yes |
| 67 | Dates changed, payment revoked | C | `setup/tourn/dates_save.mhtml:105-109` | Tourn changes dates | admin ids | tourn | Tournament dates changed, payment revoked | text | E I P | yes |
| 68 | NAUDL data post (classic) | C | `user/admin/naudl/salesforce_autopost.mhtml:532,545-552` | Admin runs | admin ids | default | Tabroom NAUDL data post | text | E I P | yes |
| 69 | NAUDL students sync report | M | `auto/naudl/students.js:165-200` | Cron 03:25 daily | `naudl_admin` persons | `naudldata@www.tabroom.com` | `Tabroom Students Record Post : SUCCESS|ERRORS` | text: Salesforce JSON | E I (`noWeb`) | yes |
| 70 | District tournament notices | C | `api/district_notices.mhtml:69,147-155,168-178` | Cron | tourn owners (`accounts`, `override`); summary raw to two staff addresses | "NSDA Office <info@speechanddebate.org>" | Upcoming District Tournament Notices | text, phone numbers, `no_footer` | E | bypass |
| 71 | Invoice repeat alert | C | `funclib/nsda/create_invoice.mas:304,319-335` | Invoice creation | hardcoded ids 1, 25656, 119870, 77835 | "Tabroom Billing <info@...>" | Invoice repeat alert.  Invoiced total exceeds requested total | text, `override`, `no_footer` | E | bypass |
| 72 | Invoice update ran | C | `api/update_invoices.mhtml:14-36` | disabled (`%doc`) | | | | | | |
| 73 | Day-before / day-after tournament reminders | C | `api/day_emails.mhtml:83-86,144-147,156-161` | Cron | tourn owner + contact persons | "Tabroom Reminders <help@tabroom.com>" | ` Your Tabroom Tournament: <name>` (leading space) | html from global `day_before`/`day_after` settings | E I P | yes |
| 74 | This Week in Tabroom / Next Month's Contacts | C | `api/this_weekend.mhtml:96-103,188-204` | Cron | six hardcoded staff addresses | "Tabroom <help@tabroom.com>" | | html + CSV attachment, direct MIME | E | n/a |
| 75 | TOC bid results | C | `tabbing/report/toc/post_bids.mhtml:547-557` | Tab staff | raw TOC address + person/contacts via `array` | tourn | `TOC Bid Results from <tourn>` | text + attachment, `no_footer` | E | leak |
| 76 | American Legion results | C | `tabbing/report/send_legion.mhtml:57-66` | Tab staff | raw emails | "oratory@legion.org" | American Legion Contest Results | text + attachment, `no_footer` | E | n/a |
| 77 | Auto backup of round | C | `funclib/auto_backups.mas:41-125` (5 callers) | Ballot milestones, schemat switch, manual, scheduled publish | `backup_followers` setting resolved to emails, via `array` | `<tourn> <webname>_<round id>_backups@...` | `TRBKP: <event> <round> Tabroom Backup <subject>` | text + JSON attachment | E | leak |
| 78 | Lock alerts (autoqueue, autoflip) | C | `api/auto_queue.mhtml:60-65,75-80`; `api/auto_flip.mhtml:50-55,65-70` | Cron lock stuck | ops ids | `problems@www.tabroom.com` | 10 MINUTE LOCK; LOCK ALERT ON AQ | text | E I P | yes |
| 79 | Autoqueue error | C | `api/auto_queue.mhtml:772-779`; `api/auto_flip.mhtml:264-270` | Cron error | errors@tabroom.com (raw, direct MIME) | | Autoqueue error | text | E | n/a |
| 80 | Bug tripped (classic) | C | `index/oh_crap.mhtml:234-240` | handler.pl error | errors@debatefail.com (direct MIME) | | `Bug tripped on <url_prefix>` | text | E | n/a |
| 81 | Bug tripped (Node) | M, I | M `helpers/error.js:36-79,92-155`; I `helpers/errors/errorHandler.js` | 500 handler, production only (I: also the admin mailtest route) | `config.ERROR_DESTINATION` | `error-handler@tabroom.com` | Indexcards Bug Tripped | text: stack, session, params | E. M via `adminBlast`; I straight through `sendEmail`, bypassing the queue | n/a |
| 82 | Cloud server added/removed | M, I | M `helpers/servers.js:545-586`; I `helpers/servers.js:530-565` | GLP route or `scaleServers` CLI | `system_administrator` persons | `<sender first last> <sender email>` (personal address exposed) | `Tabroom Cloud Change: <target> Machines Added|Removed` | text log; Slack via `emailInclude` | E I P | yes |
| 83 | Cloud reboot notice | M, I | M `controllers/glp/servers.js:202-237`; I `serverController.js:195-215` | GLP reboot | `system_administrator` persons | session user | `Tabroom Cloud Change: <label> Rebooted` | html log | E I P | yes |
| 84 | Autoscaler notices | M | `auto/autoScale.js:212-249` | Cron every 5 min | `system_administrator` persons (person 1 only unless enabled) | "Tabroom Autoscaler <autoscale@tabroom.com>" | `Cloud Scale Change: <subject>` | html alert; `noEmail` by default, email only in warning branches | I P (E sometimes) | yes |
| 85 | Slack / mail test | M, I | M `glp/testmails.js:15-32`; I `admin/mailtestController.js:12-25` | GET test route | person 1 | "Tabroom Testing <errors@tabroom.com>" | Slack Channel Message Test | text; Slack via `emailInclude` | E I P | yes |

## 3. Patterns a `blast()` needs to cover

Distinct shapes seen across the 85 types above:

1. **Person-id fan-out, one message per person** (the bulk: #6, 8-12, 18-20, 26-44, 46, 50-54, 58-62, 66-69, 73, 78, 82-85). Already what `notify()` does. Needs: `ids`, `subject`, `text` and/or `html`, `from`, `replyTo`, `sender`, `tourn`, `url`, `append`, `channels`.
2. **Grouped fan-out with a different body per group** (#31-33 pairing, #50 composer per school, #30 released judge per judge). One blast record, many bodies. Today masoncards calls `notify()` once per group and writes no `email` row at all; the composer is the only classic path that passes `emailId`.
3. **Account mail that bypasses opt-out** (#1-5, 7, 16, 70, 71). `ignoreNoEmail` plus no unsubscribe footer. `emailMessage` already handles the footer side.
4. **Raw addresses with no person row** (#7, 14, 15, 56, 63, 64, 74-76, 79-81, and `emailInclude` for Slack). `notify()` requires `ids`. The current `inputData.email: string[]` field exists but `prepNotify` ignores it, so this is the biggest gap.
5. **Attachments** (#49 base64 files, #74 CSV, #75-77 reports and JSON backups). `OutboundEmail.attachments` exists but nothing above `sendEmail` carries them.
6. **CC** (#57, #58, and `send_notify.cc`). Classic forwards `cc` to masoncards; masoncards `notify()` ignores it.
7. **Sender identity**: three From conventions. Tournament mail is `<tourn name> <webname_<nonce>@www.tabroom.com>`; system mail is a fixed mailbox (`help@`, `info@`, `accounts_N@`, `iforgot_N@`, `problems@`, `errors@`, `autoscale@`, `naudldata@`); person mail is `First Last <epoch@www.tabroom.com>` with Reply-To = person. `from_string "nsda"` is a fourth: NSDA name with `info_<epoch>@speechanddebate.org`. Only the composer and circuit email record `sender`/`sender_raw` on an `email` row.
8. **Subject conventions**: `[TAB] ` prefix is added by the send helpers, not callers, except #16, #18, #19 which hard-code `[Tabroom]` and #65 which uses `[<circuit abbr>]`. Default subject when none given is "Message from Tab" (M, I: "Message from Tabroom.com"). Several subjects carry stray leading or trailing spaces (#33, #45, #73).
9. **Footer conventions**: standard "you have an account, turn off in profile" footer; `no_footer` for reports and external recipients (#55, #70, #71, #75-77); admin footer for `adminBlast`.
10. **Channel flags**: classic sends `noWeb`, `noEmail`, `noInbox` (negative form); indexcards `notify()` takes positive `channels: {inbox, email, webpush}`. #59 and #69 want email + inbox without push; #84 wants push + inbox without email; account mail (#1-5) wants email only.
11. **Dry run / save without sending**: composer `nosend` (#50) writes the `email` row only.
12. **Where the `email` row is written**: only #50 and #65 today. Everything else has no blast record, so a sent pairing blast or round message has no row to show in an admin "sent mail" view.

## 4. Defects noted while reading (not fixed)

- classic `api/scheduled_blasts.mhtml:70,73`: syntax errors (`if ($follower_ids)) {`, missing comma).
- classic `funclib/blast_flips.mas:302-310`: raw contact emails are built and then dropped from the send.
- classic `funclib/auto_backups.mas:77`: `my $session => ...` fat comma.
- classic `register/judge/hire_requests_save.mhtml:124`: send commented out, page still says schools were notified.
- classic `login_save.mhtml:190`: throttle notice reuses the password-reset subject.
- classic `send_email.mas` `array`/`raw` and `send_notify.mas` MIME path never check `no_email` (list in section 2, "leak").
- masoncards and indexcards `tab/timeslot/blast.js:197,313` (M) / `:194,305` (I): `r2.timeslot = and round.timeslot` malformed SQL; totals read from unresolved promises.
- masoncards `tab/round/share.js`: `dispatch.result` on a Promise; `forEach(async)` not awaited. (Fixed in indexcards when share moved onto `notify()`.)
- masoncards `ext/share/sendShareFile.js:49`: returns without a response.
- masoncards `auto/autoScale.js:60`: `alert` read before its `let`.
- masoncards `helpers/blast.js:97-150`: `webBlast` ignores `no_email`.
- masoncards `helpers/error.js:88,153`: 500 body includes `process.env`.
- indexcards and masoncards `round/blast.js:18-19`, `section/blast.js:26-27`: `seconds.toString().substring(-5)` returns the whole string.
