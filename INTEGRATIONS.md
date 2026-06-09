# Social Posts — Phase 2 Integration Guide

Phase 1 is a fully manual workflow: admins compose posts, schedule them, and mark them
published by hand. Phase 2 replaces `publishSocialPost()` in `actions/socialPosts.ts` with
real API calls to the platforms below.

---

## Seam: `publishSocialPost()` in `actions/socialPosts.ts`

Replace the Phase 1 stub body with calls to the platform publishers. Suggested structure:

```typescript
// actions/socialPosts.ts
export const publishSocialPost = actionClient
  .inputSchema(PublishSocialPostZod)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const { data: post } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", parsedInput.id)
      .single();

    const results = await Promise.allSettled(
      post.channels.map((ch) => publishToChannel(ch, post)),
    );

    const allOk = results.every((r) => r.status === "fulfilled");
    const newStatus = allOk ? "published" : "failed";

    await supabase
      .from("social_posts")
      .update({ status: newStatus })
      .eq("id", parsedInput.id);
  });

async function publishToChannel(channel: SocialChannel, post: SocialPost) {
  switch (channel) {
    case "ig_feed":  return publishIgFeed(post);
    case "ig_story": return publishIgStory(post);
    case "whatsapp": return publishWhatsApp(post);
  }
}
```

---

## Instagram Feed + Story (Instagram Graph API)

### What you need

| Requirement | Detail |
|---|---|
| Meta App | Create at [developers.facebook.com](https://developers.facebook.com) |
| Business verification | App must be in Live mode and Business-verified |
| Facebook Page | WMCC must have a Facebook Page |
| Instagram Business Account | IG account linked to the Facebook Page |
| Permission | `instagram_content_publish`, `pages_read_engagement`, `business_management` |
| Token | Long-lived Page Access Token (60-day expiry; use token refresh on cron) |

### Environment variables to add

```env
META_APP_ID=
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=       # long-lived, refreshed by a cron job
INSTAGRAM_BUSINESS_ACCOUNT_ID=
```

### Publishing flow (Feed post — two-step)

```typescript
// Step 1: Create a media container
const containerRes = await fetch(
  `https://graph.facebook.com/v19.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
  {
    method: "POST",
    body: new URLSearchParams({
      image_url: post.media_url,           // must be publicly accessible
      caption: post.caption,
      access_token: process.env.META_PAGE_ACCESS_TOKEN,
    }),
  },
);
const { id: creationId } = await containerRes.json();

// Step 2: Publish the container
await fetch(
  `https://graph.facebook.com/v19.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`,
  {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: process.env.META_PAGE_ACCESS_TOKEN,
    }),
  },
);
```

### Story post

Same two-step flow, but add `media_type=STORIES` to the container creation call.
Stories have a 24-hour life and additional constraints (full-bleed 9:16 media required).

### Facebook cross-post

When `cross_post_facebook` is `true` (a field that exists on `scheduled_posts`; add it to
`social_posts` if needed), also call the Facebook Page post endpoint:

```typescript
await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/photos`, {
  method: "POST",
  body: new URLSearchParams({
    url: post.media_url,
    message: post.caption,
    access_token: process.env.META_PAGE_ACCESS_TOKEN,
  }),
});
```

---

## WhatsApp (WhatsApp Business Cloud API)

**This is the heaviest integration lift.** WhatsApp broadcasts require:

1. A verified **WhatsApp Business Account (WABA)** via Meta Business Manager.
2. A **WhatsApp Business Phone Number** (can be a virtual number).
3. **Pre-approved Message Templates** — all broadcast messages must use an approved template.
   Free-form text can only be sent in reply to a user who has messaged first (within 24 hours).
4. An **opt-in recipient list** — contacts who have explicitly agreed to receive broadcasts.

### Environment variables to add

```env
WHATSAPP_PHONE_NUMBER_ID=     # from Meta Business Manager
WHATSAPP_ACCESS_TOKEN=        # permanent system user token
```

### Sending a template message

```typescript
await fetch(
  `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientPhone,           // E.164 format, e.g. "+12899001234"
      type: "template",
      template: {
        name: "wmcc_announcement",  // pre-approved template name
        language: { code: "en_US" },
        components: [
          { type: "body", parameters: [{ type: "text", text: post.caption }] },
        ],
      },
    }),
  },
);
```

### Data model additions needed for WhatsApp

- A `whatsapp_recipients` table (phone number, opt-in date, opt-out date).
- A `whatsapp_templates` table mapping post types to approved template names.
- Add `whatsapp_template_name` column to `social_posts` or manage via UI at send time.

---

## Cron-triggered publishing (optional)

To auto-publish at `scheduled_at` without manual "Mark Sent":

1. Add a Vercel cron job (e.g. every 5 min) that queries
   `social_posts WHERE status = 'scheduled' AND scheduled_at <= NOW()`.
2. For each post, call `publishToChannel()` and update status to `published` or `failed`.
3. Add `CRON_SECRET` verification (already in the cron handler pattern in this repo).

The `vercel.json` cron routes at `app/api/cron/` already show this pattern.

---

## Rate limiting

The spec lists Upstash Redis for rate limiting `schedulePost`/`publishPost`. The package is
not currently installed. To add it:

```bash
npm install @upstash/redis @upstash/ratelimit
```

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

```typescript
// In scheduleSocialPost / publishSocialPost action:
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});

const { success } = await ratelimit.limit(user.id);
if (!success) {
  return { error: "Too many requests.", status: ResponseCodes.TOO_MANY_REQUESTS, ... };
}
```
