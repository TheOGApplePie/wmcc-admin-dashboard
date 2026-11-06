# WhatsApp connector MVP

## Account pairing (implemented)

The Social Campaigns toolbar shows Add WhatsApp account before New post for users
with social.publish permission. A linked account instead shows Remove WhatsApp
account; unlinking remains available without publishing permission.

The modal starts pairing, displays the QR, polls every two seconds for up to two
minutes, and closes after the service reports connected and the CMS ownership row
exists. Closing stops polling; the sender still owns the pairing attempt's two-minute
expiry. No QR or Baileys credentials are stored in the CMS database.

Deploy migration 035_whatsapp_account_ownership.sql before pairing. It creates
whatsapp_accounts(user_id, whatsapp_jid, paired_at), unique on both identities,
and the exact claim_whatsapp_account(whatsapp_jid text) and
release_whatsapp_account() RPCs from the sender contract. Claims use social.publish;
release only requires the authenticated owner. The sender calls claim after the scan.
The CMS does not claim a phone number supplied by the browser.

Configure the server-only WHATSAPP_SERVICE_URL to the sender origin, for example
http://localhost:3001 in development. Requests go to /api/whatsapp/session:
POST starts pairing, GET polls, DELETE unlinks. Each request carries the current
user's Supabase access token as Authorization: Bearer; never use the cron token here.

POST returns raw QR text, either as a text/plain body, a JSON string, or a JSON
qr field. The adapter renders it locally as a QR image. GET polling expects JSON
with status and an optional qr (or qrCode) for QR updates. Failed responses use
status=failed and reason=account_claimed|user_has_other_account|claim_unavailable.
Connected must mean the sender successfully claimed ownership. Adapt these fields
to the real sender response if different. HTTP errors must be JSON; message is
displayed when supplied. Successful DELETE should mean local credentials were
cleared and ownership release was attempted, even if remote logout failed.

## Publisher approval and scheduled sending

Apply migration `036_social_post_publishers.sql` after 035. Posts have a separate
`publisher_user_id`, distinct from their creator and campaign assignee. Clicking
**Approve & schedule as me** records the authenticated approving user as publisher.
The existing `social.publish` checks remain enforced in server actions and Postgres.
WhatsApp approval requires the publisher to own a paired account. Drafts and
proposals have no publisher; scheduling them requires fresh approval. Existing
approved posts inherit their recorded `publication_consented_by` identity.

The cron claims this publisher ID and calls
`POST ${WHATSAPP_SERVICE_URL}/api/whatsapp/publish` with:

```json
{"userId":"publisher UUID","message":"Caption","mediaUrl":"optional approved poster URL","deliveryId":"post UUID"}
```

Authentication is `Authorization: Bearer <WHATSAPP_API_TOKEN>`. Configure the same
random server-only token in both services. Pairing continues to use the user's
Supabase token. `CRON_SECRET` is a separate credential used by GitHub Actions to call
the CMS cron routes. Follow [the scheduler cutover guide](social-cron-github.md). Never send either server token to the browser.

The sender requires `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to call
`get_whatsapp_publisher(p_user_id)`. This service-only RPC checks the user's current
active status, canonical `social.publish` permission, and paired account. The
sender also checks that the connected session's normalized JID matches that account.
The sender retains destination configuration; the CMS supplies no destination.

Success requires `success=true` and `message={id,status:"acknowledged"}`. HTTP 200
alone is insufficient. Acknowledgement confirms submission, not recipient delivery.
The sender currently accepts approved image-poster URLs only; CMS support for other
WhatsApp media does not imply sender support.

Existing CMS retries remain in place. No new retries or deduplication are added.
The CMS still sends `Idempotency-Key`, but the sender does not deduplicate it yet:
a timeout after submission can therefore result in a duplicate on a later retry.

## Deployment

1. Apply migration 036 with the worker paused.
2. Configure the shared `WHATSAPP_API_TOKEN` in the CMS and sender environments.
3. Configure the sender's service-role database credentials and deploy the sender.
4. Configure `WHATSAPP_SERVICE_URL` and `CRON_SECRET` in the CMS deployment.
5. Deploy the CMS, approve a WhatsApp post, and verify the publisher identity.
6. Enable `SOCIAL_DELIVERY_ENABLED=true` only when ready to process eligible posts
   across all configured platforms, including overdue posts.

Local secrets are generated in the CMS `.env.local`; the shared API token is also
installed in the sender `.env`. Production secrets must be configured separately.
