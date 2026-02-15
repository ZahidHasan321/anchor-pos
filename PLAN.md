# Retail POS & Inventory Management System - Implementation Plan

## Context

Building a clothing-specific POS and inventory system for a Bangladeshi retail store. The client expects an ERP-style interface that's stripped down and fast. This plan is designed to be executed by a less-capable model with explicit code examples, file paths, and error-avoidance guidance.

**Currency:** Bangladeshi Taka (BDT / ৳)
**No signup system** - Admin creates all users.
**Chained-hash audit logging** for tamper-evident change tracking.

### Key Decisions Made

- Chained hashing for audit logs (blockchain-style, each entry hashes previous entry's hash)
- BDT (৳) currency, store info configurable from admin settings
- Dark/Light theme toggle only (no full theme editor)
- Text-only thermal receipts, full barcode labels (name + size + price + barcode)
- Full user management: create, reset password, toggle active/inactive, change roles
- Audit log viewer: admin-only access

---

## Progress Tracker

> **INSTRUCTIONS FOR IMPLEMENTING MODEL:** After completing each phase, update this section by changing `[ ]` to `[x]`. Run `pnpm check` after EVERY phase and fix ALL errors before moving on.

- [x] **Phase 1:** Foundation & Authentication
- [x] **Phase 2:** Inventory Management
- [x] **Phase 3:** Point of Sale (POS)
- [x] **Phase 4:** Reporting & Cashbook
- [x] **Phase 5:** Audit Logging & Store Settings

---

## Global Rules (READ BEFORE EVERY PHASE)

### Svelte 5 Rules - NEVER BREAK THESE

```svelte
<!-- WRONG - DO NOT USE -->
<script>
  export let name;              // WRONG: old Svelte 4 syntax
  $: doubled = count * 2;       // WRONG: old reactive syntax
  const dispatch = createEventDispatcher(); // WRONG
</script>

<!-- CORRECT - ALWAYS USE -->
<script lang="ts">
  let { name } = $props();           // Props via $props()
  let count = $state(0);              // Reactive state via $state
  const doubled = $derived(count * 2); // Derived values via $derived
  // Pass callback props instead of events: onSave, onDelete, etc.
</script>
```

### File Extension Rules

| What               | Extension    | Why                               |
| ------------------ | ------------ | --------------------------------- |
| Regular TypeScript | `.ts`        | No runes allowed                  |
| Svelte components  | `.svelte`    | Runes allowed                     |
| Reactive stores    | `.svelte.ts` | Runes allowed in .svelte.ts files |

**CRITICAL:** `$state` and `$derived` can ONLY be used in `.svelte` or `.svelte.ts` files. Using them in `.ts` files causes errors.

### Drizzle ORM Rules

```typescript
// CORRECT: better-sqlite3 is SYNCHRONOUS - no await needed for queries
const user = db.select().from(users).where(eq(users.id, id)).get(); // Single row
const allUsers = db.select().from(users).all(); // Multiple rows
db.insert(users).values({ id: '...', name: '...' }).run(); // Insert
db.update(users).set({ name: 'New' }).where(eq(users.id, id)).run(); // Update
db.delete(users).where(eq(users.id, id)).run(); // Delete

// CORRECT: Transaction (also synchronous with better-sqlite3)
db.transaction((tx) => {
	tx.insert(orders).values(orderData).run();
	tx.insert(orderItems).values(itemsData).run();
	tx.update(productVariants)
		.set({ stockQuantity: sql`stock_quantity - ${qty}` })
		.where(eq(productVariants.id, vid))
		.run();
});
// WRONG: DO NOT use async/await with better-sqlite3 transactions
// db.transaction(async (tx) => { await tx.insert... })  // WRONG!
```

### SvelteKit Form Actions Pattern

```typescript
// src/routes/example/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Load data for the page
	return { items: [] };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();

		// Validation - return fail() with errors
		if (!name) {
			return fail(400, { errors: { name: 'Name is required' } });
		}

		// Do the thing...
		return { success: true };
	}
};
```

```svelte
<!-- Form in the .svelte file -->
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	$effect(() => {
		if (form?.success) {
			toast.success('Created!');
		}
	});
</script>

<form method="POST" action="?/create" use:enhance>
	<input name="name" />
	{#if form?.errors?.name}
		<p class="text-sm text-destructive">{form.errors.name}</p>
	{/if}
	<button type="submit" class="cursor-pointer">Create</button>
</form>
```

### UI Rules

- **ALL clickable elements** must have `class="cursor-pointer"` (buttons, links, interactive elements)
- **ALL forms** must have `use:enhance` to prevent full page reloads
- **ALL password fields** must have a visibility toggle button (eye icon)
- **ALL loading states** should show a spinner or disabled state on buttons
- **ALL destructive actions** (delete, deactivate) must have a confirmation step
- **Toast notifications** for success/error feedback using `svelte-sonner`
- **Inline validation** messages below form fields using `text-sm text-destructive`

### Adding shadcn Components

```bash
# ALWAYS install components BEFORE importing them
# Use the @next tag for Svelte 5 compatibility
pnpm dlx shadcn-svelte@next add button
pnpm dlx shadcn-svelte@next add input
pnpm dlx shadcn-svelte@next add label
# etc.
```

### ID Generation Helper

Add to `src/lib/utils.ts`:

```typescript
export function generateId(): string {
	return crypto.randomUUID();
}
```

### Currency Formatting Helper

Create `src/lib/format.ts`:

```typescript
export function formatBDT(amount: number): string {
	return `৳${amount.toFixed(2)}`;
}

export function formatDateTime(date: Date | number): string {
	const d = typeof date === 'number' ? new Date(date) : date;
	return d.toLocaleString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
```

---

## Phase 1: Foundation & Authentication

### Step 1.0: Install Required shadcn Components

```bash
pnpm dlx shadcn-svelte@next add button input label card sonner separator badge dropdown-menu avatar sheet scroll-area dialog select textarea switch tooltip
```

Then install `svelte-sonner` for toast notifications:

```bash
pnpm add svelte-sonner
```

### Step 1.1: Extend Database Schema

**File:** `src/lib/server/db/schema.ts`

Add these columns/tables to the EXISTING schema:

1. Add `isActive` column to the `user` table:

```typescript
isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
theme: text('theme').default('system'), // 'light', 'dark', 'system'
```

2. Add `storeSettings` table:

```typescript
export const storeSettings = sqliteTable('store_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
```

3. Add `auditLogs` table:

```typescript
export const auditLogs = sqliteTable('audit_log', {
	id: text('id').primaryKey(),
	userId: text('user_id'),
	userName: text('user_name').notNull(),
	action: text('action').notNull(), // e.g., 'CREATE_USER', 'LOGIN', 'ADJUST_STOCK'
	entity: text('entity').notNull(), // e.g., 'user', 'product', 'order'
	entityId: text('entity_id'),
	details: text('details'),
	previousHash: text('previous_hash').notNull(),
	hash: text('hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
```

4. Add missing columns to `orders` table for receipt reprinting:

```typescript
discountAmount: real('discount_amount').default(0),
cashReceived: real('cash_received'),
changeGiven: real('change_given'),
```

5. Add columns to `orderItems` for denormalized display:

```typescript
productName: text('product_name').notNull(),
variantLabel: text('variant_label').notNull(),  // e.g., "M / Black"
```

After editing schema, run:

```bash
pnpm db:push
```

### Step 1.2: Create Auth Module

**File:** `src/lib/server/auth.ts`

```typescript
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashPassword(password: string): string {
	// Simple SHA-256 hash (for production, use bcrypt/argon2)
	return encodeHexLowerCase(sha256(new TextEncoder().encode(password)));
}

export function verifyPassword(password: string, hash: string): boolean {
	return hashPassword(password) === hash;
}

export function createSession(token: string, userId: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	db.insert(sessions)
		.values({
			id: sessionId,
			userId,
			expiresAt: Math.floor(expiresAt.getTime() / 1000)
		})
		.run();

	return { id: sessionId, userId, expiresAt };
}

export function validateSessionToken(token: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

	const result = db
		.select({
			sessionId: sessions.id,
			userId: sessions.userId,
			expiresAt: sessions.expiresAt,
			userName: users.name,
			userRole: users.role,
			username: users.username,
			isActive: users.isActive,
			theme: users.theme
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.get();

	if (!result) return { session: null, user: null };

	// Check if user is deactivated
	if (!result.isActive) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	const now = Math.floor(Date.now() / 1000);
	if (result.expiresAt <= now) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	// Extend session if within 15 days of expiry
	if (result.expiresAt - now < 15 * 24 * 60 * 60) {
		const newExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
		db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId)).run();
	}

	return {
		session: { id: result.sessionId, userId: result.userId, expiresAt: result.expiresAt },
		user: {
			id: result.userId,
			name: result.userName,
			username: result.username,
			role: result.userRole as 'admin' | 'manager' | 'sales',
			theme: result.theme as 'light' | 'dark' | 'system'
		}
	};
}

export function invalidateSession(sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/'
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/'
	});
}
```

### Step 1.3: Update App Types

**File:** `src/app.d.ts`

```typescript
declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				name: string;
				username: string;
				role: 'admin' | 'manager' | 'sales';
				theme: 'light' | 'dark' | 'system';
			} | null;
			session: {
				id: string;
				userId: string;
				expiresAt: number;
			} | null;
		}
	}
}

export {};
```

### Step 1.4: Server Hooks

**File:** `src/hooks.server.ts`

```typescript
import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = validateSessionToken(token);
		event.locals.user = user;
		event.locals.session = session;
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Inject theme class onto <html> element
			const theme = event.locals.user?.theme ?? 'system';
			if (theme === 'dark') {
				return html.replace('<html lang="en">', '<html lang="en" class="dark">');
			}
			return html;
		}
	});

	return response;
};
```

### Step 1.5: Root Layout Update

**File:** `src/routes/+layout.server.ts`

```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
	};
};
```

**File:** `src/routes/+layout.svelte` (update existing)

```svelte
<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from 'svelte-sonner';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster richColors position="top-right" />
{@render children()}
```

### Step 1.6: Login Page

**File:** `src/routes/(auth)/login/+page.server.ts`

```typescript
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	verifyPassword,
	generateSessionToken,
	createSession,
	setSessionTokenCookie
} from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		// Smart redirect based on role
		if (locals.user.role === 'sales') redirect(302, '/pos');
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const username = (data.get('username') as string)?.trim();
		const password = data.get('password') as string;

		if (!username || !password) {
			return fail(400, { error: 'Username and password are required', username });
		}

		const user = db.select().from(users).where(eq(users.username, username)).get();

		if (!user) {
			return fail(400, { error: 'Invalid username or password', username });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Your account has been deactivated. Contact admin.', username });
		}

		if (!verifyPassword(password, user.passwordHash)) {
			return fail(400, { error: 'Invalid username or password', username });
		}

		const token = generateSessionToken();
		const session = createSession(token, user.id);
		setSessionTokenCookie(event, token, new Date(session.expiresAt * 1000));

		// Smart redirect based on role
		if (user.role === 'sales') redirect(302, '/pos');
		redirect(302, '/dashboard');
	}
};
```

**File:** `src/routes/(auth)/login/+page.svelte`

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Eye, EyeOff } from '@lucide/svelte';

	let { form } = $props();
	let showPassword = $state(false);
	let loading = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl font-bold">Welcome Back</Card.Title>
			<Card.Description>Sign in to your account</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				{#if form?.error}
					<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
						{form.error}
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input
						id="username"
						name="username"
						value={form?.username ?? ''}
						placeholder="Enter your username"
						required
						autocomplete="username"
					/>
				</div>

				<div class="space-y-2">
					<Label for="password">Password</Label>
					<div class="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="Enter your password"
							required
							autocomplete="current-password"
							class="pr-10"
						/>
						<button
							type="button"
							class="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
							onclick={() => (showPassword = !showPassword)}
							tabindex={-1}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<Button type="submit" class="w-full cursor-pointer" disabled={loading}>
					{loading ? 'Signing in...' : 'Sign In'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
```

### Step 1.7: App Layout (Protected Routes Shell)

**File:** `src/routes/(app)/+layout.server.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// RBAC: Sales can only access /pos, /orders, /customers
	const salesAllowed = ['/pos', '/orders', '/customers'];
	if (locals.user.role === 'sales') {
		const isAllowed = salesAllowed.some((path) => url.pathname.startsWith(path));
		if (!isAllowed && url.pathname !== '/') {
			redirect(302, '/pos');
		}
	}

	return { user: locals.user };
};
```

**File:** `src/routes/(app)/+layout.svelte`

This is the app shell with sidebar navigation. Include:

- Sidebar with nav links based on user role
- Header with user info and theme toggle
- Logout button
- Use `Sheet` component for mobile sidebar

Key navigation items:

- **Admin/Manager:** Dashboard, Inventory, POS, Orders, Customers, Cashbook, Settings
- **Sales:** POS, Orders, Customers

The theme toggle button:

```svelte
<script lang="ts">
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { data, children } = $props();

	// Theme toggle - posts to a server action to save preference
	async function setTheme(theme: 'light' | 'dark' | 'system') {
		await fetch('/api/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ theme })
		});
		// Apply immediately client-side
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else if (theme === 'light') {
			document.documentElement.classList.remove('dark');
		} else {
			// System preference
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', prefersDark);
		}
	}
