# Moving the Backend from Vercel to AWS — Complete Beginner's Guide

This guide walks through moving **only the backend** (the Express API currently
deployed on Vercel via `api/index.ts` → `backend/src/server.ts`) to AWS. It
assumes you have **never used AWS before** and explains every step, including
account creation.

**What stays the same:**
- Supabase remains the database (nothing to migrate there).
- The frontend (React/Vite, currently on Namecheap) stays where it is — you'll
  just point it at the new backend URL when you're done.
- Razorpay, Twilio, Google Maps integrations stay the same — you just copy the
  same environment variables to AWS.

**What changes:**
- Where the Express server (`backend/src/server.ts`) runs.
- The API URL your frontend calls (`VITE_API_URL`).

No code changes are made in this document — it's a plan you'll execute later,
step by step.

---

## 1. Which AWS service should you use?

AWS has ~10 different ways to run a backend. For a small-to-medium Express API
like this one, you want the option with the least moving parts. Comparison:

| Service | Beginner friendliness | Notes |
|---|---|---|
| **AWS Elastic Beanstalk** | ⭐⭐⭐⭐⭐ Easiest | Give it your Node.js app, it manages the server, load balancer, scaling, health checks for you. No Docker knowledge needed. **Recommended for you.** |
| AWS App Runner | ⭐⭐⭐⭐ Easy | Similar simplicity, deploys straight from GitHub, but slightly less mature and a bit more expensive at idle. |
| EC2 (plain virtual machine) | ⭐⭐ Hard | You manage the OS, updates, process manager (pm2), reverse proxy (nginx), SSL — full control but a lot to learn. |
| ECS/Fargate (containers) | ⭐ Hardest | Requires Docker + container orchestration knowledge. Overkill for this app size. |
| AWS Lambda + API Gateway | ⭐⭐ Medium | Closest to how Vercel worked (serverless functions), but requires restructuring the Express app to work as a Lambda handler. More re-work than Beanstalk. |

**Recommendation: AWS Elastic Beanstalk (Node.js platform).** It's the
closest thing to "push my Express app and AWS runs it," similar in spirit to
what Vercel/Railway/Render do, but fully inside AWS. We'll use this for the
rest of the guide.

---

## 2. Create your AWS account

1. Go to https://aws.amazon.com/ and click **"Create an AWS Account"**.
2. You'll need:
   - An email address (use one you check regularly — AWS sends billing and
     security alerts here).
   - A phone number (for SMS/voice verification).
   - A **credit or debit card** (required even for free-tier usage, but you
     won't be charged unless you exceed free-tier limits or use a paid
     service).
3. Choose **"Personal"** account type unless this is registered as a company.
4. Verify your identity via the phone call/SMS code AWS sends.
5. Pick a **Support Plan** — choose **"Basic support - Free"**. You don't need
   paid support.
6. Once done, you'll land on the **AWS Management Console** — this is the
   web dashboard for everything AWS.

### Understand the AWS Free Tier
- New accounts get 12 months of free tier on many services, plus some
  "always free" allowances.
- Elastic Beanstalk itself is free — you only pay for the underlying
  resources it creates (an EC2 instance, a load balancer, etc.).
- A `t3.micro` or `t2.micro` EC2 instance (750 hours/month) is free for the
  first 12 months. After that it's roughly **$7–10/month** for a small
  instance running 24/7.
- The Elastic Load Balancer that Beanstalk creates by default is **not**
  part of the free tier and costs roughly **$16–18/month** on its own. We'll
  cover a way to avoid this cost in Step 6 (single-instance environment).

---

## 3. Immediately lock down your account (security basics)

Do this **before** anything else — it's the single most important step for a
first-time AWS user, since a leaked root account or API key is how people
end up with surprise $10,000 bills.

### 3.1 Enable MFA (Multi-Factor Authentication) on the root account
1. In the AWS Console, click your account name (top right) → **Security
   credentials**.
2. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**.
3. Use an authenticator app (Google Authenticator, Authy, 1Password) — scan
   the QR code and enter the two consecutive codes.
4. From now on, logging in as root requires your password **and** this code.

### 3.2 Set a billing alert
1. Go to **Billing and Cost Management** → **Budgets**.
2. Click **Create budget** → **Zero spend budget** (alerts you the moment
   any charge occurs) — good for a first-time account. Alternatively create
   a **Monthly cost budget** for e.g. $10 with an alert at 80%.
3. Enter your email address to receive the alert.

