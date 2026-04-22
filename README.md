# GEO MATE (Full Web Platform)

GEO MATE now runs as a full-featured dating website experience with:

- Website landing and marketing pages
- Account creation and authentication
- Discovery/swipe flow
- Match generation
- In-browser messaging between matches
- Profile and preference management
- Waitlist signup endpoint

## Run

```bash
npm start
```

Open:

- `http://localhost:3000/` landing website
- `http://localhost:3000/auth` account onboarding/sign-in
- `http://localhost:3000/app` web dating app

## Go Live (Public URL + 24/7 + OTP)

This repo is prepared for Render deployment with persistent storage:

- Blueprint file: `render.yaml`
- Persistent user data path: `DATA_DIR` (mounted to `/var/data` in Render)
- Health check route: `/health`

### 1. Host Online (Public URL)

1. Push this project to GitHub.
2. In Render, click **New +** -> **Blueprint**.
3. Select this repository and deploy.
4. Render will create `geo-mate-web` using `render.yaml`.
5. After deploy, you get a public URL like `https://geo-mate-web.onrender.com`.

### 2. Keep It Running 24/7

1. In Render service settings, keep plan on **Starter** or above.
2. Keep auto-deploy on.
3. Confirm disk `geo-mate-data` is mounted to `/var/data`.
4. Never delete the disk unless you intentionally want to erase user data.

### 3. Real Email + SMS OTP

1. Add environment variables in Render (from `.env.example`).
2. Choose one email provider (`resend` or `sendgrid`).
3. Set `SMS_PROVIDER=twilio` and Twilio credentials.
4. Keep `SHOW_DEV_CODES=false` in production.

### Custom Domain

1. In Render -> Settings -> Custom Domains, add your domain.
2. Add DNS records exactly as Render shows.
3. Wait for SSL certificate to be issued automatically.

## OTP Delivery Configuration

Set environment variables before running if you want real OTP delivery.
Use [.env.example](./.env.example) as your template.

Email (choose one provider):

- Resend
  - `EMAIL_PROVIDER=resend`
  - `RESEND_API_KEY=...`
  - `EMAIL_FROM=verified@yourdomain.com`
- SendGrid
  - `EMAIL_PROVIDER=sendgrid`
  - `SENDGRID_API_KEY=...`
  - `EMAIL_FROM=verified@yourdomain.com`

SMS:

- Twilio
  - `SMS_PROVIDER=twilio`
  - `TWILIO_ACCOUNT_SID=...`
  - `TWILIO_AUTH_TOKEN=...`
  - `TWILIO_FROM_NUMBER=+1XXXXXXXXXX`

Optional:

- `APP_NAME=GEO MATE`
- `SHOW_DEV_CODES=true` to always return codes in API responses (dev only).

## Core API routes

- `POST /waitlist`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/profile`
- `POST /recommendations`
- `POST /swipe`
- `GET /matches`
- `GET /inbox`
- `GET /messages?with=<userId>`
- `POST /messages`
