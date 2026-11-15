# Admin moderation setup

This guide sets up the moderation controls in `admin/subadmin.html`:

- Temporarily or permanently ban a student account, then lift the ban later.
- Permanently delete a confession using its share link or UUID, including its Cloudinary image/video.
- Review new confession submissions. Admins and subadmins can accept or decline them from **Confession requests**.
- Reject E-Library uploads and remove both their Firestore record and Cloudinary file.

Account bans and the **Moderation** panel require `academic_staff.role = admin`. Confession review is available to both `admin` and `subadmin` roles.

## 1. Confirm the admin account

The account must already exist in Supabase Auth, and its UUID must have an `admin` row in `public.academic_staff`. You can find the UUID in **Supabase Dashboard → Authentication → Users**.

If there is no primary admin yet, add the first one from **SQL Editor** after replacing the UUID:

```sql
insert into public.academic_staff (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Keep the existing `academic_staff` table and its access policies enabled. Do not make this table publicly writable.

## 2. Install and link the Supabase CLI

Run these commands from the project folder. The project ref below is taken from this repo's `supabase-config.js` URL (`ixaxvcinbbbqriylqcvi`); confirm it matches the project you intend to deploy to.

```sh
supabase login
supabase link --project-ref ixaxvcinbbbqriylqcvi
```

If the CLI is not installed, follow the [Supabase CLI installation guide](https://supabase.com/docs/guides/cli).

## 3. Deploy the moderation function

If Cloudinary API credentials are not already configured as Supabase Edge Function secrets, set them for this project. The backend needs the Cloudinary API key and API secret for deletion; upload presets are not credentials:

```powershell
supabase secrets set CLOUDINARY_CLOUD_NAME="jgkwrktm" CLOUDINARY_API_KEY="<cloudinary-api-key>" CLOUDINARY_API_SECRET="<cloudinary-api-secret>" --project-ref ixaxvcinbbbqriylqcvi
```

```sh
supabase secrets set ELIBRARY_CLOUDINARY_API_KEY="<elibrary-cloudinary-api-key>" ELIBRARY_CLOUDINARY_API_SECRET="<elibrary-cloudinary-api-secret>" --project-ref ixaxvcinbbbqriylqcvi
```

Set these credentials for the `n4yrq0td` Cloudinary account used by E-Library uploads. Keep them in Supabase secrets; never put them in browser code.

```sh
supabase functions deploy admin-moderation --project-ref ixaxvcinbbbqriylqcvi
```

E-Library requests now use the separate authenticated `elibrary-resources` function so browser code cannot approve or delete Firestore records directly. Configure its Firebase service-account and E-Library Cloudinary secrets, deploy it, and publish the rules from [`firestore.rules`](firestore.rules) as described in [`setup.md`](setup.md).

The function is in `supabase/functions/admin-moderation/index.ts`. Its JWT verification is enabled in `supabase/config.toml`; it also checks the caller's Supabase session and `academic_staff` role before taking action.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. No service-role key or Cloudinary API secret should be added to browser code, committed to this repo, or manually pasted into the admin page. See [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).

## 4. Use the moderation panel

1. Open `admin/subadmin.html` and sign in with the approved staff account.
2. Open **Moderation**. The tab appears only for primary admins.
3. For a user restriction, paste the target user's Auth UUID, choose a duration, and select **Ban account**. Use **Lift ban** to restore sign-in.
4. For a confession removal, paste its Share link or row UUID and select **Delete confession post**.
5. For an E-Library upload, open **E-Library requests**. The backend verifies the admin role; rejecting it deletes the Cloudinary asset first, then removes its Firestore record. If Cloudinary deletion fails, the request remains so it can be retried.

The function refuses to ban the signed-in admin or any account listed in `academic_staff`. A ban blocks new sign-ins for the selected duration. Supabase access tokens already issued to the user can remain usable until they expire, so the ban is not an immediate termination of active sessions. A permanent ban is implemented as a long-duration Supabase Auth ban and can be lifted from this panel.

## 5. Verify

- Sign in as a primary admin and confirm the Moderation tab is visible.
- Sign in as a subadmin and confirm the tab is hidden.
- In a safe test account, apply a short ban, verify sign-in is blocked, then lift it.
- In a test confession, delete its UUID and confirm the row is gone from `public.confessions`.

## Notes and limits

- The function removes the Cloudinary asset before the confession row. If Cloudinary reports an error, the post stays available so deletion can be retried.
- The controls do not include a user search or a report review queue.
- This panel bans the account from Supabase sign-in as a whole. It does not yet support per-feature restrictions such as disabling only chat, comments, or confession posting.

## References

- [Deploy Supabase Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