### 3.3 Create an IAM user (stop using the root account for daily work)
The root account should only be used for account-level tasks (billing,
closing the account). For everyday work, create a separate admin user:

1. Go to the **IAM** service (search "IAM" in the top search bar).
2. **Users** → **Create user**.
3. Name it something like `your-name-admin`.
4. Check **"Provide user access to the AWS Management Console"** → choose
   "I want to create an IAM user" → set a custom password.
5. On the permissions step, choose **"Attach policies directly"** → attach
   **`AdministratorAccess`**.
6. Finish creating the user.
7. **Log out of root, log back in as this IAM user** from now on. You'll use
   a special sign-in URL shown at the end of user creation (format:
   `https://<account-id>.signin.aws.amazon.com/console`) — bookmark it.
8. Also enable MFA on this IAM user (same steps as 3.1).

### 3.4 Create programmatic access keys (for CLI deployment later)
1. Still in IAM → **Users** → click your admin user → **Security
   credentials** tab.
2. Under **Access keys**, click **Create access key**.
3. Choose **"Command Line Interface (CLI)"** as the use case, acknowledge the
   warning, and create it.
4. **Download the .csv file** or copy the **Access Key ID** and **Secret
   Access Key** somewhere safe (e.g. a password manager). You will not be
   able to see the secret key again after this screen closes.
5. Never commit these keys to git, never share them, never put them in
   frontend code. Treat them like a password.

---

## 4. Install tools on your computer

You'll need three things installed locally:

### 4.1 AWS CLI
```bash
# macOS (you're on Darwin/macOS based on your environment)
brew install awscli
aws --version
```

### 4.2 Configure the CLI with your access keys
```bash
aws configure
```
It will ask for:
- **AWS Access Key ID** — from step 3.4
- **AWS Secret Access Key** — from step 3.4
- **Default region name** — pick the AWS region closest to your users. Since
  your app (Near & Now) appears India-focused (Razorpay, Indian phone
  numbers via Twilio), use **`ap-south-1`** (Mumbai).
- **Default output format** — `json` is fine.

### 4.3 EB CLI (Elastic Beanstalk command-line tool)
```bash
# Requires Python (macOS ships with it, or use pip3)
pip3 install awsebcli --upgrade --user
eb --version
```
If `eb` isn't found after install, add Python's user bin directory to your
PATH (the installer output tells you the exact path to add).

---

## 5. Prepare the backend for Elastic Beanstalk (conceptual — no code changes yet)

When you're ready to actually do the migration (a follow-up task, not this
document), the backend will need:

1. **A `Procfile`** (or rely on `npm start`) telling Beanstalk how to run the
   app. Your `backend/package.json` already has:
   ```json
   "scripts": { "start": "node dist/server.js", "build": "tsc" }
   ```
   Beanstalk's Node.js platform runs `npm install` then `npm start`
   automatically, so this likely works with minimal changes — but Beanstalk
   needs the `dist/` folder built beforehand (or a build step). You may need
   an `.ebextensions/` config or a `postinstall` script that runs `npm run
   build`. We'll figure out the exact setup when we get to implementation.

2. **`server.ts` must listen on `process.env.PORT`.** Beanstalk sets `PORT`
   to `8080` internally by default (via nginx proxy in front). Check that
   `backend/src/server.ts` uses `process.env.PORT` (common in Express apps)
   rather than a hardcoded port.

3. **CORS configuration** — your `.env.example` already has
   `ALLOWED_ORIGINS` support. You'll set this to your actual frontend domain
   once deployed (e.g. `https://nearandnow.in`).

4. Because this is a monorepo (`backend/` is an npm workspace, not a
   standalone package), Beanstalk deployment will need either:
   - Deploying just the `backend/` folder as its own zip (simplest), or
   - A build step that produces a self-contained backend bundle.

   We'll decide the exact packaging approach when we implement this — it's
   the main technical wrinkle, everything else is standard Beanstalk usage.

---

## 6. Create the Elastic Beanstalk application

This is the actual "deploy" step, done from inside the `backend/` folder
once you're ready:

```bash
cd backend
eb init
```
`eb init` will ask you:
- **Region** → `ap-south-1` (Mumbai) — same as CLI config.
- **Application name** → e.g. `near-and-now-backend`.
- **Platform** → Node.js (pick the version matching your `engines` field,
  or latest Node 20.x).
- **Set up SSH?** → Yes, if you want to SSH into the instance for debugging
  (optional but useful for a first-timer).