</script>
```

**File:** `src/routes/api/theme/+server.ts` (Theme API endpoint)

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { theme } = await request.json();
	if (!['light', 'dark', 'system'].includes(theme)) {
		return json({ error: 'Invalid theme' }, { status: 400 });
	}

	db.update(users).set({ theme }).where(eq(users.id, locals.user.id)).run();
	return json({ success: true });
};
```

### Step 1.8: Logout Action

**File:** `src/routes/(auth)/logout/+page.server.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/server/auth';

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) {
			invalidateSession(event.locals.session.id);
		}
		deleteSessionTokenCookie(event);
		redirect(302, '/login');
	}
};
```

### Step 1.9: Seed Script for Admin User

**File:** `src/lib/server/seed.ts`

```typescript
import { db } from './db';
import { users } from './db/schema';
import { hashPassword } from './auth';
import { generateId } from '$lib/utils';

export function seedAdmin() {
	const existing = db.select().from(users).get();
	if (existing) return; // Already seeded

	db.insert(users)
		.values({
			id: generateId(),
			username: 'admin',
			passwordHash: hashPassword('admin123'),
			role: 'admin',
			name: 'Administrator',
			isActive: true,
			theme: 'system'
		})
		.run();

	console.log('Admin user seeded: admin / admin123');
}
```

