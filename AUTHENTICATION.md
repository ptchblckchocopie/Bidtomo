# Authentication System - JWT Implementation

## Overview

The marketplace now has a complete authentication system using JWT (JSON Web Tokens) for session tracking. Users can register, login, and their authentication state persists across page reloads.

## Features

✅ **User Registration** - Create new accounts with email/password
✅ **User Login** - Authenticate with email/password
✅ **JWT Token Management** - Secure token storage and transmission
✅ **Persistent Sessions** - Stay logged in across page reloads
✅ **Protected Routes** - Automatic redirect for unauthorized access
✅ **Dynamic Navigation** - UI changes based on auth state
✅ **User Roles** - All users can both buy and sell

## How It Works

### 1. Registration Flow

**Page:** `/register`

1. User fills in registration form (name, email, password)
2. Frontend sends POST request to `/api/users`
3. PayloadCMS creates user with role: "seller" (can buy and sell)
4. Upon success, user is automatically logged in
5. JWT token stored in localStorage
6. User redirected to homepage

**Features:**
- Password confirmation validation
- Minimum password length (6 characters)
- Email format validation
- Automatic login after registration
- Error handling with user-friendly messages

### 2. Login Flow

**Page:** `/login`

1. User enters email and password
2. Frontend sends POST to `/api/users/login`
3. Backend validates credentials
4. Returns JWT token and user data
5. Token stored in localStorage
6. User data stored in authStore (Svelte store)
7. User redirected to homepage

**Storage:**
- `localStorage.auth_token` - JWT token
- `localStorage.user_data` - User information (JSON)

### 3. JWT Token Usage

All authenticated API requests include the JWT token in the Authorization header:

```javascript
headers: {
  'Authorization': `JWT ${token}`,
  'Content-Type': 'application/json'
}
```

**Protected Endpoints:**
- `POST /api/products` - Create product
- `POST /api/bids` - Place bid
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### 4. Session Persistence

**On Page Load:**
1. `hooks.client.ts` runs
2. Checks localStorage for `auth_token` and `user_data`
3. If found, initializes authStore with user data
4. User remains logged in

**On Navigation:**
- authStore reactive statements update UI
- Protected routes check `$authStore.isAuthenticated`
- Unauthorized users redirected to login

### 5. Logout Flow

1. User clicks "Logout" button in navigation
2. `apiLogout()` called (sends POST to `/api/users/logout`)
3. `authStore.logout()` clears localStorage
4. Auth store reset to unauthenticated state
5. User redirected to homepage

## File Structure

```
frontend/src/
├── lib/
│   ├── api.ts                    # API functions with JWT headers
│   └── stores/
│       └── auth.ts                # Authentication store
├── routes/
│   ├── +layout.svelte             # Navigation with auth state
│   ├── +layout.ts                 # Layout load function
│   ├── register/
│   │   └── +page.svelte           # Registration page
│   ├── login/
│   │   └── +page.svelte           # Login page (updated)
│   └── sell/
│       └── +page.svelte           # Protected route example
└── hooks.client.ts                # Initialize auth on app load
```

## Authentication Store

**Location:** `src/lib/stores/auth.ts`

### State Shape

```typescript
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'buyer';
}
```

### Methods

```javascript
// Set authentication state
authStore.set({
  isAuthenticated: true,
  user: userData,
  token: jwtToken
});

// Logout (clear state)
authStore.logout();

// Subscribe to changes
$authStore.isAuthenticated
$authStore.user?.name
```

## Protected Routes

Routes that require authentication will redirect unauthorized users to login.

### Example: Sell Page

```svelte
<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/sell');
    }
  });
</script>
```

## Navigation State

The navigation bar dynamically shows different options based on auth state:

### Not Authenticated
- 🏪 Marketplace (logo)
- Browse
- Login
- Register (button)

### Authenticated
- 🏪 Marketplace (logo)
- Browse
- + Sell (green button)
- Hi, {name}!
- Logout (button)

## API Integration

### Updated API Functions

All authenticated requests use `getAuthHeaders()`:

