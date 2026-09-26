# Near & Now — AWS Migration Plan (step by step)

**Status:** ready to execute · **Region:** `ap-south-1` (Mumbai) · **Owner:** engineering
**Companion docs:** `AWS_MIGRATION_GUIDE.md` (beginner walk-through of AWS account setup), `PERFORMANCE_AND_BUG_FIXES.md` (what changed in the code and why), `.github/workflows/deploy-*-aws.yml` (the automation this plan wires up).

---

## 0. Where things run today, and where they will run

| Piece | Today | After migration | Why |
| --- | --- | --- | --- |
| Express API (`backend/`) | Vercel serverless (`api/index.ts`) with cold starts; background work (delivery simulation, invoice PDFs, push notifications) can be killed when the function returns | **AWS App Runner** container from the existing `Dockerfile`, always-on, auto-scaling, HTTPS included | Removes cold starts (a big part of "delayed UI response"), lets background jobs finish, no load balancer to manage |
| React SPA (`frontend/`) | Namecheap cPanel static hosting (`.cpanel.yml`) with no CDN, no compression guarantees | **S3 + CloudFront** | Edge caching in India, HTTP/2 + Brotli, immutable asset caching, one-command deploys |
| Database, realtime, storage | Supabase | **Supabase (unchanged)** | Nothing to migrate; only the callers move |
| Razorpay, Twilio, Resend, Google Maps | Env vars on Vercel | Same env vars in **AWS Secrets Manager → App Runner** | |
| Logs | Vercel function logs | **CloudWatch Logs** (structured JSON lines with `requestId`, `route`, `durationMs`) | Every API error response now carries `where` + `requestId`; search either in CloudWatch to find the exact log line |
| Admin panel (`admin/` and `frontend/src/pages/admin`) | Bundled into the SPA | Same SPA (code-split, only downloaded on `/admin/*`) | |

**Why App Runner instead of Elastic Beanstalk / ECS / Lambda?**
The repo already has a production-grade multi-stage `Dockerfile`. App Runner runs that image directly, gives HTTPS, autoscaling, health checks and zero-downtime deploys with no EC2, ALB, VPC or task-definition management. If traffic grows past roughly 25 concurrent instances or you need a private VPC-only database, migrate the same image to ECS Fargate (Phase 8) — nothing in the code changes.

---

## 1. Prerequisites (day 0, ~1 hour)

1. AWS account with MFA on root, an IAM admin user, and a billing alarm (steps 2–3 of `AWS_MIGRATION_GUIDE.md`).
2. Local tools: `brew install awscli`, `aws configure` with region `ap-south-1`, Docker Desktop running.
3. Decide the two hostnames:
   - `api.nearandnow.in` → App Runner
   - `nearandnow.in` / `www.nearandnow.in` → CloudFront
4. Collect production secrets from Vercel → **Settings → Environment Variables** (Supabase service role key, Razorpay live keys + webhook secret, Twilio, Resend, Google Maps server key).
5. Make sure the code is at or after the commit that contains this plan: it includes `compression`, `X-Request-Id`, JSON 404/500 handlers, `trust proxy`, graceful `SIGTERM`, and the `/health` endpoint App Runner will probe.

---

## 2. Phase 1 — Container registry and the first image (~30 min)

```bash
export AWS_REGION=ap-south-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 2.1 Repository
aws ecr create-repository --repository-name nearandnow-api \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE

# 2.2 Keep only the last 20 images (cost hygiene)
aws ecr put-lifecycle-policy --repository-name nearandnow-api --lifecycle-policy-text '{
  "rules":[{"rulePriority":1,"description":"keep last 20","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":20},"action":{"type":"expire"}}]}'

# 2.3 Build + push once by hand (CI does this afterwards)
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
docker build -t $ECR/nearandnow-api:manual-1 .
docker push $ECR/nearandnow-api:manual-1
```