Call `seedAdmin()` from `src/lib/server/db/index.ts` after DB initialization:

```typescript
import { seedAdmin } from '../seed';
// ... after db initialization ...
seedAdmin();
```

### Step 1.10: User Management Page (Admin Only)

**File:** `src/routes/(app)/settings/users/+page.server.ts`

Actions needed: `create`, `toggleActive`, `changeRole`, `resetPassword`

Each action must:

1. Check `locals.user.role === 'admin'` or return `fail(403)`
2. Validate inputs
3. Perform the DB operation
4. Return success/error

**Password visibility toggle pattern** (reuse in create user form):

```svelte
<div class="relative">
	<Input
		name="password"
		type={showPassword ? 'text' : 'password'}
		placeholder="Enter password"
		required
		class="pr-10"
	/>
	<button
		type="button"
		class="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
		onclick={() => (showPassword = !showPassword)}
		tabindex={-1}
	>
		{#if showPassword}
			<EyeOff class="h-4 w-4" />
		{:else}
			<Eye class="h-4 w-4" />
		{/if}
	</button>
</div>
```

User management table columns: Name, Username, Role (editable dropdown), Status (active/inactive toggle), Actions (Reset Password).

### Step 1.11: Root Page Redirect

**File:** `src/routes/+page.server.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.role === 'sales') redirect(302, '/pos');
	redirect(302, '/dashboard');
};
```

### Phase 1 Verification

1. Run `pnpm db:push` - schema applied to SQLite
2. Run `pnpm dev` - app starts without errors
3. Navigate to `/login` - see login form with password visibility toggle
4. Login with `admin / admin123` - redirected to `/dashboard`
5. Navigate to `/settings/users` - see user management page
6. Create a new sales user - verify they can login and get redirected to `/pos`
7. Deactivate a user - verify they cannot log in
8. Theme toggle works (light/dark/system)
9. **Run `pnpm check` - MUST pass with ZERO errors before proceeding**

---

## Phase 2: Inventory Management

### Step 2.0: Install Additional Component