```typescript
// Example: Create Product
const response = await fetch(`${API_URL}/api/products`, {
  method: 'POST',
  headers: getAuthHeaders(),  // Includes JWT token
  credentials: 'include',
  body: JSON.stringify(productData),
});
```

### Helper Functions

```typescript
getAuthToken()        // Get JWT from localStorage
isAuthenticated()     // Check if user is logged in
getAuthHeaders()      // Get headers with JWT for API calls
```

## User Roles

All registered users have the **"seller"** role, which means they can:
- ✅ Browse products
- ✅ Place bids on products
- ✅ Create product listings
- ✅ Manage their own products

**Admin users** (created via PayloadCMS admin panel) have additional privileges:
- ✅ Access admin panel
- ✅ Manage all users
- ✅ Manage all products
- ✅ View all bids

## Usage Guide

### For Users

**1. Register an Account**
1. Go to http://localhost:5173/register
2. Fill in your name, email, and password
3. Click "Create Account"
4. You'll be automatically logged in

**2. Login**
1. Go to http://localhost:5173/login
2. Enter your email and password
3. Click "Login"

**3. Sell a Product**
1. Click "+ Sell" in navigation (only visible when logged in)
2. Fill in product details
3. Submit

**4. Place a Bid**
1. Browse products
2. Click on a product
3. Enter bid amount
4. Click "Place Bid" (requires login)

**5. Logout**
1. Click "Logout" in navigation

### For Developers

**Check Auth State in Components:**
```svelte
<script>
  import { authStore } from '$lib/stores/auth';
</script>

{#if $authStore.isAuthenticated}
  <p>Welcome, {$authStore.user?.name}!</p>
{:else}
  <p><a href="/login">Please login</a></p>
{/if}
```

**Protect a Route:**
```svelte
<script>
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login');
    }
  });
</script>
```

**Make Authenticated API Call:**
```typescript
import { getAuthHeaders } from '$lib/api';

const response = await fetch(`${API_URL}/api/endpoint`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify(data),
});
```

## Security Considerations

### ✅ Implemented
- JWT tokens for stateless authentication
- Secure password hashing (handled by PayloadCMS)
- HTTPS recommended for production
- Token expiration (configured in PayloadCMS)
- Client-side route protection

### 🔒 Best Practices
- Always use HTTPS in production
- Set appropriate JWT expiration times
- Implement refresh token mechanism (future enhancement)
- Use environment variables for secrets
- Validate all user inputs on backend
- Implement rate limiting for login/register

## Troubleshooting

### "Failed to login" or "Registration failed"
- Check that backend is running
- Verify credentials are correct
- Check browser console for errors
- Ensure PayloadCMS is properly configured

### User logged out unexpectedly
- JWT token may have expired
- Check PayloadCMS token expiration settings
- Clear localStorage and login again

### Changes not persisting
- Check browser localStorage is enabled
- Verify token is being saved correctly
- Check browser console for errors

### Protected route not redirecting
- Ensure `onMount` hook is implemented
- Check `$authStore.isAuthenticated` value
- Verify authStore is imported correctly

## Testing

### Manual Testing Checklist

- [ ] Register new user
- [ ] Login with credentials
- [ ] User stays logged in after page refresh
- [ ] Navigation shows correct user name
- [ ] Protected routes redirect when not logged in
- [ ] Can create product when logged in
- [ ] Can place bid when logged in
- [ ] Logout clears session
- [ ] Cannot access protected routes after logout

## Future Enhancements

- [ ] Password reset functionality
- [ ] Email verification
- [ ] Remember me checkbox
- [ ] Refresh token mechanism
- [ ] Social login (Google, Facebook)
- [ ] Two-factor authentication
- [ ] User profile page
- [ ] Change password functionality
- [ ] Session management (view active sessions)

## Summary

The authentication system is now fully functional with:
- ✅ Registration page
- ✅ Login page with JWT
- ✅ Persistent sessions
- ✅ Protected routes
- ✅ Dynamic navigation
- ✅ Secure token management
- ✅ Buy and sell capabilities for all users

Users can now register, login, and access all marketplace features with proper authentication! 🎉