**Check:** `docker run -p 3000:3000 --env-file backend/.env $ECR/nearandnow-api:manual-1` then `curl localhost:3000/health` → `{"status":"ok",...}`.

---

## 3. Phase 2 — Secrets (~20 min)

Store each secret once in Secrets Manager; App Runner injects them as environment variables so nothing sensitive lives in the console or in git.

```bash
for KV in \
  SUPABASE_URL=https://xxxx.supabase.co \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  GOOGLE_MAPS_API_KEY=... \
  TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_SERVICE_SID=VA... \
  RAZORPAY_KEY_ID=rzp_live_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... \
  RESEND_API_KEY=re_... RESEND_FROM_EMAIL=orders@nearandnow.in
do
  NAME=${KV%%=*}; VALUE=${KV#*=}
  aws secretsmanager create-secret --name "nearandnow/prod/$NAME" --secret-string "$VALUE" >/dev/null && echo "stored $NAME"
done
```

Non-secret settings go in as plain environment variables in Phase 3:

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Fails CORS closed unless `ALLOWED_ORIGINS` is set |
| `PORT` | `3000` | Matches `Dockerfile` `EXPOSE` |
| `ALLOWED_ORIGINS` | `https://nearandnow.in,https://www.nearandnow.in` | Add the CloudFront domain during testing |
| `LOG_REQUESTS` | `true` | One JSON line per request; set `false` later to log only 4xx/5xx/slow |

---

## 4. Phase 3 — App Runner service (~30 min)

### 4.1 IAM roles

```bash
# Role App Runner uses to PULL from ECR
aws iam create-role --role-name AppRunnerECRAccessRole --assume-role-policy-document '{
 "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

# Role the RUNNING container uses to read secrets
aws iam create-role --role-name NearAndNowApiInstanceRole --assume-role-policy-document '{
 "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam put-role-policy --role-name NearAndNowApiInstanceRole --policy-name ReadProdSecrets --policy-document "{
 \"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],
 \"Resource\":\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT_ID:secret:nearandnow/prod/*\"}]}"
```

### 4.2 Create the service

Console path: **App Runner → Create service → Container registry → Amazon ECR → `nearandnow-api:manual-1`**, then:

| Setting | Value |
| --- | --- |
| Deployment trigger | Manual (CI triggers it) |
| ECR access role | `AppRunnerECRAccessRole` |
| Service name | `nearandnow-api` |
| Port | `3000` |
| CPU / memory | 1 vCPU / 2 GB to start (0.5 vCPU / 1 GB is enough for low traffic) |
| Environment variables | the four plain ones from Phase 2 |
| Secrets | each `nearandnow/prod/<NAME>` mapped to env var `<NAME>` |
| Instance role | `NearAndNowApiInstanceRole` |
| Auto scaling | min 1, max 5, concurrency 80 |
| Health check | **HTTP**, path `/health`, interval 10 s, timeout 5 s, healthy 1, unhealthy 3 |
| Observability | enable X-Ray tracing (optional) |

**Check:** the service shows **Running** and `curl https://<service>.ap-south-1.awsapprunner.com/health` returns JSON. Then `curl -i https://<service>/api/products/categories` → 200 with `X-Request-Id` and `Cache-Control: public, max-age=30...` headers, and `curl https://<service>/api/nope` → JSON 404 (`"where":"server.notFound"`).

### 4.3 Custom domain + TLS

Console: **App Runner → nearandnow-api → Custom domains → Link domain → `api.nearandnow.in`**. App Runner issues the ACM certificate and shows 1 CNAME for the domain plus 2–3 CNAMEs for validation. Add them at your DNS provider (Namecheap today; Route 53 optional). Wait for **Active**.

---

## 5. Phase 4 — Frontend on S3 + CloudFront (~45 min)