```bash
pnpm dlx shadcn-svelte@next add table
pnpm add jsbarcode
```

### Step 2.1: Product List Page

**File:** `src/routes/(app)/inventory/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, sql, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin and manager can access inventory
	if (locals.user?.role === 'sales') {
		redirect(302, '/pos');
	}

	const productList = db
		.select({
			id: products.id,
			name: products.name,
			category: products.category,
			basePrice: products.basePrice,
			defaultDiscount: products.defaultDiscount,
			totalStock: sql<number>`coalesce(sum(${productVariants.stockQuantity}), 0)`.as('total_stock'),
			variantCount: sql<number>`count(${productVariants.id})`.as('variant_count')
		})
		.from(products)
		.leftJoin(productVariants, eq(products.id, productVariants.productId))
		.groupBy(products.id)
		.orderBy(desc(products.id))
		.all();

	return { products: productList };
};
```

**File:** `src/routes/(app)/inventory/+page.svelte`

Data table with columns: Name, Category, Base Price (in ৳), Variants, Total Stock, Actions (Edit, Delete).
Include "New Product" button linking to `/inventory/new`.
Include search/filter by category.

### Step 2.2: Create/Edit Product Page

**File:** `src/routes/(app)/inventory/new/+page.server.ts` and `src/routes/(app)/inventory/[id]/edit/+page.server.ts`

The create product form must include:

1. **Basic fields:** Name, Description, Category, Base Price, Default Discount (%)
2. **Size Template Selector:**
   ```typescript
   const SIZE_TEMPLATES = {
   	alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
   	numeric: ['36', '38', '40', '42', '44', '46', '48', '50']
   };
   ```
3. **Size Selection:** After choosing template, show checkboxes for each size. User picks which sizes to create variants for.
4. **Color:** Optional text input.
5. **Auto-generated barcodes:** Format: `{CATEGORY_PREFIX}-{PRODUCT_ID_SHORT}-{SIZE}` e.g., `SHT-A1B2-M`

**Form action pattern:**

```typescript
export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const category = (data.get('category') as string)?.trim();
		const basePrice = parseFloat(data.get('basePrice') as string);
		const defaultDiscount = parseFloat(data.get('defaultDiscount') as string) || 0;
		const description = (data.get('description') as string)?.trim() || null;
		const sizes = data.getAll('sizes') as string[]; // From checkboxes
		const color = (data.get('color') as string)?.trim() || null;

		// Validation
		if (!name) return fail(400, { errors: { name: 'Product name is required' } });
		if (!category) return fail(400, { errors: { category: 'Category is required' } });
		if (isNaN(basePrice) || basePrice <= 0)
			return fail(400, { errors: { basePrice: 'Valid price required' } });
		if (sizes.length === 0) return fail(400, { errors: { sizes: 'Select at least one size' } });

		const productId = generateId();
		const shortId = productId.substring(0, 4).toUpperCase();
		const catPrefix = category.substring(0, 3).toUpperCase();

		db.transaction((tx) => {
			tx.insert(products)
				.values({
					id: productId,
					name,
					description,
					category,
					basePrice,
					defaultDiscount
				})
				.run();

			for (const size of sizes) {
				const variantId = generateId();
				const barcode = `${catPrefix}-${shortId}-${size}${color ? '-' + color.substring(0, 3).toUpperCase() : ''}`;

				tx.insert(productVariants)
					.values({
						id: variantId,
						productId,
						size,
						color,
						barcode,
						stockQuantity: 0
					})
					.run();
			}
		});

		redirect(302, `/inventory/${productId}`);
	}
};
```

### Step 2.3: Product Detail Page with Stock Adjustment

**File:** `src/routes/(app)/inventory/[id]/+page.server.ts`

Load product with all variants. Actions: `adjustStock`, `deleteProduct`

**Stock adjustment action:**

```typescript
adjustStock: async ({ request, locals }) => {
	const data = await request.formData();
	const variantId = data.get('variantId') as string;
	const amount = parseInt(data.get('amount') as string);
	const reason = data.get('reason') as string;

	if (!variantId || isNaN(amount) || amount === 0) {
		return fail(400, { stockError: 'Valid variant and amount required' });
	}
	if (!['restock', 'return', 'damage', 'theft', 'correction'].includes(reason)) {
		return fail(400, { stockError: 'Valid reason required' });
	}

	db.transaction((tx) => {
		// Update stock
		tx.update(productVariants)
			.set({ stockQuantity: sql`stock_quantity + ${amount}` })
			.where(eq(productVariants.id, variantId))
			.run();

		// Log the change
		tx.insert(stockLogs)
			.values({
				id: generateId(),
				variantId,
				changeAmount: amount,
				reason,
				userId: locals.user!.id,
				createdAt: new Date()
			})
			.run();
	});

	return { stockSuccess: true };
};
```

The stock adjustment UI should be a dialog/modal with:

- Variant selector (dropdown)
- Amount input (positive for stock in, negative for stock out)
- Reason selector (dropdown: Restock, Return, Damage, Theft, Correction)

### Step 2.4: Barcode Label Printing

**File:** `src/routes/(app)/inventory/[id]/labels/+page.svelte`

