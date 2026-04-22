# GEO MATE Production Launch Checklist

## A. Hosting and Uptime

1. Deploy with `render.yaml`.
2. Confirm service is healthy at `/health`.
3. Confirm Render disk is mounted at `/var/data`.
4. Confirm plan is Starter+ (no sleep).

## B. Secrets and OTP

Required for email OTP:

- `EMAIL_PROVIDER=resend` with:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`

OR

- `EMAIL_PROVIDER=sendgrid` with:
  - `SENDGRID_API_KEY`
  - `EMAIL_FROM`

Required for SMS OTP:

- `SMS_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Required safety:

- `NODE_ENV=production`
- `SHOW_DEV_CODES=false`
- `DATA_DIR=/var/data`

## C. Domain

1. Add custom domain in Render.
2. Add DNS records exactly as instructed by Render.
3. Wait for SSL status = active.

## D. Final Live Test

1. Open public domain.
2. Register a new user with real email + real phone.
3. Verify both OTP codes arrive.
4. Complete onboarding, add interests/photos/location.
5. Sign out and sign in again.
6. Create second user and verify matching + chat.