```bash
BUCKET=nearandnow-web-prod
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Console: **CloudFront → Create distribution**

| Setting | Value |
| --- | --- |
| Origin | the S3 bucket, **Origin access control (OAC)** — click "Copy policy" and paste it into the bucket policy |
| Viewer protocol | Redirect HTTP → HTTPS |
| Compress objects | On (Brotli + gzip) |
| Cache policy | `CachingOptimized` |
| Default root object | `index.html` |
| Custom error responses | 403 → `/index.html` 200, 404 → `/index.html` 200 (React Router deep links) |
| Alternate domain names | `nearandnow.in`, `www.nearandnow.in` with an ACM cert **issued in us-east-1** (CloudFront requirement) |
| Price class | "Use only North America, Europe, Asia, Middle East, and Africa" (includes Mumbai edge) |

First deploy by hand (CI does it afterwards):

```bash
cd frontend
VITE_API_URL=https://api.nearandnow.in \
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_GOOGLE_MAPS_API_KEY=... \
npx vite build
aws s3 sync dist/assets s3://$BUCKET/assets --delete --cache-control "public, max-age=31536000, immutable"
aws s3 sync dist s3://$BUCKET --exclude "assets/*" --delete --cache-control "public, max-age=60, must-revalidate"
aws cloudfront create-invalidation --distribution-id <ID> --paths "/index.html" "/"
```

**Check:** open the CloudFront URL, place a test order, open `/track/<id>` and confirm the map and status update; DevTools → Network should show `content-encoding: br` and `x-cache: Hit from cloudfront` on assets.

**Google Maps key:** the browser key (`VITE_GOOGLE_MAPS_API_KEY`) is referrer-restricted — add `https://nearandnow.in/*`, `https://www.nearandnow.in/*` and the `*.cloudfront.net` domain in Google Cloud Console or the map will show "Failed to load map".

---

## 6. Phase 5 — CI/CD from GitHub (~30 min)

Both workflows are already in `.github/workflows/`. They authenticate with **OIDC** (no long-lived AWS keys).

```bash
# 6.1 OIDC provider (once per account)
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 6.2 Deploy role trusted by this repo's main branch (replace ORG/REPO)
aws iam create-role --role-name github-deploy --assume-role-policy-document "{
 \"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
 \"Principal\":{\"Federated\":\"arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com\"},
 \"Action\":\"sts:AssumeRoleWithWebIdentity\",
 \"Condition\":{\"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\"},
 \"StringLike\":{\"token.actions.githubusercontent.com:sub\":\"repo:ORG/REPO:ref:refs/heads/main\"}}}]}"
```

Attach a policy to `github-deploy` allowing: `ecr:*` on the `nearandnow-api` repository + `ecr:GetAuthorizationToken`; `apprunner:UpdateService`, `apprunner:StartDeployment`, `apprunner:DescribeService` on the service; `s3:*Object`, `s3:ListBucket` on the web bucket; `cloudfront:CreateInvalidation` on the distribution; `iam:PassRole` for `AppRunnerECRAccessRole`.

GitHub → repo → **Settings**:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<account>:role/github-deploy` |
| Variable | `AWS_REGION` | `ap-south-1` |
| Variable | `APP_RUNNER_SERVICE_ARN` | from `aws apprunner list-services` |
| Variable | `WEB_BUCKET` | `nearandnow-web-prod` |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | from the console |
| Secrets | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_API_URL` | frontend build-time values |

Create a **production** environment in GitHub with required reviewers if you want a manual approval gate before each deploy.

**Check:** push a commit touching `backend/` → the backend workflow builds, pushes and waits for App Runner to report `RUNNING` + `/health` 200.

---

## 7. Phase 6 — Cut-over checklist

Run with the Vercel deployment still live; nothing here is destructive.

