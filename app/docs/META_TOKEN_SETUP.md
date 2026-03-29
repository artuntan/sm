# Meta Token Setup Guide

## Overview

This app uses the **Meta Instagram Graph API** (Business Discovery endpoint) to fetch Reel data for public professional Instagram accounts. It requires a valid Meta access token with the right permissions.

## Token Types

| Token Type | Expiry | Recommended |
|---|---|---|
| Graph API Explorer token | 1-2 hours | ❌ Testing only |
| Long-lived user token | 60 days | ❌ Requires refresh |
| **System User Token** | **Never** | **✅ Production** |

## Setting Up a System User Token (Recommended)

### Prerequisites
- A Facebook Business Manager account
- A Meta Developer App (type: Business)
- An Instagram Professional account (Business or Creator) linked to a Facebook Page
- Completed App Review for required permissions

### Step 1: Create a System User

1. Go to [Meta Business Settings](https://business.facebook.com/settings)
2. Navigate to **Users → System Users**
3. Click **"Add"** to create a new system user
4. Set name: `ig-benchmark-api` (or your preference)
5. Set role: **Admin**

### Step 2: Assign Assets

1. Select the newly created system user
2. Click **"Add Assets"**
3. Assign your **Meta App** → Grant **Full Control**
4. Assign your **Facebook Page** (the one linked to your Instagram Professional account) → Grant **Full Control**

### Step 3: Generate the Token

1. From the system user page, click **"Generate New Token"**
2. Select your Meta App from the dropdown
3. Enable these permissions/scopes:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
4. Click **"Generate Token"**
5. **Copy the token immediately** — it is shown only once

### Step 4: Configure the App

Update your `.env.local`:

```env
META_ACCESS_TOKEN=<paste_system_user_token_here>
META_IG_USER_ID=<your_instagram_user_id>
META_GRAPH_API_VERSION=v23.0
```

### Step 5: Verify

Start the dev server and visit:
```
GET http://localhost:3000/api/token-health
```

You should see:
```json
{
  "valid": true,
  "tokenType": "system_user",
  "neverExpires": true,
  "recommendations": ["✅ System User Token detected — this token does not expire."]
}
```

## Finding Your Instagram User ID

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app and generate a token with `pages_show_list`
3. Run: `GET /me/accounts` → find your Page ID
4. Run: `GET /{page_id}?fields=instagram_business_account`
5. The `instagram_business_account.id` is your `META_IG_USER_ID`

## Required Permissions (App Review)

For production use, your Meta App must have these permissions approved through App Review:

| Permission | Purpose |
|---|---|
| `instagram_basic` | Access Instagram Professional account data |
| `instagram_manage_insights` | Access view counts and engagement metrics |
| `pages_show_list` | List pages managed by the business |
| `pages_read_engagement` | Read page engagement data |

## What Can Invalidate a System User Token

Even though System User Tokens don't expire on a time schedule, they can be invalidated by:

- Deleting the system user from Business Manager
- Deleting or deactivating the Meta App
- Revoking asset permissions from the system user
- Meta suspending the app or business for policy violations
- Changing the app secret (in some cases)

## Troubleshooting

### Token shows as expired or invalid
- Check `/api/token-health` for details
- If type is `user` instead of `system_user`, you're using a Graph API Explorer token
- Generate a proper System User Token following the steps above

### Error code 190 (Invalid token)
- The token has expired or been revoked
- Generate a new System User Token

### Error code 10 (Permission denied)
- The app doesn't have the required permissions
- Complete App Review for the required scopes
- Ensure the System User has the correct assets assigned

### Error code 100 subcode 33 (Not found)
- The target Instagram account is not a Professional account
- Or the account is private / not discoverable via Business Discovery
