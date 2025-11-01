# Where to Find Service Role Key in Supabase - Step by Step

## 🔗 Quick Link
**Direct URL to your Supabase Dashboard:**
https://supabase.com/dashboard/project/mpbszymyubxavjoxhzfm

---

## 📍 Step-by-Step Navigation

### Step 1: Log into Supabase
1. Go to: https://supabase.com
2. Click **"Sign In"** (top right)
3. Log in with your account

### Step 2: Select Your Project
1. You should see a list of your projects
2. Click on the project named: **"mpbszymyubxavjoxhzfm"** (or your Near & Now project)
3. This will open your project dashboard

### Step 3: Navigate to API Settings
**Look at the LEFT SIDEBAR**, you'll see a list of menu items:
- 📊 Home
- 🔨 Table Editor
- 🔐 Authentication
- 📦 Storage
- 🔧 Database
- ⚙️ **Settings** ← **Click this!**

After clicking Settings, a submenu appears:
- General
- **API** ← **Click this!**
- Database
- Auth
- etc.

### Step 4: Find Your Service Role Key
Once you're on the **Settings → API** page, scroll down and you'll see:

#### Section: "Project API keys"

You'll see several keys listed:

1. **anon / public** key
   - Label: `anon` `public`
   - This is your public key (you're already using this)
   - ❌ Don't copy this one!

2. **service_role** key
   - Label: `service_role` `secret`
   - This is the one you need!
   - ✅ **This is what you're looking for!**

### Step 5: Reveal and Copy the Key
1. The service_role key is hidden by default (shows dots: `••••••••••`)
2. Click the **"Reveal"** or eye icon next to the service_role key
3. The full key will be displayed (starts with `eyJ...`)
4. Click the **"Copy"** button (or manually select and copy the entire key)

---

## 🎯 What to Do With the Key

Once you've copied the service_role key:

### 1. Open Your `.env` File
- Located in your project root: `/Users/tiasmondal166/projects/near-and-now/.env`
- If it doesn't exist, create it

### 2. Add This Line
```env
VITE_SUPABASE_SERVICE_ROLE_KEY=paste_your_copied_key_here
```

### 3. Example
Your `.env` file should look like this:
```env
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=AIzaSyCIyizHk4GySPlZBNvcGEXVydsENNC4NjQ

# App Settings
VITE_LOCATION_CACHE_DURATION=86400000
VITE_SEARCH_RADIUS_KM=2
VITE_MAX_SAVED_ADDRESSES=5

# Supabase Service Role Key (for admin operations)
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI5Nzk5NCwiZXhwIjoyMDY5ODczOTk0fQ...
```

### 4. Restart Your Dev Server
```bash
# Stop the current server (press Ctrl+C or Cmd+C in terminal)
npm run dev
```

---

## 🔍 Visual Hints

When you're on the correct page (**Settings → API**), you should see:

```
Project API keys
────────────────

These keys are used to bypass Row Level Security...

🔑 anon
   public
   [••••••••••••••••••••] [Reveal] [Copy]

🔑 service_role
   secret
   [••••••••••••••••••••] [Reveal] [Copy]  ← This is what you need!
```

---

## ⚠️ Important Notes

- **DO NOT** share this key publicly
- **DO NOT** commit it to Git (`.env` is already in `.gitignore`)
- The service_role key has **FULL ACCESS** to your database
- Make sure you copy the **service_role** key, not the **anon** key

---

## 🆘 Still Can't Find It?

### Alternative Path:
1. Go directly to: https://supabase.com/dashboard/project/mpbszymyubxavjoxhzfm/settings/api
2. This URL takes you straight to the API settings page
3. Scroll down to "Project API keys"
4. Look for **service_role** key

### What the Keys Look Like:
- **anon key** (you already have this): starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6ImFub24i...`
- **service_role key** (what you need): starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI...`

The difference is in the middle part: `"cm9sZSI6ImFub24i"` vs `"cm9sZSI6InNlcnZpY2Vfcm9sZSI"`

---

## ✅ Once You've Added the Key

Test it by:
1. Going to: http://localhost:5176/admin/categories/add
2. Try creating a new category
3. Should work without 401 error! 🎉

Check the browser console - you should see:
```
✅ Category created successfully!
```

No more 401 errors!

