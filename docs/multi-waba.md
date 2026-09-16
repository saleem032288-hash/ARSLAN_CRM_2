# Several WhatsApp Business Accounts on one wacrm deployment

Issue #500 asked how one deployment can serve accounts whose numbers
belong to different WhatsApp Business Accounts (WABAs). The answer has
evolved since then: **each wacrm connection now carries its own Meta
App ID and App Secret** (stored AES-256-GCM-encrypted on the
`whatsapp_config` row), so no env edit or redeploy is needed when
connecting a WhatsApp account under a different Meta App. The two
env variables below are kept as an optional fallback for deployments
that predate migration 043.

## What is per account and what is per deployment

| Value | Lives in | Scope |
| --- | --- | --- |
| Phone Number ID, WABA ID, access token, verify token, two-step PIN | `whatsapp_config` (one row per wacrm account, token encrypted) | per account |
| Meta App ID, Meta App Secret | `whatsapp_config.app_id`, `whatsapp_config.app_secret` (encrypted) | **per account** |
| Webhook callback URL | your Meta App → WhatsApp → Configuration | per Meta App |
| `META_APP_SECRET` | server environment (optional fallback) | per deployment — may list several |
| `META_APP_ID` | server environment (optional fallback) | per deployment — single value |

Meta signs every webhook delivery with the secret of the App the WABA
is subscribed to. wacrm loads the non-null `app_secret` values from
every `whatsapp_config` row, and checks the incoming signature against
the union. If the row has no secret stored, the env `META_APP_SECRET`
(same comma-separated list as before) is used as a fallback. A delivery
is accepted when the signature matches **any** secret; every comparison
is constant-time. An empty or comma-only fallback value still fails
closed — only per-connection secrets are accepted.

## Setup A — many accounts, one Meta App, many WABAs (works out of the box)

This is the normal case for an agency or a company with several
brands. Nothing to configure beyond a single-tenant install.

1. Create one Meta App and add the WhatsApp product. Under
   **WhatsApp → Configuration** set the callback URL to
   `https://<your host>/api/whatsapp/webhook` and subscribe to the
   `messages` field.
2. For each WABA, make sure the Business portfolio that owns it has
   access to the app (Business Settings → Accounts → WhatsApp accounts →
   Assigned assets, or add the WABA through the app's WhatsApp product).
3. Each wacrm account opens Settings → WhatsApp connection and enters:
   - **Phone Number ID** and **WABA ID**
   - A System User access token that can manage *that* WABA
   - **Meta App ID** (numeric id from Meta for Developers → App
     Settings → Basic)
   - **Meta App Secret** (from the same page)
   - A verify token and, for production numbers, the two-step PIN.

On save, wacrm verifies the number with the token, registers it
(`POST /{phone_number_id}/register`, PIN required) and subscribes the
WABA to the app (`POST /{waba_id}/subscribed_apps`).
From then on Meta delivers every WABA's events to the one callback URL
and wacrm fans them out by `phone_number_id`.

Constraints:

* One phone number can be connected to one wacrm account only — the
  route refuses a `phone_number_id` already claimed by another account.
* The **verify token** typed into the Meta App's webhook settings must
  equal the verify token saved by at least one wacrm account; the
  handshake (`GET /api/whatsapp/webhook`) accepts any account's token.
  Using the same string in every account keeps this simple.

## Setup B — WABAs under different Meta Apps

With per-connection credentials, each connection stores its own App
Secret. No comma-separated env list is needed when the UI fields are
filled in.

1. In **every** Meta App, set the same callback URL
   (`https://<your host>/api/whatsapp/webhook`) and subscribe to
   `messages`. Use a verify token that at least one wacrm account has
   saved (see the note above).
2. Each wacrm account enters its own **Meta App ID** and **Meta App
   Secret** on the connection form. No shared env variable is needed.
3. Save each account — the save subscribes the WABA to *that* account's
   app (the one the token belongs to).

### Legacy env fallback

Deployments that predate migration 043 may still have a comma-separated
`META_APP_SECRET` in `.env.local`. This continues to work: any
connection whose `app_secret` is empty falls back to the env list.
To migrate to per-connection secrets, open each connection, enter its
App ID and Secret, and save. The env variable can then be removed.

Rotating a per-connection secret: enter the new secret on the
connection form and save. There is no overlap period — the old secret
is overwritten immediately.

## Setup C — per-account Meta App ID (now supported)

`META_APP_ID` is used for exactly one thing: Meta's Resumable Upload
when a message template has an **image header** (the header sample must
be an app-scoped upload handle, not a URL). Prior to migration 043 this
was a single deployment-wide value, which broke when accounts lived
under different apps.

The connection form now carries a **Meta App ID** field. Image-header
template uploads use the per-connection value, so accounts under
different Meta Apps can each submit image-header templates without
workarounds.

If the per-connection `app_id` is empty, the env `META_APP_ID` is used
as a fallback (same behavior as before migration 043). Text-only
templates, sending, receiving and everything else are unaffected
regardless.

## Checking a multi-WABA deployment

* Settings → WhatsApp connection → **Verify with Meta** runs, per
  account, the per-check diagnostic (`phone_metadata_ok`,
  `waba_subscribed_to_app`, `locally_marked_registered`).
  `waba_subscribed_to_app` false means the save never managed to
  subscribe the WABA to its app — re-enter the token and save again.
* A webhook delivery that is rejected with 401 means no configured
  secret produced its signature — the WABA is subscribed to an app
  whose secret is missing from both the per-connection App Secret field
  and the env `META_APP_SECRET` fallback.