Uses `JsBarcode` library to generate CODE128 barcodes. Labels are 2x1 inch (50.8mm x 25.4mm) for standard label printers.

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatBDT } from '$lib/format';
	import { Printer } from '@lucide/svelte';

	let { data } = $props();
	let labelContainer: HTMLDivElement;

	onMount(async () => {
		// JsBarcode must be imported dynamically (browser only)
		const JsBarcode = (await import('jsbarcode')).default;
		const svgs = labelContainer.querySelectorAll('.barcode-svg');
		svgs.forEach((svg, i) => {
			JsBarcode(svg, data.variants[i].barcode, {
				format: 'CODE128',
				width: 1.5,
				height: 40,
				displayValue: true,
				fontSize: 10,
				margin: 2
			});
		});
	});

	function printLabels() {
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;
		printWindow.document.write(`<!DOCTYPE html><html><head>
<style>
  @page { size: 50.8mm 25.4mm; margin: 0; }
  body { margin: 0; padding: 0; }
  .label {
    width: 50.8mm; height: 25.4mm;
    padding: 1.5mm; box-sizing: border-box;
    page-break-after: always;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: Arial, sans-serif;
  }
  .label:last-child { page-break-after: auto; }
  .product-name { font-size: 8px; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .variant-info { font-size: 7px; text-align: center; }
  .price { font-size: 9px; font-weight: bold; margin-top: 1mm; }
  svg { max-width: 44mm; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>${labelContainer.innerHTML}</body>
<script>window.onload=function(){window.print();}<\/script></html>`);
		printWindow.document.close();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold">Barcode Labels - {data.product.name}</h2>
		<Button onclick={printLabels} class="cursor-pointer">
			<Printer class="mr-2 h-4 w-4" /> Print Labels
		</Button>
	</div>

	<div bind:this={labelContainer} class="flex flex-wrap gap-4">
		{#each data.variants as variant}
			<div class="label rounded border p-2" style="width: 50.8mm; height: 25.4mm;">
				<div class="product-name">{data.product.name}</div>
				<svg class="barcode-svg"></svg>
				<div class="variant-info">
					Size: {variant.size}{variant.color ? ` | Color: ${variant.color}` : ''}
				</div>
				<div class="price">{formatBDT(variant.priceOverride ?? data.product.basePrice)}</div>
			</div>
		{/each}
	</div>
</div>
```

### Phase 2 Verification

1. Navigate to `/inventory` - see product list (empty initially)
2. Click "New Product" - see create form with size template selector
3. Select "Alpha" template - see checkboxes for XXS through 6XL
4. Create a product with sizes S, M, L - see it in the list with 3 variants
5. Click into product - see all variants with stock quantities
6. Adjust stock (+10 for Restock) - stock updates, log recorded
7. Navigate to labels page - barcodes render correctly
8. Print labels - opens print window with 2x1 inch labels
9. **Run `pnpm check` - MUST pass with ZERO errors**

---

## Phase 3: Point of Sale (POS)

### Step 3.0: Create Cart Store

**File:** `src/lib/stores/cart.svelte.ts` (MUST be `.svelte.ts` for runes!)

```typescript
type CartItem = {
	variantId: string;
	productId: string;
	productName: string;
	size: string;
	color: string | null;
	barcode: string;
	price: number;
	discount: number;
	quantity: number;
	maxStock: number;
};

type CustomerInfo = {
	id: string;
	name: string;
	phone: string | null;
} | null;

function createCart() {
	let items = $state<CartItem[]>([]);
	let customer = $state<CustomerInfo>(null);
	let paymentMethod = $state<'cash' | 'card'>('cash');
	let cashReceived = $state(0);
	let globalDiscount = $state(0);

	const subtotal = $derived(
		items.reduce((sum, item) => {
			const linePrice = item.price * item.quantity;
			const lineDiscount = linePrice * (item.discount / 100);
			return sum + (linePrice - lineDiscount);
		}, 0) *
			(1 - globalDiscount / 100)
	);

	const totalItems = $derived(items.reduce((sum, item) => sum + item.quantity, 0));
	const changeAmount = $derived(Math.max(0, cashReceived - subtotal));

	return {
		get items() {
			return items;
		},
		get customer() {
			return customer;
		},
		get paymentMethod() {
			return paymentMethod;
		},
		set paymentMethod(v: 'cash' | 'card') {
			paymentMethod = v;
		},
		get cashReceived() {
			return cashReceived;
		},
		set cashReceived(v: number) {
			cashReceived = v;
		},
		get globalDiscount() {
			return globalDiscount;
		},
		set globalDiscount(v: number) {
			globalDiscount = v;
		},
		get subtotal() {
			return subtotal;
		},
		get totalItems() {
			return totalItems;
		},
		get changeAmount() {
			return changeAmount;
		},

		addItem(item: Omit<CartItem, 'quantity'>) {
			const existing = items.find((i) => i.variantId === item.variantId);
			if (existing) {
				if (existing.quantity < existing.maxStock) {
					existing.quantity += 1;
				}
			} else {
				items.push({ ...item, quantity: 1 });
			}
		},

		removeItem(variantId: string) {
			items = items.filter((i) => i.variantId !== variantId);
		},

		updateQuantity(variantId: string, qty: number) {
			const item = items.find((i) => i.variantId === variantId);
			if (!item) return;
			if (qty <= 0) {
				items = items.filter((i) => i.variantId !== variantId);
			} else if (qty <= item.maxStock) {
				item.quantity = qty;
			}
		},

		updateItemDiscount(variantId: string, discount: number) {
			const item = items.find((i) => i.variantId === variantId);
			if (item) item.discount = Math.max(0, Math.min(100, discount));
		},

		setCustomer(c: CustomerInfo) {
			customer = c;
		},

		clear() {
			items = [];
			customer = null;
			paymentMethod = 'cash';
			cashReceived = 0;
			globalDiscount = 0;
		}
	};
}

export const cart = createCart();
```

### Step 3.1: POS Page Server

**File:** `src/routes/(app)/pos/+page.server.ts`

Load: Fetch all variants (with product info) that have stock > 0, and all customers. Also load store settings for receipt.

Checkout action: Inside a `db.transaction()`:

1. Create the order record
2. Create order item records (with denormalized productName and variantLabel)
3. Deduct stock from each variant
4. Create stock log entries (reason: 'sale')
5. Create cashbook 'in' entry for the sale total
6. Return `{ success: true, orderId, changeGiven }`

Customer quick-add action: Insert into customers table, return the new customer.

### Step 3.2: POS Page UI

**File:** `src/routes/(app)/pos/+page.svelte`

Split-screen layout:

- **Left (2/3):** Search bar (auto-focused) + Product grid (clickable cards showing name, size, price, stock badge)
- **Right (1/3):** Cart panel with items list, quantity controls (+/-), trash icon to remove, subtotal, global discount input, "Charge" button

**Barcode scanning:** Global `keydown` listener that buffers fast keypresses (barcode scanners type fast then press Enter). If buffer length > 3 on Enter, look up the barcode.

```typescript
// Barcode scanning logic in $effect
let barcodeBuffer = $state('');
let barcodeTimeout: ReturnType<typeof setTimeout>;

$effect(() => {
	if (!browser) return;

	function handleKeydown(e: KeyboardEvent) {
		// Skip if user is typing in an input field
		const target = e.target as HTMLElement;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

		if (e.key === 'Enter' && barcodeBuffer.length > 3) {
			const variant = data.products.find((p) => p.barcode === barcodeBuffer);
			if (variant) {
				handleAddToCart(variant);
				playBeep(); // Audio feedback
			} else {
				toast.error('Product not found: ' + barcodeBuffer);
			}
			barcodeBuffer = '';
			return;
		}

		if (e.key.length === 1) {
			barcodeBuffer += e.key;
			clearTimeout(barcodeTimeout);
			barcodeTimeout = setTimeout(() => {
				barcodeBuffer = '';
			}, 100);
		}
	}

	window.addEventListener('keydown', handleKeydown);
	return () => window.removeEventListener('keydown', handleKeydown);
});
```

**Audio beep on scan:**

```typescript
function playBeep() {
	try {
		const ctx = new AudioContext();
		const osc = ctx.createOscillator();
		osc.frequency.value = 1200;
		osc.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + 0.1);
	} catch {
		/* ignore audio errors */
	}
}
```

**Checkout dialog:** Payment method toggle (Cash/Card), cash received input with quick amount buttons (৳100, ৳500, ৳1000, ৳2000, Exact), change display, confirm button.

**IMPORTANT FIX:** When checkout succeeds, snapshot the cart data BEFORE calling `cart.clear()` so the receipt can be printed. Store in `completedOrder` state:

```typescript
let completedOrder = $state<{
	orderId: string;
	changeGiven: number;
	items: typeof cart.items;
	total: number;
	cashReceived: number;
} | null>(null);

// In the success $effect:
$effect(() => {
	if (form?.success && form?.orderId) {
		completedOrder = {
			orderId: form.orderId,
			changeGiven: form.changeGiven ?? 0,
			items: [...cart.items], // snapshot BEFORE clearing
			total: cart.subtotal,
			cashReceived: cart.cashReceived
		};
		cart.clear();
		checkoutOpen = false;
		toast.success('Sale completed!');
	}
});
```

### Step 3.3: Thermal Receipt Printing

**Receipt format** (80mm thermal paper, monospace font, industrial POS standard):

```typescript
function printReceipt() {
	if (!completedOrder) return;
	const o = completedOrder;
	const pw = window.open('', '_blank', 'width=350,height=600');
	if (!pw) return;

	const store = data.storeSettings; // loaded from storeSettings table

	const itemsHtml = o.items
		.map((item) => {
			const lineTotal = item.price * item.quantity * (1 - item.discount / 100);
			return `<tr>
      <td>${item.productName} (${item.size})</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${lineTotal.toFixed(2)}</td>
    </tr>`;
		})
		.join('');

	pw.document.write(`<!DOCTYPE html>
<html><head><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    width: 80mm;
    margin: 0 auto;
    padding: 3mm;
    color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .store-name { font-size: 16px; font-weight: bold; }
  .total-line { font-size: 14px; font-weight: bold; }
  @media print {
    body { width: 80mm; }
    @page { margin: 0; }
  }
</style></head><body>
  <div class="center">
    <div class="store-name">${store.store_name ?? 'Store'}</div>
    <div>${store.store_address ?? ''}</div>
    <div>${store.store_phone ?? ''}</div>
  </div>
  <div class="line"></div>
  <div>Order: #${o.orderId.substring(0, 8).toUpperCase()}</div>
  <div>Date: ${new Date().toLocaleString('en-GB')}</div>
  <div>Cashier: ${data.user?.name ?? ''}</div>
  <div class="line"></div>
  <table>
    <tr class="bold">
      <td>Item</td>
      <td style="text-align:center">Qty</td>
      <td style="text-align:right">Amount</td>
    </tr>
    ${itemsHtml}
  </table>
  <div class="line"></div>
  <table>
    <tr class="total-line">
      <td>TOTAL</td>
      <td style="text-align:right">BDT ${o.total.toFixed(2)}</td>
    </tr>
    <tr><td>Cash</td><td style="text-align:right">BDT ${o.cashReceived.toFixed(2)}</td></tr>
    <tr><td>Change</td><td style="text-align:right">BDT ${o.changeGiven.toFixed(2)}</td></tr>
  </table>
  <div class="line"></div>
  <div class="center">${store.receipt_footer ?? 'Thank you for shopping with us!'}</div>
  <div class="center" style="margin-top:4px;font-size:10px">*** End of Receipt ***</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
	pw.document.close();
}
```

### Phase 3 Verification

1. POS page loads with product grid on left, cart on right
2. Clicking a product adds it to cart
3. Barcode scanning works (type fast + Enter in a non-input area)
4. Quantity +/- works, respects max stock
5. Customer quick-add dialog works
6. Checkout with cash shows change calculation with quick amount buttons
7. After checkout, receipt prints in new window with proper 80mm thermal layout
8. After checkout, cart clears and success dialog shows with reprint option
9. Global discount and line-item discounts both work correctly
10. **Run `pnpm check` - MUST pass with ZERO errors**

---

## Phase 4: Reporting & Cashbook

### Step 4.1: Dashboard Page

**File:** `src/routes/(app)/dashboard/+page.server.ts`

Load aggregated data:

- Today's sales (count + total)
- Monthly sales (count + total)
- Today's expenses total
- Low stock items (stock < 10)
- Recent 10 orders
- Daily sales for last 7 days (for bar chart)

Use `sql` template from drizzle for aggregations like `coalesce(sum(...), 0)`.

**File:** `src/routes/(app)/dashboard/+page.svelte`

Layout:

- 4 summary cards at top (Today Sales, Monthly Sales, Today Expenses, Low Stock Alerts)
- Simple HTML bar chart for last 7 days sales (no chart library needed)
- Two tables side by side: Low Stock Items + Recent Orders

### Step 4.2: Cashbook Page

**File:** `src/routes/(app)/cashbook/+page.server.ts`

Load: Daily entries filtered by date parameter. Compute totalIn, totalOut, netCash.
Action: `addExpense` - records a cashbook 'out' entry.

**File:** `src/routes/(app)/cashbook/+page.svelte`

Layout:

- Date picker to filter by day
- 3 summary cards: Cash In (green), Cash Out (red), Net Cash
- "Add Expense" button with inline form (description + amount)
- Entries table with columns: Description, By, Type (badge), Amount, Time

### Step 4.3: Sales History (Orders) Page

**File:** `src/routes/(app)/orders/+page.server.ts` and `+page.svelte`

List all orders with date filter. Sales users only see their own orders. Columns: Order ID, Customer, Cashier, Payment, Amount, Status, Date. Click through to order detail.

### Step 4.4: Order Detail Page

**File:** `src/routes/(app)/orders/[id]/+page.server.ts` and `+page.svelte`

Show order details + items table + reprint receipt button. Load store settings for receipt printing.

### Step 4.5: Customers Page

**File:** `src/routes/(app)/customers/+page.server.ts` and `+page.svelte`

List all customers with order count and total spent (computed via subquery). Actions: Create customer, delete customer. Include purchase history drill-down.

### Phase 4 Verification

1. Dashboard shows correct summary cards and bar chart
2. Cashbook entries filter by date correctly
3. Adding expenses works and updates totals
4. Orders list shows with date filter
5. Order detail has working reprint receipt button
6. Customers page shows order stats
7. **Run `pnpm check` - MUST pass with ZERO errors**

---

## Phase 5: Audit Logging & Store Settings

### Step 5.1: Audit Logging Module (Chained Hashing)

**File:** `src/lib/server/audit.ts`

How chained hashing works:

1. The FIRST audit entry uses a known genesis hash: `"0000...0000"` (64 zeros)
2. Each subsequent entry: `hash = SHA256(userId|userName|action|entity|entityId|details|previousHash|timestamp)`
3. The `previousHash` field stores the hash of the entry before it
4. If ANYONE edits a past entry, the chain breaks because hashes won't match

```typescript
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { db } from './db';
import { auditLogs } from './db/schema';
import { desc } from 'drizzle-orm';
import { generateId } from '$lib/utils';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeHash(data: {
	userId: string | null;
	userName: string;
	action: string;
	entity: string;
	entityId: string | null;
	details: string | null;
	previousHash: string;
	createdAt: number;
}): string {
	const payload = [
		data.userId ?? '',
		data.userName,
		data.action,
		data.entity,
		data.entityId ?? '',
		data.details ?? '',
		data.previousHash,
		String(data.createdAt)
	].join('|');
	return encodeHexLowerCase(sha256(new TextEncoder().encode(payload)));
}

export function logAuditEvent(params: {
	userId: string | null;
	userName: string;
	action: string;
	entity: string;
	entityId?: string | null;
	details?: string | null;
}): void {
	const lastEntry = db
		.select({ hash: auditLogs.hash })
		.from(auditLogs)
		.orderBy(desc(auditLogs.createdAt))
		.limit(1)
		.get();

	const previousHash = lastEntry?.hash ?? GENESIS_HASH;
	const now = Date.now();

	const hash = computeHash({
		userId: params.userId,
		userName: params.userName,
		action: params.action,
		entity: params.entity,
		entityId: params.entityId ?? null,
		details: params.details ?? null,
		previousHash,
		createdAt: now
	});

	db.insert(auditLogs)
		.values({
			id: generateId(),
			userId: params.userId,
			userName: params.userName,
			action: params.action,
			entity: params.entity,
			entityId: params.entityId ?? null,
			details: params.details ?? null,
			previousHash,
			hash,
			createdAt: new Date(now)
		})
		.run();
}

export function verifyAuditChain(): { valid: boolean; brokenAt?: number; total: number } {
	const allLogs = db.select().from(auditLogs).orderBy(auditLogs.createdAt).all();
	if (allLogs.length === 0) return { valid: true, total: 0 };

	for (let i = 0; i < allLogs.length; i++) {
		const entry = allLogs[i];
		const expectedPrevHash = i === 0 ? GENESIS_HASH : allLogs[i - 1].hash;

		if (entry.previousHash !== expectedPrevHash) {
			return { valid: false, brokenAt: i, total: allLogs.length };
		}

		const expectedHash = computeHash({
			userId: entry.userId,
			userName: entry.userName,
			action: entry.action,
			entity: entry.entity,
			entityId: entry.entityId,
			details: entry.details,
			previousHash: entry.previousHash,
			createdAt: entry.createdAt instanceof Date ? entry.createdAt.getTime() : entry.createdAt
		});

		if (entry.hash !== expectedHash) {
			return { valid: false, brokenAt: i, total: allLogs.length };
		}
	}

	return { valid: true, total: allLogs.length };
}
```

### Step 5.2: Add Audit Calls to ALL Key Actions

Import `{ logAuditEvent } from '$lib/server/audit'` and add calls after these operations:

| Location            | Action              | Event                                         |
| ------------------- | ------------------- | --------------------------------------------- |
| Login action        | Successful login    | `LOGIN` on `session`                          |
| User create         | New user created    | `CREATE_USER` on `user`                       |
| User toggle active  | Activate/deactivate | `ACTIVATE_USER` / `DEACTIVATE_USER` on `user` |
| User role change    | Role changed        | `CHANGE_ROLE` on `user`                       |
| User password reset | Password reset      | `RESET_PASSWORD` on `user`                    |
| Product create      | New product         | `CREATE_PRODUCT` on `product`                 |
| Product delete      | Product deleted     | `DELETE_PRODUCT` on `product`                 |
| Stock adjustment    | Stock changed       | `ADJUST_STOCK` on `product_variant`           |
| POS checkout        | Sale completed      | `CREATE_ORDER` on `order`                     |
| Cashbook expense    | Expense recorded    | `ADD_EXPENSE` on `cashbook`                   |
| Store settings      | Settings updated    | `UPDATE_SETTINGS` on `store_settings`         |

### Step 5.3: Audit Log Viewer (Admin Only)

**File:** `src/routes/(app)/settings/audit/+page.server.ts`

Load last 200 audit entries + chain verification status.

**File:** `src/routes/(app)/settings/audit/+page.svelte`

Show chain integrity status (green shield = valid, red shield = tampered) at the top.
Table columns: Time, User, Action (badge), Entity, Details, Hash (truncated to first 12 chars).

### Step 5.4: Store Settings Page (Admin Only)

**File:** `src/routes/(app)/settings/+page.server.ts` and `+page.svelte`

Form fields: Store Name, Address, Phone, Receipt Footer Message.
Uses the `storeSettings` key-value table (upsert pattern).

Navigation tabs at top of all settings pages: Store Settings | User Management | Audit Log

### Phase 5 Verification

1. Audit log entries appear for all tracked actions (login, user management, stock, orders, expenses)
2. Chain verification shows "Valid" in the UI
3. Manually corrupt an entry in the DB -> chain shows "BROKEN" with entry number
4. Store settings save correctly and appear on printed receipts
5. Settings navigation tabs work across all settings sub-pages
6. Only admin can access settings pages
7. **Run `pnpm check` - MUST pass with ZERO errors**

---

## CSS Base Rules (Add to layout.css)

Add these to the `@layer base` section in `src/routes/layout.css`:

```css
@layer base {
	button,
	a,
	[role='button'],
	select,
	label[for],
	input[type='checkbox'],
	input[type='radio'],
	.cursor-pointer {
		cursor: pointer;
	}
}
```

This provides a global cursor-pointer for interactive elements, but STILL add `cursor-pointer` class explicitly on custom interactive elements for clarity.

---

## Common TSC Errors & Fixes

| Error                                             | Fix                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `Cannot find module './$types'`                   | Run `pnpm dev` once to generate types, or `pnpm prepare`             |
| `Property does not exist on type 'ActionData'`    | Check your form action returns match what the template expects       |
| `Type 'null' is not assignable`                   | Use optional chaining: `data.user?.name` or add null check           |
| `'$state' is not defined`                         | File must be `.svelte` or `.svelte.ts`, NOT `.ts`                    |
| `Cannot use 'export let'`                         | Use `let { x } = $props()` instead                                   |
| `Argument of type 'string' not assignable to ...` | Cast with `as string` or use proper type narrowing                   |
| `Module has no exported member`                   | Check the import path - shadcn components use `$lib/components/ui/X` |
| `'db.transaction' callback should not be async`   | Remove `async` keyword from transaction callback                     |

---

## Final Checklist Before Marking Complete

- [ ] All 5 phases implemented and pass `pnpm check`
- [ ] Login works with password visibility toggle
- [ ] Admin can create/manage users (no signup)
- [ ] Smart redirect: sales -> POS, admin/manager -> Dashboard
- [ ] RBAC enforced on all routes
- [ ] Products with size variants and auto-generated barcodes
- [ ] Stock adjustment with reason tracking and audit trail
- [ ] Barcode label printing (2x1 inch, CODE128)
- [ ] POS with barcode scanning, cart, discounts, customer quick-add
- [ ] Thermal receipt printing (80mm, monospace, BDT)
- [ ] Dashboard with sales summary and charts
- [ ] Cashbook with income/expense tracking
- [ ] Order history with drill-down and receipt reprint
- [ ] Audit log with chained hashing and integrity verification
- [ ] Store settings configurable (name, address, phone, receipt footer)
- [ ] Dark/Light/System theme toggle
- [ ] All buttons have cursor-pointer
- [ ] All password fields have visibility toggle
- [ ] Toast notifications on all actions
- [ ] Inline form validation
