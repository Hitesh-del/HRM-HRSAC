Netlify build fix summary
=========================

- Removed literal email address from a code comment in `src/pages/auth/ForgotPasswordPage.tsx`.
- This comment previously referenced `noreply@hrsactech.in`, which matches `RESEND_FROM_EMAIL` and can trigger Netlify secret scanning.
- The page now has a generic comment that does not expose any secret values.
- Confirmed `dist` build artifacts do not contain the secret names/values scanned from the repo.
- Updated `netlify.toml` to whitelist public client-side Supabase keys via `SECRETS_SCAN_OMIT_KEYS`.

Next step: trigger a fresh Netlify deploy to verify the build passes.