Then create the actual running environment:
```bash
eb create near-and-now-backend-prod --single
```
- The `--single` flag creates a **single-instance environment without a
  load balancer** — this avoids the ~$16-18/month ALB cost mentioned in
  Step 2, at the cost of no auto-scaling/zero-downtime deploys. Good
  tradeoff for a small app starting out. You can upgrade to a
  load-balanced environment later with one command if traffic grows.

This will take 5–10 minutes. At the end, `eb status` shows you a URL like:
```
http://near-and-now-backend-prod.ap-south-1.elasticbeanstalk.com
```
That's your new backend's public URL (temporary — we'll attach your real
domain in Step 8).

To deploy future changes:
```bash
eb deploy
```

---

## 7. Configure environment variables

Your backend needs these (from `backend/.env.example`) set as **environment
variables** in Elastic Beanstalk, not in a `.env` file (never upload `.env`
to AWS):

```bash
eb setenv \
  SUPABASE_URL=https://your-project-id.supabase.co \
  SUPABASE_ANON_KEY=your-anon-key \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  GOOGLE_MAPS_API_KEY=your-server-side-key \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=your-auth-token \
  TWILIO_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx \
  RAZORPAY_KEY_SECRET=your-razorpay-secret \
  RAZORPAY_WEBHOOK_SECRET=your-webhook-secret \
  ALLOWED_ORIGINS=https://nearandnow.in,https://www.nearandnow.in
```

Or set them via the Console: **Elastic Beanstalk → Environments → your
environment → Configuration → Software → Environment properties**.

**Important:** use your **live/production** Razorpay and Twilio credentials
here, not test keys, once you're actually cutting over production traffic.

