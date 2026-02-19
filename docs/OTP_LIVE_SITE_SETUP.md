# Why OTP Works Locally But Not on https://nearandnow.in/ — Full Fix

## The full picture

### When you run `npm run dev:all` (local)

```
Your computer:
  - Frontend runs at http://localhost:5173
  - Backend runs at http://localhost:3000
  - Vite proxy: browser requests to /api/* → sent to localhost:3000
  - So "Send OTP" → goes to your backend → Twilio sends SMS ✅
```

The backend is **on your machine**. No hosting needed.

---

### When someone visits https://nearandnow.in/ (live site)

```
User's browser loads the site from nearandnow.in
  - Frontend (HTML/JS) is served from nearandnow.in (your hosting)
  - That server only serves static files — it does NOT run your Node/Express backend
  - User clicks "Send OTP" → frontend tries to call the API
  - Request goes to: either https://nearandnow.in/api/... (same host) or nowhere useful
  - nearandnow.in has no /api route → 404 or error → no OTP ❌
```

So: **the live site has no backend**. The backend only runs on your laptop when you do `npm run dev:all`. For the live site, the API must run somewhere on the **internet** (e.g. Vercel).

---

## What “change” you need (summary)

| What | Why |
|------|-----|
| **1. Host the backend on the internet** | So the live site has an API to call (e.g. deploy to Vercel). |
| **2. Set backend env vars (Twilio, Supabase)** | So the hosted backend can send OTP and use the DB. |
| **3. Set `VITE_API_URL` for the live frontend** | So the built frontend at nearandnow.in calls your **hosted** backend URL, not localhost or same-origin /api. |
| **4. Rebuild/redeploy the frontend** | So the new `VITE_API_URL` is baked into the build. |

---

## Step-by-step fix (using Vercel for the backend)

Your repo already has `api/index.ts` and `vercel.json` set up for Vercel. You only need to deploy that and wire the frontend to it.

### Step 1: Deploy the backend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. **Import** your project (GitHub/GitLab) or deploy with **Vercel CLI**:
   ```bash
   npx vercel
   ```
3. Use the **root** of the repo (where `vercel.json` and `api/` live). Vercel will use `vercel.json` and run your Express app as serverless functions.
4. After deploy, Vercel gives a URL, e.g. **`https://near-and-now-xxxx.vercel.app`** (or your custom domain). **This is your backend API URL.**

Check: open **`https://YOUR_VERCEL_URL/health`** in the browser. You should see `{"status":"ok",...}`.

---

### Step 2: Add environment variables to the Vercel project (backend)

In Vercel: **Project → Settings → Environment Variables**. Add these for **Production** (and Preview if you want):

| Name | Value | Notes |
|------|--------|--------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | From Twilio console |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | From Twilio console |
| `TWILIO_SERVICE_SID` | Your Twilio Verify Service SID | From Twilio console |
| `VITE_SUPABASE_URL` or `SUPABASE_URL` | Your Supabase URL | Backend needs this for DB |
| `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY` | Your Supabase anon key | |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | |

Optional (for maps/places): `GOOGLE_MAPS_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`.

Then **redeploy** the project (Deployments → ⋮ on latest → Redeploy) so the new env vars are used.

---

### Step 3: Set `VITE_API_URL` where you build the frontend for nearandnow.in

Wherever you build and deploy the **frontend** that ends up at https://nearandnow.in/ (e.g. same Vercel project, another Vercel project, cPanel, Netlify, etc.):

1. Open that project’s **environment variables**.
2. Add:
   - **Name:** `VITE_API_URL`
   - **Value:** your **backend** URL from Step 1, **no trailing slash**  
     Example: `https://near-and-now-xxxx.vercel.app`
3. Save.
4. **Trigger a new build and deploy** of the frontend (so the new value is baked into the built JS).

---

### Step 4: CORS (if you get a CORS error in the browser)

If the backend is on a **different domain** than nearandnow.in (e.g. backend on `near-and-now-xxxx.vercel.app`, frontend on `nearandnow.in`), the backend must allow `https://nearandnow.in` in CORS.

Your backend uses `app.use(cors())` with no options, which often allows any origin. If you still see CORS errors, we can add an explicit origin. Tell me and we’ll add it.

---

### Step 5: Test on the live site

1. Open **https://nearandnow.in/**
2. Go to login, enter phone number, click Send OTP.
3. You should receive the SMS and be able to log in.

---

## One-line summary

**OTP doesn’t work on the website because the backend isn’t on the internet.**  
Deploy the backend (e.g. to Vercel), set Twilio + Supabase env vars there, set `VITE_API_URL` to that backend URL when building the frontend, then redeploy the frontend. After that, OTP on https://nearandnow.in/ will work.
