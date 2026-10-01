# Connection verification — 2026-09-28

- Production: https://my-web-my-web.vercel.app (HTTP 200).
- Its deployed bundle already contains the configured Supabase project URL and matching publishable key. No replacement deployment was needed.
- Project `wahiwgzvhwlahfevcimh` was paused. Resumed the existing project through Supabase; dashboard now reports **Healthy**.
- Auth settings endpoint responds HTTP 200. Anonymous profile reads return HTTP 401 / permission denied, as intended.
- Read-only SQL verified profiles, friendships, messages, posts and comments exist with RLS enabled, and all five tables belong to the supabase_realtime publication.
- Private Storage bucket `mnchat-media` exists (`public=false`).
- No application source, authentication policy, existing member data or GitHub repository was changed in this recovery.
- Two-account browser login, message delivery and image upload were not tested in this recovery. Realtime publication configuration alone does not establish end-to-end delivery.
- If the project is paused again, resume it from its existing Supabase dashboard; do not recreate the schema or database.
