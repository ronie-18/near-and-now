# 🔒 Security Implementation Guide - Step by Step

**Project:** Near & Now E-commerce Platform  
**Date:** January 29, 2026  
**Status:** Implementation in Progress

---

## ✅ Completed Steps (Today)

### Immediate Actions ✓
- [x] Removed service role key warning from `.env.example`
- [x] Installed security packages: `dompurify`, `zod`, `jsonwebtoken`, `crypto-js`
- [x] Installed TypeScript types: `@types/dompurify`, `@types/jsonwebtoken`, `@types/crypto-js`
- [x] Ran security audit (`npm audit`)
- [x] Removed unused packages: `next`, `next-auth` (saved ~50MB)
- [x] Created comprehensive security utilities

### Security Utilities Created ✓
- [x] `src/utils/sanitize.ts` - XSS prevention (DOMPurify integration)
- [x] `src/utils/encryption.ts` - Data encryption (AES-256)
- [x] `src/utils/dataMasking.ts` - PII masking for admin panel
- [x] `src/utils/csrf.ts` - CSRF token generation and validation
- [x] `src/utils/rateLimit.ts` - Client-side rate limiting

### Validation Schemas Created ✓
- [x] `src/schemas/product.schema.ts` - Product validation
- [x] `src/schemas/category.schema.ts` - Category validation
- [x] `src/schemas/order.schema.ts` - Order validation
- [x] `src/schemas/admin.schema.ts` - Admin validation

### Backend Security ✓
- [x] `supabase/functions/admin-auth/index.ts` - Secure admin authentication Edge Function
- [x] `supabase/security-schema.sql` - Security database schema
- [x] `src/services/auditLog.ts` - Audit logging service
- [x] `src/services/secureAdminAuth.ts` - Secure admin auth client

---

## 🚀 Next Steps - Implementation Roadmap

### Phase 1: Deploy Security Infrastructure (Next 2 Hours)

#### Step 1: Deploy Database Schema
```bash
# 1. Go to Supabase Dashboard
# 2. Navigate to SQL Editor
# 3. Copy contents of supabase/security-schema.sql
# 4. Execute the SQL

# This creates:
# - admin_refresh_tokens table
# - audit_logs table
# - failed_login_attempts table
# - security_events table
# - csrf_tokens table
# - rate_limit_tracking table
# - Helper functions and RLS policies
```

#### Step 2: Set Up Edge Function Secrets
```bash
# Generate a strong JWT secret
openssl rand -base64 64

# Set the secret in Supabase
supabase secrets set JWT_SECRET=<your-generated-secret>

# Generate encryption key
openssl rand -base64 32

# Add to your .env file (NOT .env.example!)
echo "VITE_ENCRYPTION_KEY=<your-generated-key>" >> .env
```

#### Step 3: Deploy Edge Function
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref mpbszymyubxavjoxhzfm

# Deploy the admin-auth function
supabase functions deploy admin-auth

# Test the function
curl -X POST https://mpbszymyubxavjoxhzfm.supabase.co/functions/v1/admin-auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"admin@example.com","password":"test"}'
```

#### Step 4: Set Up Scheduled Cleanup
```sql
-- In Supabase Dashboard → Database → Extensions
-- Enable pg_cron extension

-- Then in SQL Editor:
SELECT cron.schedule(
  'security-cleanup',
  '0 2 * * *', -- Run at 2 AM daily
  'SELECT run_security_cleanup()'
);
```

---

### Phase 2: Update Frontend to Use Secure Authentication (Next 3 Hours)

#### Step 1: Update Admin Login Page
```typescript
// src/pages/admin/AdminLoginPage.tsx
// Replace current authentication with:

import { secureAdminLogin } from '../../services/secureAdminAuth';
import { checkRateLimit } from '../../utils/rateLimit';

const handleLogin = async (e: FormEvent) => {
  e.preventDefault();
  
  try {
    setLoading(true);
    setError('');
    
    // Check rate limit
    if (!checkRateLimit('ADMIN_LOGIN', email)) {
      setError('Too many login attempts. Please try again in 15 minutes.');
      return;
    }
    
    // Use secure login
    const result = await secureAdminLogin(email, password);
    
    if (!result) {
      setError('Invalid email or password');
      return;
    }
    
    // Redirect to dashboard
    navigate('/admin');
  } catch (error: any) {
    setError(error.message || 'Login failed');
  } finally {
    setLoading(false);
  }
};
```

#### Step 2: Update Admin Auth Guard
```typescript
// src/routes/AdminRoutes.tsx
// Replace AdminAuthGuard with:

import { isAdminAuthenticated } from '../services/secureAdminAuth';

const AdminAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  
  useEffect(() => {
    isAdminAuthenticated().then(setIsAuth);
  }, []);
  
  if (isAuth === null) {
    return <div>Loading...</div>;
  }
  
  if (!isAuth) {
    return <Navigate to="/admin/login" replace />;
  }
  
  return <>{children}</>;
};
```

#### Step 3: Update Admin Service Calls
```typescript
// All admin API calls should use secureAdminFetch
import { secureAdminFetch } from '../services/secureAdminAuth';

// Example:
export async function createProduct(product: Product) {
  const response = await secureAdminFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(product)
  });
  
  return response.json();
}
```

---

### Phase 3: Implement Input Sanitization (Next 2 Hours)

#### Step 1: Sanitize Product Inputs
```typescript
// src/pages/admin/AddProductPage.tsx
import { sanitizeInput, sanitizeHTML } from '../../utils/sanitize';
import { ProductSchema } from '../../schemas/product.schema';

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  try {
    // Sanitize inputs
    const sanitizedData = {
      name: sanitizeInput(productName, 100),
      description: sanitizeHTML(productDescription),
      price: parseFloat(price),
      category: sanitizeInput(category, 50),
      // ... other fields
    };
    
    // Validate with Zod
    const validatedData = ProductSchema.parse(sanitizedData);
    
    // Create product
    await createProduct(validatedData);
  } catch (error) {
    // Handle validation errors
  }
};
```

#### Step 2: Sanitize Display Content
```typescript
// When displaying user-generated content
import { sanitizeHTML } from '../../utils/sanitize';

function ProductDescription({ description }: { description: string }) {
  return (
    <div 
      dangerouslySetInnerHTML={{ 
        __html: sanitizeHTML(description) 
      }} 
    />
  );
}
```

#### Step 3: Add CSRF Protection to Forms
```typescript
// src/pages/admin/AddProductPage.tsx
import { getCSRFToken } from '../../utils/csrf';

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  const csrfToken = getCSRFToken();
  
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify(productData)
  });
};
```

---

### Phase 4: Implement Data Encryption (Next 2 Hours)

#### Step 1: Encrypt Sensitive Address Data
```typescript
// src/services/addressService.ts
import { encryptObjectFields, decryptObjectFields } from '../utils/encryption';

export async function saveAddress(address: Address) {
  // Encrypt sensitive fields before saving
  const encryptedAddress = encryptObjectFields(address, [
    'phone',
    'address_line_1',
    'address_line_2'
  ]);
  
  return await supabase.from('addresses').insert(encryptedAddress);
}

export async function getAddresses(userId: string) {
  const { data } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId);
  
  // Decrypt before returning
  return data?.map(addr => 
    decryptObjectFields(addr, ['phone', 'address_line_1', 'address_line_2'])
  ) || [];
}
```

#### Step 2: Mask Data in Admin Panel
```typescript
// src/pages/admin/CustomersPage.tsx
import { maskEmail, maskPhone } from '../../utils/dataMasking';

function CustomerList({ customers }: { customers: Customer[] }) {
  return (
    <table>
      {customers.map(customer => (
        <tr key={customer.id}>
          <td>{maskEmail(customer.email)}</td>
          <td>{maskPhone(customer.phone)}</td>
          <td>
            <button onClick={() => viewFullDetails(customer.id)}>
              View Full Details
            </button>
          </td>
        </tr>
      ))}
    </table>
  );
}
```

---

### Phase 5: Implement Audit Logging (Next 1 Hour)

#### Step 1: Log Admin Actions
```typescript
// src/services/adminService.ts
import { logAdminAction, withAuditLog } from './auditLog';

