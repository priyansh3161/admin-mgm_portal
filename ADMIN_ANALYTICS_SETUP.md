# Admin analytics setup

1. Run schema_admin_analytics.sql in the Supabase SQL Editor.
2. Create a scoped Supabase Management API token with analytics_usage_read and analytics_logs_read.
3. Add MANAGEMENT_ACCESS_TOKEN=<token> to the ignored supabase/.env file. The function also accepts the legacy SUPABASE_ACCESS_TOKEN name. Keep tokens out of Git.
4. In both Google Cloud projects, enable Cloud Monitoring API and grant the existing Firebase service account the Monitoring Viewer role. This enables Firestore usage metrics.
5. Publish the secrets and function:

    supabase secrets set --env-file supabase/.env --project-ref ixaxvcinbbbqriylqcvi
    supabase functions deploy admin-analytics --project-ref ixaxvcinbbbqriylqcvi

6. Publish the updated portal files: index.html and admin/index.html.

The primary admin dashboard shows daily and monthly signed-in portal users, visits, current Supabase database size, Firestore monthly reads/writes/deletes and current Firestore storage for Emergency Chat and E-Library, browser errors, provider logs and Supabase request counts. Supabase provider logs and request totals need the scoped token; request totals cover the last 7 days. Firestore metrics need Monitoring Viewer and can be delayed by a few minutes. Database change compares the first sample recorded in the current month. Supabase database size excludes WAL and system disk use. Visits start collecting after this setup is published. Old visit records are purged when the dashboard loads after 365 days; browser errors after 90 days.

Google references: [Cloud Firestore usage metrics](https://firebase.google.com/docs/firestore/monitor-usage) and [Supabase logs API](https://supabase.com/docs/reference/api/v1-get-project-logs).