1. **Staging test first.** Build the frontend locally with `VITE_API_URL=https://api.nearandnow.in` and test: OTP login (Twilio), browse/search/category (Supabase reads), checkout COD and Razorpay test-mode, tracking page (realtime + polling), addresses, invoices, shopkeeper `/shopkeeper` and rider `/delivery-partner` flows (the mobile apps call these prefixes).
2. **Razorpay webhook**: Dashboard → Webhooks → change URL to `https://api.nearandnow.in/api/payment/webhook`, same secret. Send a test event; check CloudWatch for `PaymentController.handleWebhook`.
3. **Set `ALLOWED_ORIGINS`** on App Runner to the final domains and redeploy.
4. **DNS switch** for `nearandnow.in`/`www` → CloudFront (CNAME or ALIAS). TTL 300 s so rollback is fast.
5. Watch for 24 h: App Runner metrics (2xx/4xx/5xx, latency), CloudWatch Logs Insights:
   ```
   fields @timestamp, route, status, durationMs, requestId
   | filter status >= 500 or durationMs > 1500
   | sort @timestamp desc
   ```
6. **Rollback** at any point: point DNS back to Namecheap/Vercel; App Runner keeps the previous image (`Deployments → Redeploy`).

---

## 8. Phase 7 — Observability, alarms, cost controls (~30 min)

- **CloudWatch alarms** (SNS → email/SMS): App Runner `5xxStatusResponses` > 5 in 5 min; `RequestLatency` p95 > 2000 ms; `ActiveInstances` = max for 15 min (scale ceiling hit).
- **Log retention**: set the App Runner application log group to 30 days (`aws logs put-retention-policy`).
- **Budgets**: monthly budget of e.g. ₹5,000 with 80 % alert.
- **Expected monthly cost (low traffic, Mumbai):** App Runner 1 vCPU/2 GB ≈ $25–35 provisioned + requests; S3 + CloudFront ≈ $1–5; Secrets Manager ≈ $5; CloudWatch ≈ $2. Roughly **$35–50/month**, dropping to ~$15 at 0.5 vCPU / 1 GB.

---

## 9. Phase 8 — Decommission and future scale

1. After a week of clean metrics: delete the Vercel project, remove `api/index.ts`, `vercel.json`, `backend/vercel.json`, `.cpanel.yml`, and the `if (!process.env.VERCEL)` guard in `server.ts`.
2. **When to move to ECS Fargate**: sustained > 20 App Runner instances, need for private networking to a self-hosted Postgres, or long-running workers (a dedicated delivery-simulation / invoice worker). The same ECR image and env vars apply; add an ALB + target group with `/health`.
3. **Realtime at scale**: Supabase realtime channels are per-browser; if the tracking page ever needs >500 concurrent viewers, front it with API Gateway WebSockets fed by the backend instead.

---

## 10. Application changes already made for AWS (no action needed)

| Change | File | Effect on AWS |
| --- | --- | --- |
| `trust proxy`, `X-Forwarded-*` aware | `backend/src/server.ts` | Correct client IPs for rate limiting behind App Runner/ALB |
| gzip compression | `backend/src/server.ts` | 5–10× smaller catalogue JSON on the wire |
| Structured request log + `X-Request-Id` | `backend/src/middleware/requestContext.ts` | CloudWatch Logs Insights queries by route/latency; error bodies carry `requestId` |
| JSON 404 + global error handler | `backend/src/server.ts` | No HTML error pages leak into the SPA |
| Graceful `SIGTERM`, keep-alive tuned to 65 s | `backend/src/server.ts` | Zero-dropped-request deploys on App Runner/ALB |
| `Cache-Control` on catalogue GETs | `backend/src/routes/products.routes.ts` | CloudFront/browser caching if you later put CloudFront in front of the API |
| `/health` with uptime | `backend/src/server.ts` | App Runner + Docker `HEALTHCHECK` |
| Immutable hashed assets + code-split routes | `frontend/vite.config.ts`, `frontend/src/App.tsx` | First load ships ~1/3 of the JavaScript it used to; CloudFront caches chunks for a year |