For extra security later (optional, not required to launch), you can move
secrets into **AWS Secrets Manager** instead of plain environment variables
— worth doing once you're comfortable with the basics, but plain env vars
are fine to start (this is exactly what Vercel's env vars were doing too).

---

## 8. Point your domain at AWS

You said the frontend already lives at a domain (e.g. `nearandnow.in` per
the existing `DEPLOYMENT_GUIDE.md`). You have two options for the backend's
address:

### Option A (simpler): Use a subdomain for the API
E.g. `api.nearandnow.in` → AWS backend, while the main domain keeps serving
the frontend from Namecheap. This avoids touching your existing frontend
domain setup.

1. In Elastic Beanstalk, get your environment's URL (from `eb status`) or
   set up a **CNAME**.
2. In your domain's DNS settings (wherever you manage `nearandnow.in` —
   likely Namecheap's DNS panel, unless you move DNS to Route 53), add:
   ```
   Type: CNAME
   Host: api
   Value: near-and-now-backend-prod.ap-south-1.elasticbeanstalk.com
   ```
3. Wait for DNS propagation (a few minutes to a few hours).

### Option B: Move DNS management to Route 53
Only needed if you want everything inside AWS. Adds complexity (transferring
nameservers) for little benefit here — **skip this unless you have a
specific reason**; Option A is enough.

### 8.1 Add HTTPS (SSL certificate) — required, do not skip
Browsers and your frontend's `fetch()` calls will refuse mixed content
(HTTPS frontend calling HTTP backend), so the backend must serve HTTPS too.

1. Go to **AWS Certificate Manager (ACM)** in the `ap-south-1` region.
2. Request a public certificate for `api.nearandnow.in`.
3. Validate it via **DNS validation** — ACM gives you a CNAME record to add
   to your DNS (same place as Step 8, Option A).
4. Once validated (green "Issued" status), attach it to your Elastic
   Beanstalk environment:
   - If using `--single` (no load balancer), you'll need to switch to a
     load-balanced environment to attach an ACM cert directly at the load
     balancer level — this is the main tradeoff of the cost-saving
     `--single` mode. Alternative: terminate SSL in the Node app itself
     using a certificate, which is more manual.
   - Simplest path in practice: once you're ready to go live with a real
     domain, switch to a load-balanced environment (`eb create` without
     `--single`, or `eb config` to convert) and attach the ACM cert to the
     Application Load Balancer via **Configuration → Load balancer → Add
     listener → HTTPS:443 → select your ACM certificate**. This adds the
     ~$16-18/month ALB cost but is the standard, low-maintenance way to get
     HTTPS.

---

## 9. Update the frontend to use the new backend URL

Once the backend is live at `https://api.nearandnow.in`:

1. Update `VITE_API_URL` in the frontend's environment/production config to
   point to the new URL.
2. Rebuild the frontend (`npm run build`) — remember env vars are baked in
   at build time (per your existing `DEPLOYMENT_GUIDE.md`).
3. Re-upload the frontend `dist/` to Namecheap as before.
4. Update the `RAZORPAY_WEBHOOK_SECRET` webhook URL in the Razorpay
   dashboard to point at the new backend (`https://api.nearandnow.in/api/payment/webhook`
   or whatever the actual route is).
5. Update the CORS `ALLOWED_ORIGINS` env var on AWS if your frontend domain
   differs from what you set in Step 7.

---

## 10. Test before fully cutting over

1. Keep the Vercel deployment running during testing — don't delete it yet.
2. Test the new AWS backend directly (e.g. `curl
   https://api.nearandnow.in/health`) to confirm it's up.
3. Point a **staging** build of the frontend at the AWS backend first, or
   test manually by temporarily overriding `VITE_API_URL` in a local build.
4. Verify: login/OTP (Twilio), payments (Razorpay test mode first, then
   live), order placement, maps/geocoding features, and the
   shopkeeper/delivery-partner flows that hit `/store-owner`,
   `/shopkeeper`, `/delivery-partner` routes (per your `vercel.json`
   routing — make sure equivalent routes work on the Express app directly
   on AWS, since there's no `vercel.json` routing layer anymore).
5. Only after everything checks out, switch the live frontend's
   `VITE_API_URL` and redeploy.

---

## 11. Monitoring and logs on AWS

- **CloudWatch Logs**: Elastic Beanstalk ships app logs here automatically.
  View via `eb logs` (CLI) or Console → CloudWatch → Log groups.
- **Health dashboard**: Console → Elastic Beanstalk → your environment
  shows a health status (green/yellow/red) and recent events.
- **Alarms**: Set a CloudWatch alarm on 5xx error rate or CPU usage so you
  get notified if something breaks (optional but recommended once live).

---

## 12. Decommission Vercel (after everything is confirmed working)

1. Confirm production traffic has been on AWS for at least a few days with
   no issues.
2. Remove the `api/index.ts` Vercel wrapper and `vercel.json` `builds`
   entry for the API (frontend static hosting on Vercel, if any, can stay
   or go separately — this only concerns the backend API).
3. Delete or pause the Vercel project for the backend to stop any residual
   billing (Vercel's free tier is $0, but check if you're on a paid plan).

---

## 13. Cost summary (approximate, `ap-south-1`)

| Item | Monthly cost |
|---|---|
| EC2 `t3.micro` (single instance, after free tier) | ~$8 |
| Elastic Load Balancer (only if you enable HTTPS via ALB) | ~$16-18 |
| Data transfer, CloudWatch logs | Usually <$1-2 for small traffic |
| Elastic Beanstalk itself | Free |
| ACM SSL certificate | Free |
| **Total (single-instance, no HTTPS)** | ~$0-8 (free tier covers instance for 12mo) |
| **Total (load-balanced, with HTTPS)** | ~$25-30/month |

You can start single-instance + HTTP-only for initial testing (Step 6), then
upgrade to load-balanced + HTTPS (Step 8) before pointing real user traffic
at it.

---

## 14. Quick reference — command cheat sheet

```bash
# One-time setup
brew install awscli
aws configure
pip3 install awsebcli --upgrade --user

# Per-project setup (inside backend/)
eb init
eb create near-and-now-backend-prod --single

# Every time you deploy an update
eb deploy

# Useful diagnostics
eb status        # environment URL & health
eb logs          # recent logs
eb ssh           # SSH into the instance
eb open          # open the environment URL in a browser
eb setenv KEY=VALUE   # add/update an environment variable
```

---

## Summary of what you'll actually do, in order

1. Create AWS account + secure it (MFA, IAM user, billing alert).
2. Install AWS CLI + EB CLI locally, run `aws configure`.
3. (Implementation step, later) Adjust backend packaging so it can be
   deployed as a standalone Beanstalk app.
4. `eb init` + `eb create --single` to get it running on a temporary AWS
   URL.
5. Set all environment variables via `eb setenv`.
6. Add a subdomain (`api.nearandnow.in`) pointing at AWS, request an ACM
   cert, and switch to a load-balanced environment for HTTPS.
7. Update frontend's `VITE_API_URL`, rebuild, redeploy.
8. Test thoroughly with test payment/OTP credentials, then go live.
9. Decommission the Vercel backend deployment.

This document is planning only — no code or config in this repo has been
changed. When you're ready to execute, we'll go step by step starting with
account creation, and I'll help adjust the actual backend files (Procfile,
`.ebextensions`, `PORT` handling, etc.) at that point.