export async function createProduct(product: Product) {
  const admin = getCurrentAdmin();
  
  return await withAuditLog(
    async () => {
      const { data } = await supabaseAdmin
        .from('products')
        .insert(product)
        .select()
        .single();
      
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'CREATE',
      resource_type: 'product',
      new_values: product
    }
  );
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const admin = getCurrentAdmin();
  const oldProduct = await getProductById(id);
  
  return await withAuditLog(
    async () => {
      const { data } = await supabaseAdmin
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return data;
    },
    {
      admin_id: admin?.id,
      action: 'UPDATE',
      resource_type: 'product',
      resource_id: id,
      old_values: oldProduct,
      new_values: updates
    }
  );
}
```

---

### Phase 6: Testing & Validation (Next 2 Hours)

#### Security Testing Checklist

**Authentication Tests:**
- [ ] Test login with correct credentials
- [ ] Test login with incorrect credentials
- [ ] Test rate limiting (5 failed attempts)
- [ ] Test account lockout after 5 failures
- [ ] Test token refresh mechanism
- [ ] Test logout functionality
- [ ] Test session expiry (15 minutes)

**Input Validation Tests:**
- [ ] Test XSS prevention (try `<script>alert('xss')</script>`)
- [ ] Test SQL injection prevention
- [ ] Test long input strings (> 1000 chars)
- [ ] Test special characters in inputs
- [ ] Test invalid email formats
- [ ] Test invalid phone numbers

**CSRF Protection Tests:**
- [ ] Test form submission without CSRF token
- [ ] Test form submission with invalid CSRF token
- [ ] Test CSRF token expiry

**Rate Limiting Tests:**
- [ ] Test login rate limit
- [ ] Test API call rate limit
- [ ] Test order creation rate limit

**Data Protection Tests:**
- [ ] Verify sensitive data is encrypted in database
- [ ] Verify data masking in admin panel
- [ ] Test data decryption on retrieval

**Audit Logging Tests:**
- [ ] Verify product creation is logged
- [ ] Verify product update is logged
- [ ] Verify product deletion is logged
- [ ] Verify failed login attempts are logged
- [ ] Verify security events are logged

---

## 📊 Security Metrics to Monitor

### Daily Monitoring
- Failed login attempts count
- Rate limit violations
- Security events (high/critical severity)
- Unusual admin activity patterns

### Weekly Review
- Audit log analysis
- User data access patterns
- API usage patterns
- Database query performance

### Monthly Audit
- Full security audit
- Dependency vulnerability scan
- RLS policy review
- Access control review

---

## 🔧 Troubleshooting

### Issue: Edge Function Not Working
```bash
# Check function logs
supabase functions logs admin-auth

# Redeploy function
supabase functions deploy admin-auth --no-verify-jwt

# Test locally
supabase functions serve admin-auth
```

### Issue: CSRF Token Validation Failing
```typescript
// Clear session storage
sessionStorage.clear();

// Regenerate token
import { generateCSRFToken } from './utils/csrf';
generateCSRFToken();
```

### Issue: Rate Limit Not Working
```typescript
// Clear rate limits
import { rateLimiter } from './utils/rateLimit';
rateLimiter.clearAll();
```

### Issue: Encryption/Decryption Failing
```bash
# Verify encryption key is set
echo $VITE_ENCRYPTION_KEY

# Regenerate key if needed
openssl rand -base64 32
```

---

## 📚 Additional Resources

### Documentation
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Zod Documentation](https://zod.dev/)

### Tools
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [JWT Debugger](https://jwt.io/)
- [OWASP ZAP](https://www.zaproxy.org/)

---

## ✅ Final Checklist Before Production

### Security
- [ ] All service role keys removed from frontend
- [ ] JWT secrets configured in Edge Functions
- [ ] Encryption keys set in environment
- [ ] HTTPS enforced everywhere
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] CSRF protection implemented
- [ ] Input sanitization applied everywhere
- [ ] Audit logging active

### Database
- [ ] Security schema deployed
- [ ] RLS policies enabled
- [ ] Scheduled cleanup jobs configured
- [ ] Backups automated
- [ ] PITR enabled

### Monitoring
- [ ] Security event monitoring set up
- [ ] Audit log review process established
- [ ] Alert system configured
- [ ] Incident response plan documented

### Compliance
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] GDPR compliance reviewed
- [ ] Data retention policy documented

---

## 🎯 Success Criteria

Your security implementation is complete when:

1. ✅ No service role keys in frontend code
2. ✅ Admin authentication uses JWT with HTTP-only cookies
3. ✅ All inputs are sanitized and validated
4. ✅ CSRF protection on all state-changing operations
5. ✅ Rate limiting prevents abuse
6. ✅ Sensitive data is encrypted
7. ✅ All admin actions are logged
8. ✅ Security tests pass
9. ✅ No critical vulnerabilities in npm audit
10. ✅ Documentation is complete

---

**Current Progress: 40% Complete**

**Estimated Time to Complete: 12-15 hours**

**Next Immediate Action:** Deploy security database schema to Supabase

---

Generated: January 29, 2026  
Last Updated: January 29, 2026
