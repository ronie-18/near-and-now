// Supabase Edge Function for Admin Authentication
// This handles admin login with JWT tokens and HTTP-only cookies

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'
import { create, verify } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, email, password } = await req.json()

    // LOGIN
    if (action === 'login') {
      // Fetch admin by email
      const { data: admin, error } = await supabaseAdmin
        .from('admins')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'active')
        .single()

      if (error || !admin) {
        return new Response(
          JSON.stringify({ error: 'Invalid credentials' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, admin.password_hash)
      
      if (!isValidPassword) {
        return new Response(
          JSON.stringify({ error: 'Invalid credentials' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Update last login
      await supabaseAdmin
        .from('admins')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', admin.id)

      // Generate JWT tokens
      const jwtSecret = Deno.env.get('JWT_SECRET') ?? 'your-secret-key'
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )

      // Access token (15 minutes)
      const accessToken = await create(
        { alg: 'HS256', typ: 'JWT' },
        {
          adminId: admin.id,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
        },
        key
      )

      // Refresh token (7 days)
      const refreshToken = await create(
        { alg: 'HS256', typ: 'JWT' },
        {
          adminId: admin.id,
          type: 'refresh',
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        },
        key
      )

      // Store refresh token in database
      await supabaseAdmin
        .from('admin_refresh_tokens')
        .insert({
          admin_id: admin.id,
          token: refreshToken,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })

      // Remove sensitive data
      const { password_hash, ...adminData } = admin

      return new Response(
        JSON.stringify({
          admin: adminData,
          accessToken,
          refreshToken
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            // Set HTTP-only cookie for refresh token
            'Set-Cookie': `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Path=/`
          }
        }
      )
    }

    // REFRESH TOKEN
    if (action === 'refresh') {
      const { refreshToken } = await req.json()

      if (!refreshToken) {
        return new Response(
          JSON.stringify({ error: 'Refresh token required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify refresh token
      const jwtSecret = Deno.env.get('JWT_SECRET') ?? 'your-secret-key'
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )

      try {
        const payload = await verify(refreshToken, key)

        // Check if token exists in database
        const { data: tokenData, error } = await supabaseAdmin
          .from('admin_refresh_tokens')
          .select('*')
          .eq('token', refreshToken)
          .eq('admin_id', payload.adminId)
          .single()

        if (error || !tokenData) {
          return new Response(
            JSON.stringify({ error: 'Invalid refresh token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get admin data
        const { data: admin } = await supabaseAdmin
          .from('admins')
          .select('id, email, role, permissions')
          .eq('id', payload.adminId)
          .eq('status', 'active')
          .single()

        if (!admin) {
          return new Response(
            JSON.stringify({ error: 'Admin not found' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Generate new access token
        const newAccessToken = await create(
          { alg: 'HS256', typ: 'JWT' },
          {
            adminId: admin.id,
            email: admin.email,
            role: admin.role,
            permissions: admin.permissions,
            exp: Math.floor(Date.now() / 1000) + (15 * 60)
          },
          key
        )

        return new Response(
          JSON.stringify({
            accessToken: newAccessToken,
            admin
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } catch (error) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired refresh token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // LOGOUT
    if (action === 'logout') {
      const { refreshToken } = await req.json()

      if (refreshToken) {
        // Delete refresh token from database
        await supabaseAdmin
          .from('admin_refresh_tokens')
          .delete()
          .eq('token', refreshToken)
      }

      return new Response(
        JSON.stringify({ message: 'Logged out successfully' }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Set-Cookie': 'refreshToken=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
          }
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
