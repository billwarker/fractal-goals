<!--
version: 1.0
effective: 2026-08-25
-->

# Privacy Policy

This Privacy Policy explains what personal information Fractal Goals collects, why we
collect it, who we share it with, how long we keep it, and the choices and rights you
have over it.

We have written this in plain language on purpose. If anything here is unclear, email us
at [privacy@fractalgoals.com](mailto:privacy@fractalgoals.com) and we will explain it.

> **Fractal Goals is currently in private, invite-only beta.** The Service is under active
> development. Please read [Section 12 — Beta Service](#12-beta-service) before you rely on
> Fractal Goals to store anything you cannot afford to lose.

---

## 1. Who we are

Fractal Goals is operated by **[LEGAL ENTITY NAME]** ("Fractal Goals", "we", "us", "our"),
a company incorporated in Ontario, Canada.

| | |
|---|---|
| **Registered address** | [REGISTERED ADDRESS] |
| **Privacy contact** | [privacy@fractalgoals.com](mailto:privacy@fractalgoals.com) |
| **General support** | [support@fractalgoals.com](mailto:support@fractalgoals.com) |

For the purposes of the UK and EU General Data Protection Regulation ("GDPR"), we are the
**data controller** of the personal information described in this policy. For the purposes
of Canadian privacy law, we are the organization responsible for the personal information
under our control.

---

## 2. Information we collect

We collect only what we need to operate the Service. We have deliberately designed Fractal
Goals to hold as little personal information as possible.

### 2.1 Account information

When you create an account, we store:

- your **username**
- your **email address**
- a **cryptographic hash of your password** — we never store, log, or have any means of
  reading your actual password
- your **membership tier** and any account-specific resource limits
- your **account preferences** — interface settings such as theme, timezone selection, and
  goal display colours
- **security metadata** — the time of your last sign-in, a count of consecutive failed
  sign-in attempts, and a lockout expiry timestamp if your account has been temporarily
  locked after repeated failed attempts

### 2.2 Content you create

Fractal Goals is a tool for recording your goals and the work you do toward them. Everything
you enter is stored so we can show it back to you:

- goals, sub-goals, and the hierarchical structure connecting them
- sessions, activities, activity groups, and session templates
- metrics, targets, and recorded values
- programs, blocks, and scheduled days
- **free-text notes** and descriptions

This content is yours. It is visible only to you. See
[Section 4 — Who can see your content](#4-who-can-see-your-content).

### 2.3 Product usage information

To understand which parts of the Service are used and where people get stuck, we record a
deliberately narrow set of usage events. **We record only these six event types and nothing
else:**

`page_view` · `settings_opened` · `onboarding_started` ·
`onboarding_step_completed` · `onboarding_completed` · `onboarding_dismissed`

Anything not on this list is rejected by our servers rather than stored. Two further
safeguards apply:

- **Page addresses are de-identified in your browser before they are sent to us.** Identifiers
  in a page address are replaced with generic placeholders, so we can see that a goals page
  was viewed without recording which goal it was.
- **We honour the Do Not Track browser setting.** If your browser sends a Do Not Track signal,
  no usage events are collected from you at all.

Usage events are only collected while you are signed in.

### 2.4 Activity history within your account

We keep a record of significant actions taken within each of your goal fractals — for example
that a goal was created, edited, or completed. This history is what powers the activity log
you can view inside the app. It is scoped to your own fractals and is visible to you.

### 2.5 Email delivery records

When we send you an email, we record that we sent it, which template was used, and whether
it was delivered, bounced, or was opened. **We do not store the content of emails we send you.**

Our email provider sends us delivery notifications which we store as received; these
notifications contain your email address.

### 2.6 Beta signup information

If you request access through our public beta form, we store your **email address** and, if
you choose to provide them, your **name** and your free-text answer to what goal you are
trying to achieve. These records are kept separately from user accounts.

### 2.7 What we do not collect

We want to be specific about this, because it is unusual:

- **We do not store your IP address in our database.**
- **We do not store your browser user-agent string in our database.**
- We do not ask for your date of birth, phone number, physical address, or real name.
- We do not use advertising trackers, marketing pixels, or third-party analytics scripts.
- We do not collect payment card information (see
  [Section 11 — Payments](#11-payments)).

Your IP address is necessarily visible to our hosting provider as part of delivering any
internet service, and appears in transient infrastructure logs used for security and abuse
prevention. It is not written to our application database and is not linked to your account.

---

## 3. Why we use your information, and our lawful basis

Under GDPR we must identify a lawful basis for each purpose. This table does that, and is a
useful plain summary regardless of where you live.

| Purpose | Information used | Lawful basis (GDPR) |
|---|---|---|
| Providing the Service — storing and displaying your goals, sessions, and notes | Account information, content you create | Performance of a contract |
| Authenticating you and keeping your account secure | Account information, security metadata | Performance of a contract; legitimate interests |
| Preventing abuse, fraud, and automated attacks | Security metadata, transient infrastructure logs | Legitimate interests |
| Sending transactional and security emails | Email address, delivery records | Performance of a contract; legitimate interests |
| Understanding product usage to improve the Service | Product usage information | Legitimate interests |
| Managing private beta access | Beta signup information | Consent; legitimate interests |
| Meeting legal obligations | As required | Legal obligation |

Where we rely on legitimate interests, we have considered whether those interests are
overridden by your rights, and have limited what we collect accordingly. You may object to
processing based on legitimate interests — see
[Section 9 — Your rights](#9-your-rights).

**We have never sold personal information, and we do not share it for advertising.**

---

## 4. Who can see your content

Your goals, sessions, notes, and metrics are private to your account. They are not visible to
other users, and the Service has no sharing, publishing, or social features that would expose
them.

**Administrators.** A small number of staff administrators can see account-level information
to operate the Service and provide support. When necessary for support, security, or incident
investigation, an administrator can enter an explicitly scoped read-only or read-write support
mode for your account. Each support-mode request records the administrator, target account,
access mode, route, and time in an internal audit log. Administrators also hold restricted
account-management powers, including issuing a temporary password for account recovery.

Like any organisation, we can access data stored in our own database through direct
infrastructure access. We do this only when necessary to operate, debug, secure, or restore
the Service, or where we are legally required to.

**The public landing page.** Our marketing site shows example goal structures. These examples
come exclusively from **accounts we ourselves own and control**. Your content is never
featured publicly without your prior express consent.

---

## 5. Service providers

We use a small number of third-party providers to run Fractal Goals. Each processes personal
information only on our instructions.

| Provider | What they do | Where |
|---|---|---|
| **Google Cloud Platform** | Hosts the application and its infrastructure | United States (`us-east1`) |
| **Supabase** | Provides the managed PostgreSQL database storing your account and content | [CONFIRM REGION] |
| **Resend** | Delivers transactional and security emails | United States |
| **Google BigQuery** | Internal analytics warehouse (see [Section 6](#6-internal-analytics)) | [CONFIRM DATASET LOCATION] |

We have data processing agreements in place with these providers. We do not use any other
processors, and we will update this table before adding one.

### International transfers

Fractal Goals is operated from Canada and hosted in the United States. If you are located in
the United Kingdom, the European Economic Area, or elsewhere, **your personal information will
be transferred to and processed in the United States and Canada.**

Canada is recognised by the European Commission as providing an adequate level of data
protection for commercial organisations. For transfers to the United States, we rely on the
Standard Contractual Clauses incorporated into our agreements with the providers above.

---

## 6. Internal analytics

We copy certain records into a Google BigQuery dataset so we can analyse how the Service is
used in aggregate. We are disclosing this specifically because it involves your account
details leaving the main application database.

**What is copied:** your account identifier, username, email address, role, account status,
membership tier, account creation date, and last sign-in date; together with product usage
events, activity history, and email delivery records.

**What is not copied:** your goals, sessions, notes, metrics, targets, or programs. **The
content you create is not exported to the analytics warehouse.**

**Why:** to answer product questions such as how many people complete onboarding, or which
features go unused. It is used only by us, only in aggregate, and **never sold, shared with
advertisers, or used to build profiles for marketing.**

**Retention:** analytics records are automatically deleted after **24 months**.

---

## 7. Cookies

Fractal Goals sets **exactly two cookies**, both strictly necessary to operate the Service.

| Cookie | Purpose | Accessible to scripts? | Lifetime |
|---|---|---|---|
| `fractal_auth_token` | Keeps you signed in | No — protected from script access | Session, or 10 days if "remember me" is selected |
| `fractal_csrf_token` | Protects against cross-site request forgery | Yes — by necessity of the security design | Same as above |

Both are first-party, marked `Secure`, and set to `SameSite=Strict` in production, meaning
they are not sent when you arrive from another site.

If you do not select "remember this device" at sign-in, both cookies are **session cookies**
that your browser discards when you close it. If you do select it, they last **10 days**.

**We set no advertising, tracking, profiling, or third-party cookies.** Because both cookies
are strictly necessary to provide a service you have requested, no cookie consent banner is
required. You can delete them through your browser at any time; doing so signs you out.

---

## 8. How long we keep information

| Information | Retention period |
|---|---|
| Account and the content you create | For as long as your account exists, then deleted within 30 days of an erasure request |
| Product usage events | Up to 180 days |
| Internal analytics records | 24 months |
| Activity history within your fractals | For as long as your account exists, or until you clear it |
| Password reset tokens | Expire after 60 minutes; records purged after 30 days |
| Email delivery and notification records | 24 months |
| Administrative security and support-access audit records | 24 months |
| Beta signup requests | Until invited or dismissed, then 12 months |

Backups may retain information for a limited additional period after deletion from live
systems, until those backups are rotated out in the ordinary course.

We may retain limited information for longer where we are legally required to, or where it is
necessary to establish, exercise, or defend legal claims.

---

## 9. Your rights

You have the following rights over your personal information. These are set out in the GDPR
and UK GDPR, and comparable rights exist under Canadian and US state privacy laws.

- **Access** — obtain a copy of the personal information we hold about you.
- **Portability** — receive your information in a structured, machine-readable format.
- **Rectification** — correct information that is inaccurate or incomplete.
- **Erasure** — have your personal information deleted.
- **Restriction** — ask us to limit how we use your information.
- **Objection** — object to processing we carry out on the basis of legitimate interests,
  including our product analytics.
- **Withdraw consent** — where we rely on consent, withdraw it at any time.

### How to exercise them

**Access and portability.** Go to **Settings → Account → Download my data** for a portable,
machine-readable export of your core account content. For a broader access request concerning
operational records, email us using the address below.

**Correction.** Update your username, email, and preferences directly in **Settings → Account**.

**Erasure.** Go to **Settings → Account → Delete my account**. Your account remains accessible
during a 30-day grace period and is then scheduled for permanent deletion. You can cancel in
Account Settings during that period. After the grace period, deletion is irreversible from
the live Service. Limited records may remain where required for security, legal compliance,
fraud prevention, or backup integrity, subject to the retention periods in this policy.

**Anything else.** Email [privacy@fractalgoals.com](mailto:privacy@fractalgoals.com). **We
respond to all requests within 30 days.** We may ask you to verify your identity first. These
rights are free to exercise.

### Complaints

If you believe we have mishandled your information, please contact us first. You also have the
right to complain to a supervisory authority:

- **UK** — Information Commissioner's Office, [ico.org.uk](https://ico.org.uk)
- **EEA** — the supervisory authority in your country of residence
- **Canada** — Office of the Privacy Commissioner, [priv.gc.ca](https://priv.gc.ca)

---

## 10. Notice for United States residents

This section applies if you live in California or another US state with a comprehensive
privacy law.

**We do not sell your personal information, and we do not share it for cross-context
behavioural advertising.** We have never done either. We do not use your information to build
advertising profiles, and we have no advertising relationships of any kind.

In the twelve months preceding the effective date of this policy, we have collected the
categories of information described in [Section 2](#2-information-we-collect): identifiers
(username, email), account and commercial information (membership tier), internet activity
(the six usage events), and user-generated content. Sources, purposes, and disclosures are
described in Sections 2, 3, and 5.

You have the right to know what we collect, to request deletion, to request correction, and
not to be discriminated against for exercising these rights. We do not offer financial
incentives for personal information. Exercise these rights through the controls in
[Section 9](#9-your-rights) or by emailing
[privacy@fractalgoals.com](mailto:privacy@fractalgoals.com). Authorised agents may submit
requests with written proof of authorisation.

**We do not knowingly sell or share the personal information of consumers under 16.**

---

## 11. Payments

**Fractal Goals is currently free.** There is no payment processing, no billing system, and
**we do not collect or store payment card details, bank information, or billing addresses.**

If we introduce paid plans, payments will be handled by a specialist payment processor that
receives your payment details directly. We will update this policy and notify you before any
such change takes effect.

---

## 12. Beta service

Fractal Goals is in **private, invite-only beta**. The Service is under active development,
which has real privacy and reliability consequences you should understand:

- **Data loss is possible.** Please keep your own copies of anything important. You can export
  everything at any time from **Settings → Account → Download my data**.
- Features, data structures, and this policy may change as the product develops.
- We do not hold external security certifications such as SOC 2 or ISO 27001.

---

## 13. Security

We protect your information with measures appropriate to a service of this size:

- Passwords are stored only as salted cryptographic hashes and are never recoverable.
- Password reset tokens are stored only as hashes, expire after 60 minutes, and are single-use.
- Authentication cookies are protected from script access, restricted to secure connections,
  and set to `SameSite=Strict`.
- All state-changing requests carry cross-site request forgery protection.
- Repeated failed sign-in attempts trigger a temporary account lockout.
- Every request for stored content is checked against the account that owns it.
- Sensitive endpoints are rate-limited.
- Administrative actions are recorded in an internal audit log.

No system is perfectly secure, and we cannot guarantee absolute security. If we become aware
of a breach affecting your personal information, we will notify you and the relevant
regulators as required by law.

---

## 14. Sensitive information

Fractal Goals is a general-purpose goal tracking tool. It is **not designed, secured, or
certified to hold special category data** as defined by GDPR.

**Please do not enter health conditions, medical history, biometric data, genetic data,
information about your racial or ethnic origin, political opinions, religious beliefs, trade
union membership, sex life, or sexual orientation into your notes or goal descriptions.**

If you use Fractal Goals to track training or fitness, record neutral performance measurements
rather than medical details.

---

## 15. Children

Fractal Goals is **not intended for anyone under 16**, and you must be at least 16 to create
an account. We do not knowingly collect personal information from children under 16. If we
learn that we have, we will delete the account and its information promptly. If you believe a
child has provided us with personal information, email
[privacy@fractalgoals.com](mailto:privacy@fractalgoals.com).

---

## 16. Changes to this policy

We may update this policy as the Service develops. When we do, we will revise the version
number and effective date above.

- For **minor changes** — clarifications and corrections — we update the policy and its date.
- For **material changes** to what we collect, why, or who we share it with, we will notify
  you in the app or by email **before the change takes effect**, and where required we will
  ask you to review and accept the updated policy.

The current version is always available at
[fractalgoals.com/privacy](https://fractalgoals.com/privacy) and from the legal links in
Settings.

---

## 17. Contact us

| | |
|---|---|
| **Privacy enquiries and rights requests** | [privacy@fractalgoals.com](mailto:privacy@fractalgoals.com) |
| **General support** | [support@fractalgoals.com](mailto:support@fractalgoals.com) |
| **Postal address** | [LEGAL ENTITY NAME]<br />[REGISTERED ADDRESS] |

We respond to privacy requests within 30 days.
