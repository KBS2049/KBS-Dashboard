# KBS Studio multi-user setup

This branch keeps production `main` untouched until the multi-user version is configured and tested.

## Vercel environment variables

Keep the existing YouTube variables already used by the app:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- existing Redis/KV variables used by the current project

Add:

- `ADMIN_USERNAME` - your KBS Studio owner login, for example `kbsadmin`
- `ADMIN_PASSWORD` - a strong password of at least 12 characters
- `SESSION_SECRET` - a long random secret, at least 32 random characters

Use the Production environment for the live app. Vercel requires a redeploy after changing environment variables.

## First login

The first successful request to `/api/auth` creates the admin account from `ADMIN_USERNAME` and `ADMIN_PASSWORD` and migrates channels from the old single-user store to the admin account. Existing production `main` is not changed by this branch.

## Adding friends

The owner logs in, opens **Users** in the Admin section, creates a username/password for a friend, and gives that login to the friend.

The friend then:

1. Opens the same dashboard URL.
2. Logs in.
3. Presses **Add channel**.
4. Completes Google's YouTube OAuth consent screen.

No YouTube password, channel ID, access token, or refresh token is entered manually.

## Isolation

Each channel is stored with an `ownerId`. Normal users only receive channels from their own user namespace. Analytics and video endpoints also verify the channel owner server-side. Admin-only endpoints are protected independently of the UI, so hiding an Admin button is not the security boundary.

The admin starts in their own channel list. Friend channels are not mixed into the admin's normal channel selector. To inspect a friend's dashboard, the admin opens that user from **Admin > Users**. The user does not receive the Admin section or a view-all-channels control.

## YouTube data

The dashboard requests the available channel/video reports already implemented in the project directly from the YouTube Data and YouTube Analytics APIs and uses `Cache-Control: no-store` for dashboard requests. A Refresh action requests the latest available API data again.

YouTube Analytics reporting is not guaranteed to be instant for the newest activity. The API can return data only through the latest reporting period currently available when queried, so the dashboard must not fabricate real-time values.
