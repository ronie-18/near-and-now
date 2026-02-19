# How to Get the Backend API URL

The **backend API** is the server that runs your Express app: it serves `/api/auth`, `/api/orders`, `/api/products`, etc. (and handles Twilio OTP). The frontend needs its **full URL** in production so login/OTP work.

---

## Option A: Backend deployed on Vercel (this repo’s `vercel.json`)

Your `api/index.ts` is set up for Vercel serverless. When you deploy this repo to Vercel:

1. Deploy: `vercel` or connect the repo in the Vercel dashboard and deploy.
2. After deploy, Vercel gives you a URL, e.g.  
   `https://near-and-now-xxxx.vercel.app`  
   or your custom domain like `https://api.yoursite.com`.
3. **Backend API URL** = that URL (no trailing slash), e.g.  
   `https://near-and-now-xxxx.vercel.app`  
   or `https://api.yoursite.com`.
4. In the **frontend** project (wherever it’s built), set:
   - `VITE_API_URL` = that same URL (e.g. `https://near-and-now-xxxx.vercel.app`).
5. Redeploy the frontend so the new env is used.

To confirm the backend is up: open in a browser  
`https://YOUR_BACKEND_URL/health`  
You should see something like `{"status":"ok",...}`.

---

## Option B: Backend on another host (Railway, Render, cPanel, VPS, etc.)

1. Deploy the **backend** (the `backend` folder + `api` entry if needed) to that host.
2. Note the URL they give you, e.g.:
   - Railway: `https://your-app.up.railway.app`
   - Render: `https://your-service.onrender.com`
   - Your server: `https://api.yoursite.com` or `https://yoursite.com`
3. **Backend API URL** = that base URL (no trailing slash).
4. In the **frontend** env, set:
   - `VITE_API_URL` = that URL (e.g. `https://your-app.up.railway.app`).
5. Redeploy the frontend.

Check: open `https://YOUR_BACKEND_URL/health` — you should get `{"status":"ok",...}`.

---

## Option C: Frontend and backend on the same domain (e.g. one Vercel app)

If you deploy **one** Vercel project that serves both the static frontend and the same `api/index.ts` (e.g. same `vercel.app` URL or same custom domain):

- All requests are **same origin** (e.g. `https://yoursite.vercel.app`).
- You can leave `VITE_API_URL` **empty** so the app uses relative URLs like `/api/auth/send-otp`; they will hit the same host and work.

So in that case you don’t need to “get” a separate backend URL — the backend API is just the same URL as the site.

---

## Summary

| Where the backend runs | Backend API URL you use for `VITE_API_URL` |
|------------------------|--------------------------------------------|
| Vercel (this repo)     | The Vercel project URL, e.g. `https://near-and-now-xxxx.vercel.app` |
| Railway / Render / etc.| The URL that host gives for your backend service |
| Same domain as frontend| Leave `VITE_API_URL` empty (relative `/api` is enough) |

**Quick check:**  
Open `https://YOUR_BACKEND_URL/health` in the browser. If you see `{"status":"ok",...}`, that base URL is your backend API URL; use it as `VITE_API_URL` in the frontend (unless you’re on the same domain, then leave it empty).
