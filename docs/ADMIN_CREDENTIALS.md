# Admin Login Credentials

## Super Admin Account

**Email:** `superadmin@nearandnow.com`  
**Password:** `SuperAdmin@2025!`

⚠️ **IMPORTANT:** Change this password immediately after first login!

---

## Setup Instructions

1. Go to your **Supabase Dashboard → SQL Editor**
2. Run the file: `supabase/create-superadmin.sql`
3. Or copy and paste the SQL from that file
4. Navigate to: `http://localhost:5173/admin/login`
5. Login with the credentials above

---

## Password Hash

The password `SuperAdmin@2025!` is hashed using bcrypt with 10 salt rounds.

Hash: `$2b$10$3.Wn4YNVU3kzIpcc5SOSUOizjy7d4Zf1asWHIcXd/DofIconlcvjO`

---

## Security Notes

- This is a development credential
- For production, use a strong, unique password
- Consider implementing password rotation policies
- Enable 2FA for admin accounts in production
