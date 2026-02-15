# Plan V3 — Clothing POS System Improvements

## Overview

This plan addresses 8 areas: removing the redundant header, redesigning inventory management, improving order history with filters/pagination, adding customer order history, dynamic tab names, reports page redesign, professional typography, and additional improvements discovered during review.

---

## 1. Remove Redundant Header — Keep Sidebar Only

### Problem

The header duplicates sidebar functionality (logout, settings) and wastes vertical screen space. The sidebar already has navigation, logout, and settings. The header only adds: a role title ("Admin Panel"), theme toggle, and user avatar dropdown.

### Changes Required

**File: `src/routes/(app)/+layout.svelte`**

- Remove the entire `<header>` element (lines 164-270)
- Move the **theme toggle** into the sidebar (bottom area, above logout)
- Move the **user info** into the sidebar header area
- Keep the **mobile menu button** — move it into a minimal top bar visible only on mobile
- Remove the `h-16` header height offset from main content

### Code Changes

Replace the entire `(app)/+layout.svelte`:

```svelte
<script lang="ts">
	import {
		LayoutDashboard,
		Package,
		ShoppingCart,
		Receipt,
		Users,
		Wallet,
		Settings,
		LogOut,
		Menu,
		Sun,
		Moon,
		Monitor,
		ChevronLeft,
		ChevronRight,
		BarChart3
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { Separator } from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';

	let { data, children } = $props();
	let isMobileMenuOpen = $state(false);
	let collapsed = $state(false);

	const user = $derived(data.user);

	const navItems = $derived(
		[
			{
				href: '/dashboard',
				label: 'Dashboard',
				icon: LayoutDashboard,
				roles: ['admin', 'manager']
			},
			{ href: '/inventory', label: 'Inventory', icon: Package, roles: ['admin', 'manager'] },
			{ href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['admin', 'manager', 'sales'] },
			{ href: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'manager', 'sales'] },
			{ href: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'manager', 'sales'] },
			{ href: '/cashbook', label: 'Cashbook', icon: Wallet, roles: ['admin', 'manager'] },
			{ href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
			{ href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] }
		].filter((item) => user && item.roles.includes(user.role))
	);

	function isActive(href: string): boolean {
		if (!browser) return false;
		const currentPath = $page.url.pathname;
		if (href === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(href);
	}

	async function setTheme(theme: 'light' | 'dark' | 'system') {
		await fetch('/api/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ theme })
		});
		if (!browser) return;
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else if (theme === 'light') {
			document.documentElement.classList.remove('dark');
		} else {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', prefersDark);
		}
	}
</script>

<div class="flex min-h-screen bg-background text-foreground">
	<!-- Desktop Sidebar -->
	<aside
		class="fixed top-0 left-0 z-30 hidden h-screen border-r bg-card transition-all duration-300 md:flex md:flex-col {collapsed
			? 'w-16'
			: 'w-64'}"
	>
		<!-- Sidebar Header: User info + collapse toggle -->
		<div
			class="flex h-16 items-center border-b px-4 {collapsed
				? 'justify-center'
				: 'justify-between'}"
		>
			{#if !collapsed}
				<div class="flex min-w-0 items-center gap-3">
					<Avatar class="h-8 w-8 shrink-0">
						<AvatarFallback class="bg-primary text-xs font-bold text-primary-foreground">
							{user?.name?.charAt(0) ?? 'U'}
						</AvatarFallback>
					</Avatar>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">{user?.name}</p>
						<p class="text-xs text-muted-foreground capitalize">{user?.role}</p>
					</div>
				</div>
			{/if}
			<button
				onclick={() => (collapsed = !collapsed)}
				class="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				{#if collapsed}
					<ChevronRight class="h-4 w-4" />
				{:else}
					<ChevronLeft class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- Nav Links (unchanged) -->
		<nav class="flex-1 overflow-y-auto py-4 {collapsed ? 'px-2' : 'px-3'}">
			<div class="space-y-1">
				{#each navItems as item}
					{@const active = isActive(item.href)}
					{#if collapsed}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<a
										{...props}
										href={item.href}
										class="flex cursor-pointer items-center justify-center rounded-md p-2.5 transition-colors
                      {active
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
									>
										<item.icon class="h-5 w-5" />
									</a>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="right">{item.label}</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href={item.href}
							class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors
                {active
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
						>
							<item.icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/if}
				{/each}
			</div>
		</nav>

		<!-- Bottom: Theme toggle + Logout -->
		<div class="space-y-1 border-t p-3 {collapsed ? 'px-2' : ''}">
			<!-- Theme Toggle -->
			{#if collapsed}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								class="flex w-full cursor-pointer items-center justify-center rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-accent"
							>
								<Sun
									class="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
								/>
								<Moon
									class="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
								/>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="right" align="end">
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer">
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer">
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer">
							<Monitor class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								class="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
							>
								<Sun
									class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
								/>
								<Moon
									class="absolute ml-0 h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
								/>
								<span class="ml-4">Theme</span>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="right" align="end">
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer">
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer">
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer">
							<Monitor class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- Logout -->
			<form action="/logout" method="POST" use:enhance>
				{#if collapsed}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="submit"
									class="flex w-full cursor-pointer items-center justify-center rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
								>
									<LogOut class="h-5 w-5" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="right">Logout</Tooltip.Content>
					</Tooltip.Root>
				{:else}
					<Button
						variant="ghost"
						class="w-full cursor-pointer justify-start gap-3 text-muted-foreground hover:text-destructive"
						type="submit"
					>
						<LogOut class="h-4 w-4" />
						Logout
					</Button>
				{/if}
			</form>
		</div>
	</aside>

	<!-- Mobile Top Bar (minimal — just menu button) -->
	<div
		class="fixed top-0 right-0 left-0 z-20 flex h-12 items-center border-b bg-card/95 px-4 backdrop-blur-sm md:hidden"
	>
		<Sheet.Root bind:open={isMobileMenuOpen}>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="cursor-pointer">
						<Menu class="h-5 w-5" />
						<span class="sr-only">Toggle menu</span>
					</Button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="left" class="w-64 p-0">
				<div class="flex h-16 items-center gap-3 border-b px-6">
					<Avatar class="h-8 w-8">
						<AvatarFallback class="bg-primary text-xs font-bold text-primary-foreground">
							{user?.name?.charAt(0) ?? 'U'}
						</AvatarFallback>
					</Avatar>
					<div>
						<p class="text-sm font-semibold">{user?.name}</p>
						<p class="text-xs text-muted-foreground capitalize">{user?.role}</p>
					</div>
				</div>
				<nav class="space-y-1 p-4">
					{#each navItems as item}
						{@const active = isActive(item.href)}
						<a
							href={item.href}
							class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                {active
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent hover:text-accent-foreground'}"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<item.icon class="h-4 w-4" />
							{item.label}
						</a>
					{/each}
					<Separator class="my-4" />
					<!-- Theme toggle for mobile -->
					<div class="flex items-center gap-2 px-3 py-2">
						<span class="text-sm text-muted-foreground">Theme:</span>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('light')}
						>
							<Sun class="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('dark')}
						>
							<Moon class="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('system')}
						>
							<Monitor class="h-4 w-4" />
						</Button>
					</div>
					<Separator class="my-4" />
					<form action="/logout" method="POST" use:enhance>
						<Button variant="ghost" class="w-full cursor-pointer justify-start gap-3" type="submit">
							<LogOut class="h-4 w-4" />
							Logout
						</Button>
					</form>
				</nav>
			</Sheet.Content>
		</Sheet.Root>
		<span class="ml-3 text-sm font-semibold">Clothing POS</span>
	</div>

	<!-- Main Content Area -->
	<div
		class="flex flex-1 flex-col pt-12 transition-all duration-300 md:pt-0 {collapsed
			? 'md:ml-16'
			: 'md:ml-64'}"
	>
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</div>
```

**Key changes:**

- Header removed entirely
- User avatar + name + role shown in sidebar header
- Theme toggle added to sidebar bottom (above logout)
- Mobile: minimal 48px bar with just hamburger + app name
- `pt-12 md:pt-0` added to main content for mobile top bar offset
- POS page height calculation needs updating from `h-[calc(100vh-4rem)]` to `h-[calc(100vh-3rem)] md:h-screen`

**File: `src/routes/(app)/pos/+page.svelte`** — Update the height:

```svelte
<!-- Change line 239 from: -->
<div class="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
<!-- To: -->
<div class="flex h-[calc(100vh-3rem)] md:h-screen flex-col md:flex-row">
```

---

## 2. Inventory Management Redesign

### Problems Identified

1. **Edit page has no variant management** — can only edit product-level data (name, category, price)
2. **Add Variant dialog uses free-text input for sizes** — inconsistent with the template-based selection during creation
3. **Cannot delete individual variants** — no delete action on variants table
4. **No inline editing of variant properties** (price override, color)
5. **No stock history view per variant**

### 2A. Fix Add Variant — Use Size Template Selector (Not Free Text)

**File: `src/routes/(app)/inventory/[id]/+page.svelte`**

Replace the "Add Variant" dialog's size input with the same template selector used during creation. Also need to filter out already-existing sizes.

Replace the Add Variant Dialog section:

```svelte
<script lang="ts">
	// ... existing imports ...
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Select from '$lib/components/ui/select';

	// ... existing state ...

	// Add these new state variables for variant creation
	const SIZE_TEMPLATES = {
		alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
		numeric: ['36', '38', '40', '42', '44', '46', '48', '50']
	};

	let variantTemplate = $state('alpha');
	let variantSelectedSizes = $state<string[]>([]);

	// Sizes already present in the product
	const existingSizes = $derived(data.variants.map((v) => v.size));

	// Available sizes = template sizes minus existing sizes
	const availableSizes = $derived(
		SIZE_TEMPLATES[variantTemplate as keyof typeof SIZE_TEMPLATES].filter(
			(s) => !existingSizes.includes(s)
		)
	);

	function toggleVariantSize(size: string) {
		if (variantSelectedSizes.includes(size)) {
			variantSelectedSizes = variantSelectedSizes.filter((s) => s !== size);
		} else {
			variantSelectedSizes = [...variantSelectedSizes, size];
		}
	}
</script>

<!-- Replace the Add Variant Dialog -->
<Dialog.Root bind:open={variantDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add New Variants</Dialog.Title>
			<Dialog.Description>Add new size variants to this product.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/addVariant"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<!-- Size Template Selector -->
			<div class="space-y-4 rounded-lg border p-4">
				<div class="flex items-center justify-between">
					<Label class="text-sm font-semibold">Select Sizes</Label>
					<div class="w-[180px]">
						<Select.Root type="single" bind:value={variantTemplate}>
							<Select.Trigger>
								{variantTemplate === 'alpha' ? 'Alpha (S, M, L...)' : 'Numeric (36, 38...)'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="alpha" class="cursor-pointer">Alpha (S, M, L...)</Select.Item>
								<Select.Item value="numeric" class="cursor-pointer">Numeric (36, 38...)</Select.Item
								>
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				{#if availableSizes.length > 0}
					<div class="flex flex-wrap gap-3">
						{#each availableSizes as size}
							<div class="flex items-center space-x-2">
								<Checkbox
									id="variant-size-{size}"
									name="sizes"
									value={size}
									checked={variantSelectedSizes.includes(size)}
									onCheckedChange={() => toggleVariantSize(size)}
								/>
								<Label for="variant-size-{size}" class="cursor-pointer text-sm">{size}</Label>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground italic">
						All sizes from this template already exist.
					</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="new-color">Color (Optional)</Label>
				<Input
					id="new-color"
					name="color"
					placeholder="e.g. Navy Blue"
					bind:value={newVariantColor}
				/>
			</div>

			<div class="space-y-2">
				<Label for="new-price">Price Override (Optional, ৳)</Label>
				<Input
					id="new-price"
					name="priceOverride"
					type="number"
					step="0.01"
					placeholder="Leave blank to use base price"
					bind:value={newVariantPriceOverride}
				/>
				<p class="text-xs text-muted-foreground">Base price: {formatBDT(data.product.basePrice)}</p>
			</div>

			<div class="space-y-2">
				<Label for="new-stock">Initial Stock (per size)</Label>
				<Input
					id="new-stock"
					name="initialStock"
					type="number"
					min="0"
					bind:value={newVariantInitialStock}
				/>
			</div>

			<Dialog.Footer>
				<Button
					type="submit"
					disabled={loading || variantSelectedSizes.length === 0}
					class="w-full cursor-pointer"
				>
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Add {variantSelectedSizes.length} Variant{variantSelectedSizes.length !== 1 ? 's' : ''}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

**File: `src/routes/(app)/inventory/[id]/+page.server.ts`** — Update the `addVariant` action to handle multiple sizes:

```typescript
addVariant: async ({ request, params, locals }) => {
  if (!locals.user || locals.user.role === 'sales') {
    return fail(403, { variantError: 'Unauthorized' });
  }

  const data = await request.formData();
  const sizes = data.getAll('sizes') as string[];
  const color = (data.get('color') as string)?.trim() || null;
  const priceOverride = data.get('priceOverride') ? parseFloat(data.get('priceOverride') as string) : null;
  const initialStock = parseInt(data.get('initialStock') as string) || 0;

  if (sizes.length === 0) {
    return fail(400, { variantError: 'Select at least one size' });
  }

  const product = db
    .select()
    .from(products)
    .where(eq(products.id, params.id))
    .get();
  if (!product) {
    return fail(404, { variantError: 'Product not found' });
  }

  const shortId = params.id.substring(0, 4).toUpperCase();
  const catPrefix = product.category.substring(0, 3).toUpperCase();

  try {
    db.transaction((tx) => {
      for (const size of sizes) {
        const variantId = generateId();
        const barcode = `${catPrefix}-${shortId}-${size}${color ? '-' + color.substring(0, 3).toUpperCase() : ''}`;

        // Check for duplicate barcode
        const existing = tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.barcode, barcode))
          .get();
        if (existing) continue; // Skip duplicates silently

        tx.insert(productVariants)
          .values({
            id: variantId,
            productId: params.id,
            size,
            color,
            barcode,
            stockQuantity: initialStock,
            priceOverride
          })
          .run();

        if (initialStock > 0) {
          tx.insert(stockLogs)
            .values({
              id: generateId(),
              variantId,
              changeAmount: initialStock,
              reason: 'Initial stock',
              userId: locals.user!.id,
              createdAt: new Date()
            })
            .run();
        }
      }
    });

    logAuditEvent({
      userId: locals.user.id,
      userName: locals.user.name,
      action: 'ADD_VARIANT',
      entity: 'product_variant',
      entityId: params.id,
      details: `Added ${sizes.length} variant(s): ${sizes.join(', ')} to product ${product.name}`
    });
  } catch (e) {
    console.error('Failed to add variants:', e);
    return fail(500, { variantError: 'Database error' });
  }

  return { variantSuccess: true };
},
```

### 2B. Add Delete Variant Feature

**File: `src/routes/(app)/inventory/[id]/+page.svelte`** — Add a delete button to each variant row:

```svelte
<!-- In the variants table, add a new column header -->
<Table.Head class="text-right">Actions</Table.Head>

<!-- In each variant row, add an actions cell -->
<Table.Cell class="text-right">
	{#if data.variants.length > 1}
		<form method="POST" action="?/deleteVariant" use:enhance>
			<input type="hidden" name="variantId" value={variant.id} />
			<Button
				variant="ghost"
				size="icon"
				type="submit"
				class="cursor-pointer text-muted-foreground hover:text-destructive"
				onclick={(e) => {
					if (
						!confirm(
							`Delete variant ${variant.size}${variant.color ? ' / ' + variant.color : ''}? This cannot be undone.`
						)
					)
						e.preventDefault();
				}}
			>
				<Trash class="h-4 w-4" />
			</Button>
		</form>
	{/if}
</Table.Cell>
```

**File: `src/routes/(app)/inventory/[id]/+page.server.ts`** — Add `deleteVariant` action:

```typescript
deleteVariant: async ({ request, locals }) => {
  if (!locals.user || locals.user.role === 'sales') {
    return fail(403, { error: 'Unauthorized' });
  }

  const data = await request.formData();
  const variantId = data.get('variantId') as string;

  if (!variantId) {
    return fail(400, { error: 'Variant ID required' });
  }

  // Check it's not the last variant
  const variant = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get();
  if (!variant) {
    return fail(404, { error: 'Variant not found' });
  }

  const siblingCount = db
    .select({ count: sql<number>`count(*)` })
    .from(productVariants)
    .where(eq(productVariants.productId, variant.productId))
    .get();

  if (siblingCount && siblingCount.count <= 1) {
    return fail(400, { error: 'Cannot delete the last variant. Delete the product instead.' });
  }

  try {
    db.delete(productVariants).where(eq(productVariants.id, variantId)).run();

    logAuditEvent({
      userId: locals.user.id,
      userName: locals.user.name,
      action: 'DELETE_VARIANT',
      entity: 'product_variant',
      entityId: variantId,
      details: `Deleted variant ${variant.size}${variant.color ? ' / ' + variant.color : ''}`
    });
  } catch (e) {
    console.error('Failed to delete variant:', e);
    return fail(500, { error: 'Database error' });
  }

  return { deleteVariantSuccess: true };
},
```

Also add the $effect handler for deleteVariant success:

```typescript
$effect(() => {
	// ... existing handlers ...
	if (form?.deleteVariantSuccess) {
		toast.success('Variant deleted');
	}
});
```

### 2C. Edit Product Page — Add Variant Management

The edit page should also allow editing variant details (price override) inline. Currently it only edits product-level info. We should merge the edit page functionality into the detail view page to avoid confusion, OR add variant editing directly to the detail page.

**Recommendation:** Keep the edit page for product-level data, but add an **inline edit** for variant price override on the detail page.

**File: `src/routes/(app)/inventory/[id]/+page.svelte`** — Add Edit Variant dialog:

```svelte
<!-- Add state for edit variant -->
let editVariantDialogOpen = $state(false);
let editingVariant = $state<any>(null);
let editVariantPrice = $state('');

function openEditVariant(variant: any) {
  editingVariant = variant;
  editVariantPrice = variant.priceOverride?.toString() ?? '';
  editVariantDialogOpen = true;
}

<!-- Add action cell with edit button alongside delete -->
<Button
  variant="ghost"
  size="icon"
  class="cursor-pointer"
  onclick={() => openEditVariant(variant)}
>
  <Pencil class="h-4 w-4" />
</Button>

<!-- Edit Variant Dialog -->
<Dialog.Root bind:open={editVariantDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Edit Variant</Dialog.Title>
      <Dialog.Description>
        {editingVariant?.size}{editingVariant?.color ? ` / ${editingVariant.color}` : ''}
      </Dialog.Description>
    </Dialog.Header>
    <form method="POST" action="?/editVariant" use:enhance class="space-y-4">
      <input type="hidden" name="variantId" value={editingVariant?.id} />
      <div class="space-y-2">
        <Label>Price Override (৳)</Label>
        <Input
          name="priceOverride"
          type="number"
          step="0.01"
          placeholder="Leave blank for base price"
          bind:value={editVariantPrice}
        />
        <p class="text-xs text-muted-foreground">Base price: {formatBDT(data.product.basePrice)}</p>
      </div>
      <Dialog.Footer>
        <Button type="submit" class="w-full cursor-pointer">Save Changes</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
```

**File: `src/routes/(app)/inventory/[id]/+page.server.ts`** — Add `editVariant` action:

```typescript
editVariant: async ({ request, locals }) => {
  if (!locals.user || locals.user.role === 'sales') {
    return fail(403, { error: 'Unauthorized' });
  }

  const data = await request.formData();
  const variantId = data.get('variantId') as string;
  const priceOverrideStr = (data.get('priceOverride') as string)?.trim();
  const priceOverride = priceOverrideStr ? parseFloat(priceOverrideStr) : null;

  try {
    db.update(productVariants)
      .set({ priceOverride })
      .where(eq(productVariants.id, variantId))
      .run();
  } catch (e) {
    console.error('Failed to edit variant:', e);
    return fail(500, { error: 'Database error' });
  }

  return { editVariantSuccess: true };
},
```

---

## 3. Order History — Show All Orders with Filters & Pagination

### Problems

1. Currently filters by a **single date** only — no date range support
2. **No pagination** — all orders for the day are loaded at once
3. No "All orders" view — always filtered by a date

### Changes Required

**File: `src/routes/(app)/orders/+page.server.ts`** — Rewrite the loader:

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { orders, customers, users } from '$lib/server/db/schema';
import { eq, and, gte, lt, lte, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	const dateFrom = url.searchParams.get('from') ?? '';
	const dateTo = url.searchParams.get('to') ?? '';
	const statusFilter = url.searchParams.get('status') ?? '';

	// Build conditions
	const conditions: any[] = [];

	if (dateFrom) {
		const from = new Date(dateFrom);
		from.setHours(0, 0, 0, 0);
		conditions.push(gte(orders.createdAt, from));
	}

	if (dateTo) {
		const to = new Date(dateTo);
		to.setHours(23, 59, 59, 999);
		conditions.push(lte(orders.createdAt, to));
	}

	if (statusFilter && ['completed', 'refunded', 'void'].includes(statusFilter)) {
		conditions.push(eq(orders.status, statusFilter));
	}

	// Sales users only see their own orders
	if (locals.user.role === 'sales') {
		conditions.push(eq(orders.userId, locals.user.id));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Get total count
	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(whereClause)
		.get();
	const totalOrders = countResult?.count ?? 0;
	const totalPages = Math.ceil(totalOrders / perPage);

	// Get paginated orders
	const allOrders = db
		.select({
			id: orders.id,
			totalAmount: orders.totalAmount,
			status: orders.status,
			paymentMethod: orders.paymentMethod,
			createdAt: orders.createdAt,
			customerName: customers.name,
			userName: users.name
		})
		.from(orders)
		.leftJoin(customers, eq(orders.customerId, customers.id))
		.leftJoin(users, eq(orders.userId, users.id))
		.where(whereClause)
		.orderBy(desc(orders.createdAt))
		.limit(perPage)
		.offset(offset)
		.all();

	return {
		orders: allOrders,
		pagination: {
			currentPage,
			totalPages,
			totalOrders,
			perPage
		},
		filters: {
			from: dateFrom,
			to: dateTo,
			status: statusFilter
		}
	};
};
```

**File: `src/routes/(app)/orders/+page.svelte`** — Rewrite with filters and pagination:

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Search, Calendar, Eye, ChevronLeft, ChevronRight, Filter } from '@lucide/svelte';
	import { formatBDT, formatDateTime } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let dateFrom = $state(data.filters.from);
	let dateTo = $state(data.filters.to);
	let statusFilter = $state(data.filters.status);

	$effect(() => {
		dateFrom = data.filters.from;
		dateTo = data.filters.to;
		statusFilter = data.filters.status;
	});

	function applyFilters() {
		const params = new URLSearchParams();
		if (dateFrom) params.set('from', dateFrom);
		if (dateTo) params.set('to', dateTo);
		if (statusFilter) params.set('status', statusFilter);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function clearFilters() {
		dateFrom = '';
		dateTo = '';
		statusFilter = '';
		goto('/orders');
	}

	function goToPage(page: number) {
		const params = new URLSearchParams();
		if (dateFrom) params.set('from', dateFrom);
		if (dateTo) params.set('to', dateTo);
		if (statusFilter) params.set('status', statusFilter);
		params.set('page', page.toString());
		goto(`?${params.toString()}`);
	}

	// Quick date shortcuts
	function setToday() {
		const today = new Date().toISOString().split('T')[0];
		dateFrom = today;
		dateTo = today;
		applyFilters();
	}

	function setThisWeek() {
		const now = new Date();
		const start = new Date(now);
		start.setDate(now.getDate() - now.getDay());
		dateFrom = start.toISOString().split('T')[0];
		dateTo = now.toISOString().split('T')[0];
		applyFilters();
	}

	function setThisMonth() {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		dateFrom = start.toISOString().split('T')[0];
		dateTo = now.toISOString().split('T')[0];
		applyFilters();
	}
</script>

<div class="space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Order History</h1>
			<p class="text-muted-foreground">
				{data.pagination.totalOrders} total order{data.pagination.totalOrders !== 1 ? 's' : ''}
			</p>
		</div>
	</div>

	<!-- Filters -->
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex flex-wrap items-end gap-4">
				<div class="space-y-2">
					<Label class="text-xs text-muted-foreground">From</Label>
					<Input type="date" class="w-[160px] cursor-pointer" bind:value={dateFrom} />
				</div>
				<div class="space-y-2">
					<Label class="text-xs text-muted-foreground">To</Label>
					<Input type="date" class="w-[160px] cursor-pointer" bind:value={dateTo} />
				</div>
				<div class="space-y-2">
					<Label class="text-xs text-muted-foreground">Status</Label>
					<Select.Root type="single" bind:value={statusFilter}>
						<Select.Trigger class="w-[140px]">
							{statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'All'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" class="cursor-pointer">All</Select.Item>
							<Select.Item value="completed" class="cursor-pointer">Completed</Select.Item>
							<Select.Item value="refunded" class="cursor-pointer">Refunded</Select.Item>
							<Select.Item value="void" class="cursor-pointer">Void</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
				<Button onclick={applyFilters} class="cursor-pointer">
					<Filter class="mr-2 h-4 w-4" /> Apply
				</Button>
				<Button variant="ghost" onclick={clearFilters} class="cursor-pointer text-muted-foreground">
					Clear
				</Button>
				<div class="ml-auto flex gap-2">
					<Button variant="outline" size="sm" onclick={setToday} class="cursor-pointer text-xs"
						>Today</Button
					>
					<Button variant="outline" size="sm" onclick={setThisWeek} class="cursor-pointer text-xs"
						>This Week</Button
					>
					<Button variant="outline" size="sm" onclick={setThisMonth} class="cursor-pointer text-xs"
						>This Month</Button
					>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Orders Table -->
	<Card.Root>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Order ID</Table.Head>
						<Table.Head>Date & Time</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Cashier</Table.Head>
						<Table.Head>Payment</Table.Head>
						<Table.Head>Amount</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.orders as order}
						<Table.Row>
							<Table.Cell class="font-mono text-xs">
								#{order.id.substring(0, 8).toUpperCase()}
							</Table.Cell>
							<Table.Cell>{formatDateTime(order.createdAt)}</Table.Cell>
							<Table.Cell>{order.customerName ?? 'Walk-in'}</Table.Cell>
							<Table.Cell class="text-xs">{order.userName}</Table.Cell>
							<Table.Cell class="capitalize">{order.paymentMethod}</Table.Cell>
							<Table.Cell class="font-bold">{formatBDT(order.totalAmount)}</Table.Cell>
							<Table.Cell>
								<Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}>
									{order.status}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<Button
									variant="ghost"
									size="icon"
									href="/orders/{order.id}"
									class="cursor-pointer"
								>
									<Eye class="h-4 w-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if data.orders.length === 0}
						<Table.Row>
							<Table.Cell colspan={8} class="h-48 text-center text-muted-foreground italic">
								No orders found.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">
				Page {data.pagination.currentPage} of {data.pagination.totalPages}
			</p>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					disabled={data.pagination.currentPage <= 1}
					onclick={() => goToPage(data.pagination.currentPage - 1)}
					class="cursor-pointer"
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				{#each Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
					// Show pages around current page
					const start = Math.max(1, Math.min(data.pagination.currentPage - 2, data.pagination.totalPages - 4));
					return start + i;
				}) as pageNum}
					<Button
						variant={pageNum === data.pagination.currentPage ? 'default' : 'outline'}
						size="icon"
						onclick={() => goToPage(pageNum)}
						class="cursor-pointer"
					>
						{pageNum}
					</Button>
				{/each}
				<Button
					variant="outline"
					size="icon"
					disabled={data.pagination.currentPage >= data.pagination.totalPages}
					onclick={() => goToPage(data.pagination.currentPage + 1)}
					class="cursor-pointer"
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>
```

---

## 4. Customer Detail — Enhance Order History

### Problems

1. Customer detail shows all orders but with no filtering, no pagination
2. No status column
3. No summary stats per time period

### Changes Required

**File: `src/routes/(app)/customers/[id]/+page.server.ts`** — Add pagination:

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers, orders } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const customer = db.select().from(customers).where(eq(customers.id, params.id)).get();

	if (!customer) {
		redirect(302, '/customers');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 10;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	// Total count
	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.get();
	const totalOrders = countResult?.count ?? 0;
	const totalPages = Math.ceil(totalOrders / perPage);

	// Total spent
	const spentResult = db
		.select({ total: sql<number>`COALESCE(SUM(total_amount), 0)` })
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.get();
	const totalSpent = spentResult?.total ?? 0;

	// Paginated orders
	const customerOrders = db
		.select()
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.orderBy(desc(orders.createdAt))
		.limit(perPage)
		.offset(offset)
		.all();

	return {
		customer,
		orders: customerOrders,
		totalSpent,
		totalOrders,
		pagination: {
			currentPage,
			totalPages,
			totalOrders,
			perPage
		}
	};
};
```

**File: `src/routes/(app)/customers/[id]/+page.svelte`** — Add pagination + status column:

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft, Phone, Mail, Eye, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { formatBDT, formatDateTime } from '$lib/format';
	import { goto } from '$app/navigation';

	let { data } = $props();

	function goToPage(page: number) {
		goto(`?page=${page}`);
	}
</script>

<div class="space-y-6 p-6">
	<div class="flex items-center gap-4">
		<Button variant="outline" size="icon" href="/customers" class="cursor-pointer">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{data.customer.name}</h1>
			<p class="text-muted-foreground">Customer Profile & Purchase History</p>
		</div>
	</div>

	<div class="grid gap-6 md:grid-cols-3">
		<!-- Customer Summary (unchanged) -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Customer Info</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2">
						<Phone class="h-4 w-4 text-primary" />
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Phone</div>
						<div class="font-medium">{data.customer.phone ?? 'Not provided'}</div>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2">
						<Mail class="h-4 w-4 text-primary" />
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Email</div>
						<div class="font-medium">{data.customer.email ?? 'Not provided'}</div>
					</div>
				</div>
				<div class="border-t pt-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<div class="text-xs text-muted-foreground">Total Orders</div>
							<div class="text-xl font-bold">{data.totalOrders}</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Total Spent</div>
							<div class="text-xl font-bold text-primary">{formatBDT(data.totalSpent)}</div>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Order History with pagination -->
		<Card.Root class="md:col-span-2">
			<Card.Header>
				<Card.Title>Order History</Card.Title>
				<Card.Description>
					Showing {data.orders.length} of {data.pagination.totalOrders} orders
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Order ID</Table.Head>
							<Table.Head>Date</Table.Head>
							<Table.Head>Payment</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Amount</Table.Head>
							<Table.Head class="text-right">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.orders as order}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">
									#{order.id.substring(0, 8).toUpperCase()}
								</Table.Cell>
								<Table.Cell>{formatDateTime(order.createdAt)}</Table.Cell>
								<Table.Cell class="capitalize">{order.paymentMethod}</Table.Cell>
								<Table.Cell>
									<Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}>
										{order.status}
									</Badge>
								</Table.Cell>
								<Table.Cell class="font-bold">{formatBDT(order.totalAmount)}</Table.Cell>
								<Table.Cell class="text-right">
									<Button
										variant="ghost"
										size="icon"
										href="/orders/{order.id}"
										class="cursor-pointer"
									>
										<Eye class="h-4 w-4" />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
						{#if data.orders.length === 0}
							<Table.Row>
								<Table.Cell colspan={6} class="h-32 text-center text-muted-foreground italic">
									No purchase history found.
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
			<!-- Pagination -->
			{#if data.pagination.totalPages > 1}
				<Card.Footer class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">
						Page {data.pagination.currentPage} of {data.pagination.totalPages}
					</p>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage <= 1}
							onclick={() => goToPage(data.pagination.currentPage - 1)}
							class="cursor-pointer"
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage >= data.pagination.totalPages}
							onclick={() => goToPage(data.pagination.currentPage + 1)}
							class="cursor-pointer"
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				</Card.Footer>
			{/if}
		</Card.Root>
	</div>
</div>
```

---

## 5. Dynamic Tab/Page Names

### Problem

The browser tab always shows a generic title (probably "SvelteKit" or whatever the default is). Each page should set a meaningful `<title>` tag so users can identify tabs when multiple are open.

### Changes Required

Add `<svelte:head>` with dynamic titles to every page. The pattern is:

**File: `src/routes/(app)/dashboard/+page.svelte`**

```svelte
<svelte:head><title>Dashboard — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/inventory/+page.svelte`**

```svelte
<svelte:head><title>Inventory — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/inventory/new/+page.svelte`**

```svelte
<svelte:head><title>New Product — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/inventory/[id]/+page.svelte`**

```svelte
<svelte:head><title>{data.product.name} — Inventory — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/inventory/[id]/edit/+page.svelte`**

```svelte
<svelte:head><title>Edit {data.product.name} — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/inventory/[id]/labels/+page.svelte`**

```svelte
<svelte:head><title>Labels — {data.product.name} — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/pos/+page.svelte`**

```svelte
<svelte:head><title>Point of Sale — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/orders/+page.svelte`**

```svelte
<svelte:head><title>Order History — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/orders/[id]/+page.svelte`**

```svelte
<svelte:head
	><title>Order #{data.order.id.substring(0, 8).toUpperCase()} — Clothing POS</title></svelte:head
>
```

**File: `src/routes/(app)/customers/+page.svelte`**

```svelte
<svelte:head><title>Customers — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/customers/[id]/+page.svelte`**

```svelte
<svelte:head><title>{data.customer.name} — Customers — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/cashbook/+page.svelte`**

```svelte
<svelte:head><title>Cashbook — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/reports/+page.svelte`**

```svelte
<svelte:head><title>Reports — Clothing POS</title></svelte:head>
```

**File: `src/routes/(app)/settings/+page.svelte`**

```svelte
<svelte:head><title>Settings — Clothing POS</title></svelte:head>
```

Add each `<svelte:head>` tag right after the closing `</script>` tag and before the first HTML element on each page.

---

## 6. Additional Improvements (From Code Review)

### 6A. Inventory List — Add Category Filter Dropdown

Currently the inventory list only has a text search. Add a category filter.

**File: `src/routes/(app)/inventory/+page.server.ts`** — Load distinct categories:

```typescript
// Add to the load function return:
const categories = db
	.selectDistinct({ category: products.category })
	.from(products)
	.all()
	.map((c) => c.category);

return { products: result, categories };
```

**File: `src/routes/(app)/inventory/+page.svelte`** — Add category filter:

```svelte
<script lang="ts">
	// Add to existing script:
	import * as Select from '$lib/components/ui/select';

	let selectedCategory = $state('');

	const filteredProducts = $derived(
		data.products.filter((p) => {
			const matchesSearch =
				p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.category.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesCategory = !selectedCategory || p.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);
</script>

<!-- Update the filter bar -->
<div class="flex items-center gap-3">
	<div class="relative w-full max-w-sm">
		<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
		<Input placeholder="Search products..." class="pl-10" bind:value={searchQuery} />
	</div>
	<Select.Root type="single" bind:value={selectedCategory}>
		<Select.Trigger class="w-[180px]">
			{selectedCategory || 'All Categories'}
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="" class="cursor-pointer">All Categories</Select.Item>
			{#each data.categories as cat}
				<Select.Item value={cat} class="cursor-pointer">{cat}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
```

### 6B. Inventory List — Add Pagination

The inventory list loads all products at once. Add server-side pagination.

**File: `src/routes/(app)/inventory/+page.server.ts`**:

```typescript
export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || locals.user.role === 'sales') {
		redirect(302, '/pos');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;
	const categoryFilter = url.searchParams.get('category') ?? '';
	const search = url.searchParams.get('q') ?? '';

	const conditions: any[] = [];
	if (categoryFilter) {
		conditions.push(eq(products.category, categoryFilter));
	}
	if (search) {
		conditions.push(
			sql`(${products.name} LIKE ${'%' + search + '%'} OR ${products.category} LIKE ${'%' + search + '%'})`
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(products)
		.where(whereClause)
		.get();
	const total = countResult?.count ?? 0;

	const result = db
		.select({
			id: products.id,
			name: products.name,
			category: products.category,
			basePrice: products.basePrice,
			variantCount: sql<number>`(SELECT COUNT(*) FROM product_variant WHERE product_id = ${products.id})`,
			totalStock: sql<number>`COALESCE((SELECT SUM(stock_quantity) FROM product_variant WHERE product_id = ${products.id}), 0)`
		})
		.from(products)
		.where(whereClause)
		.limit(perPage)
		.offset(offset)
		.all();

	const categories = db
		.selectDistinct({ category: products.category })
		.from(products)
		.all()
		.map((c) => c.category);

	return {
		products: result,
		categories,
		pagination: { currentPage, totalPages: Math.ceil(total / perPage), total, perPage }
	};
};
```

### 6C. Customers List — Add Pagination

Similar pattern as orders. The customers page loads all customers at once.

**File: `src/routes/(app)/customers/+page.server.ts`** — Add pagination to load function:

```typescript
const pageParam = parseInt(url.searchParams.get('page') ?? '1');
const perPage = 20;
const currentPage = Math.max(1, pageParam);
const offset = (currentPage - 1) * perPage;

// Get total count
const countResult = db
  .select({ count: sql<number>`count(*)` })
  .from(customers)
  .get();
const total = countResult?.count ?? 0;

// Paginate the query
const customerList = db
  .select({ ... })
  .from(customers)
  .leftJoin(...)
  .groupBy(customers.id)
  .orderBy(...)
  .limit(perPage)
  .offset(offset)
  .all();

return {
  customers: customerList,
  pagination: { currentPage, totalPages: Math.ceil(total / perPage), total, perPage }
};
```

### 6D. Customer Edit Feature Missing

There's no way to edit customer information (name, phone, email). Add an edit button + dialog on the customer detail page.

**File: `src/routes/(app)/customers/[id]/+page.svelte`** — Add edit dialog:

```svelte
<!-- Add to the header area -->
<Button variant="outline" onclick={() => (editDialogOpen = true)} class="cursor-pointer">
	<Pencil class="mr-2 h-4 w-4" /> Edit
</Button>

<!-- Edit Customer Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit Customer</Dialog.Title>
		</Dialog.Header>
		<form method="POST" action="?/edit" use:enhance class="space-y-4">
			<div class="space-y-2">
				<Label for="edit-name">Full Name</Label>
				<Input id="edit-name" name="name" value={data.customer.name} required />
			</div>
			<div class="space-y-2">
				<Label for="edit-phone">Phone</Label>
				<Input id="edit-phone" name="phone" value={data.customer.phone ?? ''} />
			</div>
			<div class="space-y-2">
				<Label for="edit-email">Email</Label>
				<Input id="edit-email" name="email" type="email" value={data.customer.email ?? ''} />
			</div>
			<Button type="submit" class="w-full cursor-pointer">Save Changes</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

**File: `src/routes/(app)/customers/[id]/+page.server.ts`** — Add edit action:

```typescript
export const actions: Actions = {
	edit: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;
		const email = (data.get('email') as string)?.trim() || null;

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			db.update(customers).set({ name, phone, email }).where(eq(customers.id, params.id)).run();
		} catch (e) {
			console.error('Failed to update customer:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
```

### 6E. Confirm Dialog for Dangerous Actions

Currently, the delete product and delete customer actions use `window.confirm()` which is ugly and doesn't match the app's design. Consider creating a reusable confirmation dialog component. However, this is a lower priority cosmetic improvement — the native confirm works fine functionally.

### 6F. Order Status Management

Currently there's no way to change an order's status (e.g., mark as refunded or void) after completion. This should be added to the order detail page.

**File: `src/routes/(app)/orders/[id]/+page.svelte`** — Add status change buttons:

```svelte
<!-- Only show for admin/manager, only for completed orders -->
{#if data.user?.role !== 'sales' && data.order.status === 'completed'}
	<div class="flex gap-2">
		<form method="POST" action="?/updateStatus" use:enhance>
			<input type="hidden" name="status" value="refunded" />
			<Button
				variant="outline"
				type="submit"
				class="cursor-pointer text-amber-600"
				onclick={(e) => {
					if (!confirm('Mark this order as refunded?')) e.preventDefault();
				}}
			>
				Mark Refunded
			</Button>
		</form>
		<form method="POST" action="?/updateStatus" use:enhance>
			<input type="hidden" name="status" value="void" />
			<Button
				variant="destructive"
				type="submit"
				class="cursor-pointer"
				onclick={(e) => {
					if (!confirm('Void this order? This cannot be undone.')) e.preventDefault();
				}}
			>
				Void Order
			</Button>
		</form>
	</div>
{/if}
```

**File: `src/routes/(app)/orders/[id]/+page.server.ts`** — Add updateStatus action:

```typescript
export const actions: Actions = {
	updateStatus: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const status = data.get('status') as string;

		if (!['refunded', 'void'].includes(status)) {
			return fail(400, { error: 'Invalid status' });
		}

		try {
			db.update(orders).set({ status }).where(eq(orders.id, params.id)).run();

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'UPDATE_ORDER_STATUS',
				entity: 'order',
				entityId: params.id,
				details: `Changed order status to ${status}`
			});

			// If refunded, restore stock
			if (status === 'refunded') {
				const items = db.select().from(orderItems).where(eq(orderItems.orderId, params.id)).all();

				for (const item of items) {
					if (item.variantId) {
						db.update(productVariants)
							.set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
							.where(eq(productVariants.id, item.variantId))
							.run();

						db.insert(stockLogs)
							.values({
								id: generateId(),
								variantId: item.variantId,
								changeAmount: item.quantity,
								reason: `Return - Order ${params.id.substring(0, 8)} refunded`,
								userId: locals.user.id,
								createdAt: new Date()
							})
							.run();
					}
				}
			}
		} catch (e) {
			console.error('Failed to update order status:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
```

---

## 7. Reports Page Redesign

### Problems Identified

1. **Chart is inefficient** — The server runs N+1 queries (one per day, up to 31 DB calls in a loop) instead of a single aggregated query
2. **Chart labels are janky** — Rotated 45-degree text labels (`rotate-[-45deg]`) look messy and clip
3. **Payment Methods card is minimal** — Just two progress bars with no percentage labels or visual distinction
4. **Missing analytics sections:**
   - No **sales by category** breakdown
   - No **cashier/staff performance** (who sold the most)
   - No **top customers** for the period
   - No **refund/void summary** — refunded/voided orders are silently excluded
5. **Inventory snapshot is static** — Not related to the selected time period at all, always shows current state (this is fine conceptually but it should be visually separated)
6. **No export capability** — No way to download or print reports
7. **Custom date range is hidden** — Only visible after clicking "Custom Range" pill, confusing UX

### Changes Required

#### 7A. Fix Chart Query — Single Aggregated Query

**File: `src/routes/(app)/reports/+page.server.ts`**

Replace the loop-based chart data generation (lines 141-172) with a single query:

```typescript
// Replace the chart data loop with a single aggregated query
const chartDataRaw = db
	.select({
		day: sql<string>`date(${orders.createdAt}, 'unixepoch')`.as('day'),
		total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
		count: sql<number>`count(*)`
	})
	.from(orders)
	.where(
		and(
			eq(orders.status, 'completed'),
			gte(orders.createdAt, startDate),
			lt(orders.createdAt, endDate)
		)
	)
	.groupBy(sql`date(${orders.createdAt}, 'unixepoch')`)
	.orderBy(sql`day`)
	.all();

// Build a full date range with zero-fill for missing days
const chartData: { date: string; amount: number; count: number }[] = [];
const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
const chartDays = Math.min(daysDiff, 31);

const salesByDay = new Map(chartDataRaw.map((d) => [d.day, { amount: d.total, count: d.count }]));

for (let i = chartDays - 1; i >= 0; i--) {
	const dayDate = new Date(endDate);
	dayDate.setDate(endDate.getDate() - i);
	dayDate.setHours(0, 0, 0, 0);
	const key = dayDate.toISOString().split('T')[0]; // YYYY-MM-DD
	const dayData = salesByDay.get(key);
	chartData.push({
		date: dayDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
		amount: dayData?.amount ?? 0,
		count: dayData?.count ?? 0
	});
}
```

#### 7B. Add Sales by Category

**File: `src/routes/(app)/reports/+page.server.ts`** — Add query:

```typescript
// Sales by category
const categoryBreakdown = db
	.select({
		category: sql<string>`COALESCE(
      (SELECT p.category FROM product p
       JOIN product_variant pv ON pv.product_id = p.id
       WHERE pv.id = ${orderItems.variantId}),
      'Unknown'
    )`.as('category'),
		totalQty: sql<number>`sum(${orderItems.quantity})`,
		totalRevenue: sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`
	})
	.from(orderItems)
	.innerJoin(orders, eq(orderItems.orderId, orders.id))
	.where(
		and(
			eq(orders.status, 'completed'),
			gte(orders.createdAt, startDate),
			lt(orders.createdAt, endDate)
		)
	)
	.groupBy(sql`category`)
	.orderBy(desc(sql`totalRevenue`))
	.all();

// Add to return object:
return {
	// ... existing ...
	categoryBreakdown
};
```

#### 7C. Add Cashier Performance

**File: `src/routes/(app)/reports/+page.server.ts`** — Add query:

```typescript
import { users } from '$lib/server/db/schema';

// Cashier performance
const cashierPerformance = db
	.select({
		cashierName: users.name,
		orderCount: sql<number>`count(*)`,
		totalSales: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
		avgOrder: sql<number>`coalesce(avg(${orders.totalAmount}), 0)`
	})
	.from(orders)
	.innerJoin(users, eq(orders.userId, users.id))
	.where(
		and(
			eq(orders.status, 'completed'),
			gte(orders.createdAt, startDate),
			lt(orders.createdAt, endDate)
		)
	)
	.groupBy(users.id)
	.orderBy(desc(sql`totalSales`))
	.all();

// Add to return object:
return {
	// ... existing ...
	cashierPerformance
};
```

#### 7D. Add Top Customers

**File: `src/routes/(app)/reports/+page.server.ts`** — Add query:

```typescript
import { customers } from '$lib/server/db/schema';

// Top customers for the period
const topCustomers = db
	.select({
		customerId: customers.id,
		customerName: customers.name,
		customerPhone: customers.phone,
		orderCount: sql<number>`count(*)`,
		totalSpent: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
	})
	.from(orders)
	.innerJoin(customers, eq(orders.customerId, customers.id))
	.where(
		and(
			eq(orders.status, 'completed'),
			gte(orders.createdAt, startDate),
			lt(orders.createdAt, endDate)
		)
	)
	.groupBy(customers.id)
	.orderBy(desc(sql`totalSpent`))
	.limit(10)
	.all();

// Add to return object:
return {
	// ... existing ...
	topCustomers
};
```

#### 7E. Add Refund/Void Summary

**File: `src/routes/(app)/reports/+page.server.ts`** — Add query:

```typescript
// Refund/void summary
const refundSummary = db
	.select({
		status: orders.status,
		count: sql<number>`count(*)`,
		total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
	})
	.from(orders)
	.where(
		and(
			sql`${orders.status} IN ('refunded', 'void')`,
			gte(orders.createdAt, startDate),
			lt(orders.createdAt, endDate)
		)
	)
	.groupBy(orders.status)
	.all();

// Add to return object:
return {
	// ... existing ...
	refundSummary
};
```

#### 7F. Redesigned Frontend

**File: `src/routes/(app)/reports/+page.svelte`** — Full replacement:

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import {
		TrendingUp,
		ShoppingBag,
		Wallet,
		BarChart3,
		Package,
		Calendar,
		ArrowDownCircle,
		DollarSign,
		Users,
		UserCheck,
		Layers,
		RotateCcw,
		Printer
	} from '@lucide/svelte';
	import { formatBDT } from '$lib/format';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const periods = [
		{ value: 'today', label: 'Today' },
		{ value: 'week', label: 'Last 7 Days' },
		{ value: 'month', label: 'This Month' },
		{ value: 'year', label: 'This Year' },
		{ value: 'all', label: 'All Time' }
	];

	let customFrom = $state(data.startDate);
	let customTo = $state(data.endDate);

	function selectPeriod(period: string) {
		goto(`/reports?period=${period}`);
	}

	function applyCustomRange() {
		goto(`/reports?period=custom&from=${customFrom}&to=${customTo}`);
	}

	const maxChartValue = $derived(Math.max(...data.chartData.map((d: any) => d.amount), 1000));
	const netProfit = $derived((data.incomeSummary?.total ?? 0) - (data.expenseSummary?.total ?? 0));
	const cashTotal = $derived(
		data.paymentBreakdown.find((p: any) => p.method === 'cash')?.total ?? 0
	);
	const cardTotal = $derived(
		data.paymentBreakdown.find((p: any) => p.method === 'card')?.total ?? 0
	);
	const cashPercent = $derived(
		data.salesSummary.total > 0 ? Math.round((cashTotal / data.salesSummary.total) * 100) : 0
	);
	const cardPercent = $derived(
		data.salesSummary.total > 0 ? Math.round((cardTotal / data.salesSummary.total) * 100) : 0
	);

	// Category chart max value
	const maxCategoryRevenue = $derived(
		Math.max(...(data.categoryBreakdown?.map((c: any) => c.totalRevenue) ?? [0]), 1)
	);

	const totalRefunds = $derived(
		(data.refundSummary ?? []).reduce((sum: number, r: any) => sum + r.total, 0)
	);
	const totalRefundCount = $derived(
		(data.refundSummary ?? []).reduce((sum: number, r: any) => sum + r.count, 0)
	);
</script>

<svelte:head><title>Reports — Clothing POS</title></svelte:head>

<div class="space-y-6 p-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Reports</h1>
			<p class="text-muted-foreground">Analyze your store performance across any time period.</p>
		</div>
		<Button variant="outline" onclick={() => window.print()} class="cursor-pointer print:hidden">
			<Printer class="mr-2 h-4 w-4" /> Print Report
		</Button>
	</div>

	<!-- Period Selector + Custom Range (always visible side by side) -->
	<Card.Root class="print:hidden">
		<Card.Content class="pt-6">
			<div class="flex flex-wrap items-end gap-4">
				<!-- Period pills -->
				<div class="flex flex-wrap gap-2">
					{#each periods as p}
						<Button
							variant={data.period === p.value ? 'default' : 'outline'}
							size="sm"
							class="cursor-pointer"
							onclick={() => selectPeriod(p.value)}
						>
							{p.label}
						</Button>
					{/each}
				</div>
				<!-- Custom range — always visible -->
				<Separator orientation="vertical" class="hidden h-8 sm:block" />
				<div class="flex items-end gap-2">
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">From</Label>
						<Input type="date" bind:value={customFrom} class="h-9 w-[150px] cursor-pointer" />
					</div>
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">To</Label>
						<Input type="date" bind:value={customTo} class="h-9 w-[150px] cursor-pointer" />
					</div>
					<Button size="sm" onclick={applyCustomRange} class="cursor-pointer">
						<Calendar class="mr-2 h-4 w-4" /> Apply
					</Button>
				</div>
			</div>
			{#if data.period === 'custom'}
				<p class="mt-2 text-xs text-muted-foreground">
					Showing data from {data.startDate} to {data.endDate}
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Summary Cards Row 1: Key Metrics -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card.Root class="border-l-4 border-l-blue-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Total Revenue</Card.Title>
				<div class="rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
					<DollarSign class="h-4 w-4 text-blue-600 dark:text-blue-400" />
				</div>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
					{formatBDT(data.salesSummary.total)}
				</div>
				<p class="text-xs text-muted-foreground">{data.salesSummary.count} orders</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-emerald-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Net Cash Flow</Card.Title>
				<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
					<Wallet class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
				</div>
			</Card.Header>
			<Card.Content>
				<div
					class="text-2xl font-bold"
					class:text-emerald-600={netProfit >= 0}
					class:text-red-600={netProfit < 0}
				>
					{formatBDT(netProfit)}
				</div>
				<p class="text-xs text-muted-foreground">Income - Expenses</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-orange-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Total Expenses</Card.Title>
				<div class="rounded-full bg-orange-100 p-2 dark:bg-orange-500/20">
					<ArrowDownCircle class="h-4 w-4 text-orange-600 dark:text-orange-400" />
				</div>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
					{formatBDT(data.expenseSummary.total)}
				</div>
				<p class="text-xs text-muted-foreground">{data.expenseSummary.count} entries</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-purple-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Avg Order Value</Card.Title>
				<div class="rounded-full bg-purple-100 p-2 dark:bg-purple-500/20">
					<ShoppingBag class="h-4 w-4 text-purple-600 dark:text-purple-400" />
				</div>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
					{formatBDT(data.salesSummary.avgOrder)}
				</div>
				<p class="text-xs text-muted-foreground">
					Discounts: {formatBDT(data.salesSummary.totalDiscount)}
				</p>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Row 2: Refunds + Payment breakdown + Inventory -->
	<div class="grid gap-4 md:grid-cols-3">
		<!-- Payment Methods — improved with percentages -->
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<Wallet class="h-4 w-4" /> Payment Methods
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div>
					<div class="mb-1 flex items-center justify-between">
						<span class="text-sm font-medium">Cash</span>
						<span class="text-sm">
							<span class="font-bold text-emerald-600 dark:text-emerald-400"
								>{formatBDT(cashTotal)}</span
							>
							<span class="ml-1 text-muted-foreground">({cashPercent}%)</span>
						</span>
					</div>
					<div class="h-3 w-full overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-emerald-500 transition-all duration-500"
							style="width: {cashPercent}%"
						></div>
					</div>
				</div>
				<div>
					<div class="mb-1 flex items-center justify-between">
						<span class="text-sm font-medium">Card</span>
						<span class="text-sm">
							<span class="font-bold text-blue-600 dark:text-blue-400">{formatBDT(cardTotal)}</span>
							<span class="ml-1 text-muted-foreground">({cardPercent}%)</span>
						</span>
					</div>
					<div class="h-3 w-full overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-blue-500 transition-all duration-500"
							style="width: {cardPercent}%"
						></div>
					</div>
				</div>
				<!-- Refund/Void Summary -->
				{#if totalRefundCount > 0}
					<Separator />
					<div>
						<div class="mb-2 flex items-center gap-2">
							<RotateCcw class="h-3.5 w-3.5 text-destructive" />
							<span class="text-sm font-medium text-destructive">Returns & Voids</span>
						</div>
						{#each data.refundSummary as entry}
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground capitalize">{entry.status}</span>
								<span class="font-medium">{entry.count} orders — {formatBDT(entry.total)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Inventory Snapshot -->
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<Package class="h-4 w-4" /> Inventory Snapshot
				</Card.Title>
				<p class="text-xs text-muted-foreground">Current stock (not period-specific)</p>
			</Card.Header>
			<Card.Content>
				<div class="grid grid-cols-2 gap-4">
					<div class="rounded-lg bg-muted/50 p-3 text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalProducts}</div>
						<p class="text-xs text-muted-foreground">Products</p>
					</div>
					<div class="rounded-lg bg-muted/50 p-3 text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalVariants}</div>
						<p class="text-xs text-muted-foreground">Variants</p>
					</div>
					<div class="rounded-lg bg-muted/50 p-3 text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalStock}</div>
						<p class="text-xs text-muted-foreground">Total Units</p>
					</div>
					<div class="rounded-lg bg-primary/5 p-3 text-center">
						<div class="text-2xl font-bold text-primary">
							{formatBDT(data.inventorySummary.totalValue)}
						</div>
						<p class="text-xs text-muted-foreground">Stock Value</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Sales by Category — NEW -->
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<Layers class="h-4 w-4" /> Sales by Category
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if data.categoryBreakdown && data.categoryBreakdown.length > 0}
					{#each data.categoryBreakdown.slice(0, 6) as cat}
						<div>
							<div class="mb-1 flex items-center justify-between">
								<span class="max-w-[120px] truncate text-sm font-medium">{cat.category}</span>
								<span class="text-xs text-muted-foreground">
									{cat.totalQty} sold —
									<span class="font-bold text-foreground">{formatBDT(cat.totalRevenue)}</span>
								</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full bg-indigo-500 transition-all duration-500"
									style="width: {(cat.totalRevenue / maxCategoryRevenue) * 100}%"
								></div>
							</div>
						</div>
					{/each}
				{:else}
					<p class="py-4 text-center text-sm text-muted-foreground italic">
						No sales data for this period.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Sales Chart — improved labels -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<BarChart3 class="h-5 w-5" /> Daily Sales
			</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="relative flex h-[240px] items-end gap-1 pt-4 pb-8">
				{#each data.chartData as day, i}
					<div class="group relative flex flex-1 flex-col items-center">
						<!-- Bar -->
						<div
							class="w-full cursor-pointer rounded-t-md bg-blue-500 transition-all hover:bg-blue-400 dark:bg-blue-400 dark:hover:bg-blue-300"
							style="height: {maxChartValue > 0
								? (day.amount / maxChartValue) * 100
								: 0}%; min-height: {day.amount > 0 ? '4px' : '0px'}"
						>
							<!-- Tooltip -->
							<div
								class="absolute -top-12 left-1/2 z-10 -translate-x-1/2 scale-0 rounded-lg border bg-popover px-3 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-lg transition-all group-hover:scale-100"
							>
								<div class="font-bold">{formatBDT(day.amount)}</div>
								<div class="text-muted-foreground">{day.count} orders</div>
							</div>
						</div>
						<!-- Label — horizontal, show selectively to avoid overlap -->
						{#if data.chartData.length <= 14 || i % 2 === 0}
							<span class="absolute -bottom-7 text-[10px] whitespace-nowrap text-muted-foreground">
								{day.date}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Row 3: Top Products + Cashier Performance + Top Customers -->
	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Top Selling Products -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<TrendingUp class="h-4 w-4" /> Top Products
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-8">#</Table.Head>
							<Table.Head>Product</Table.Head>
							<Table.Head class="text-right">Qty</Table.Head>
							<Table.Head class="text-right">Revenue</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.topProducts as product, i}
							<Table.Row>
								<Table.Cell>
									<Badge
										variant={i < 3 ? 'default' : 'outline'}
										class={i === 0
											? 'bg-amber-500 text-white'
											: i === 1
												? 'bg-gray-400 text-white'
												: i === 2
													? 'bg-amber-700 text-white'
													: ''}
									>
										{i + 1}
									</Badge>
								</Table.Cell>
								<Table.Cell class="text-sm font-medium">{product.productName}</Table.Cell>
								<Table.Cell class="text-right text-sm">{product.totalQty}</Table.Cell>
								<Table.Cell class="text-right text-sm font-bold"
									>{formatBDT(product.totalRevenue)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if data.topProducts.length === 0}
							<Table.Row>
								<Table.Cell colspan={4} class="h-20 text-center text-muted-foreground italic">
									No sales data.
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<!-- Cashier Performance — NEW -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<UserCheck class="h-4 w-4" /> Cashier Performance
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Cashier</Table.Head>
							<Table.Head class="text-right">Orders</Table.Head>
							<Table.Head class="text-right">Total Sales</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.cashierPerformance ?? [] as cashier, i}
							<Table.Row>
								<Table.Cell>
									<div class="flex items-center gap-2">
										<div
											class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
										>
											{cashier.cashierName.charAt(0)}
										</div>
										<span class="text-sm font-medium">{cashier.cashierName}</span>
									</div>
								</Table.Cell>
								<Table.Cell class="text-right text-sm">{cashier.orderCount}</Table.Cell>
								<Table.Cell class="text-right text-sm font-bold"
									>{formatBDT(cashier.totalSales)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if (data.cashierPerformance ?? []).length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="h-20 text-center text-muted-foreground italic">
									No sales data.
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<!-- Top Customers — NEW -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-sm font-medium">
					<Users class="h-4 w-4" /> Top Customers
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Customer</Table.Head>
							<Table.Head class="text-right">Orders</Table.Head>
							<Table.Head class="text-right">Spent</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.topCustomers ?? [] as customer, i}
							<Table.Row>
								<Table.Cell>
									<a href="/customers/{customer.customerId}" class="hover:underline">
										<div class="text-sm font-medium">{customer.customerName}</div>
										{#if customer.customerPhone}
											<div class="text-[10px] text-muted-foreground">{customer.customerPhone}</div>
										{/if}
									</a>
								</Table.Cell>
								<Table.Cell class="text-right text-sm">{customer.orderCount}</Table.Cell>
								<Table.Cell class="text-right text-sm font-bold"
									>{formatBDT(customer.totalSpent)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if (data.topCustomers ?? []).length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="h-20 text-center text-muted-foreground italic">
									No customer data.
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>
```

### Summary of Reports Changes

| Sub-task | What                          | Why                                                                                                                                               |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7A       | Single aggregated chart query | Fix N+1 query performance (31 queries → 1)                                                                                                        |
| 7B       | Sales by category breakdown   | Know which product categories perform best                                                                                                        |
| 7C       | Cashier performance table     | Track staff sales performance                                                                                                                     |
| 7D       | Top customers for period      | Identify VIP customers per time range                                                                                                             |
| 7E       | Refund/void summary           | Visibility into returns/voids                                                                                                                     |
| 7F       | Full frontend redesign        | Fix chart labels, add percentage to payment bars, add print button, always-visible custom range, visual cards for inventory, 3-column bottom grid |

---

## 8. Typography — Professional Font System

### Problem

The app uses system default fonts everywhere (Tailwind's default sans-serif stack). For a POS/retail management system, typography should feel professional, highly readable at small sizes (tables, badges, receipts), and distinct across different UI contexts.

### Font Recommendations (Google Fonts — Free)

| Context                                                  | Font                           | Why                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI / Body** (navigation, labels, buttons, form fields) | **Inter**                      | Industry standard for dashboard UIs. Excellent at small sizes (11-14px), highly legible, has tabular numbers (`font-feature-settings: "tnum"`). Used by Linear, Vercel, Stripe.             |
| **Headings** (page titles, card titles, dialog titles)   | **Inter** (same, bold weights) | Inter's bold/semibold weights are distinct enough. Using the same family for headings + body keeps the design clean and professional. One font family is standard for POS/admin dashboards. |
| **Monospace** (barcodes, order IDs, codes)               | **JetBrains Mono**             | Purpose-built for code/data display. Clear distinction between similar characters (0/O, 1/l/I). Looks great in barcode labels and order IDs.                                                |
| **Receipts** (thermal printer output)                    | **Courier New** (keep as-is)   | Thermal printers expect monospace. Keep the existing `Courier New` for receipt printing — this is correct and standard.                                                                     |

### Why NOT different fonts for headings?

For a **data-heavy POS dashboard**, mixing serif or display fonts with sans-serif body text creates visual noise. The best retail/admin dashboards (Square, Shopify Admin, Lightspeed) all use **a single sans-serif family** with weight variation. Inter covers this perfectly with weights from 100-900.

### Changes Required

#### 8A. Add Google Fonts

**File: `src/app.html`** — Add font links in `<head>`:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
		<link
			href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
			rel="stylesheet"
		/>
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

#### 8B. Configure Tailwind Font Families

**File: `src/routes/layout.css`** — Add font theme configuration inside the `@theme inline` block:

```css
@theme inline {
	/* ... existing radius/color variables ... */

	--font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
	--font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}
```

This automatically applies Inter as the default body font (Tailwind's `font-sans`) and JetBrains Mono for any `font-mono` usage.

#### 8C. Enable Tabular Numbers for Financial Data

**File: `src/routes/layout.css`** — Add to the `@layer base` section:

```css
@layer base {
	/* ... existing rules ... */

	/* Tabular numbers for financial data — ensures columns align */
	.font-bold,
	.font-black,
	.text-primary,
	td,
	th,
	[class*='font-mono'] {
		font-feature-settings: 'tnum';
	}
}
```

Tabular numbers ensure that currency values like `৳1,234.00` and `৳999.00` align properly in table columns because each digit takes equal width.

#### 8D. Update Receipt Font (Keep Courier New)

No change needed for receipts — the existing `font-family: 'Courier New', monospace` in the receipt `printReceipt()` functions is correct for thermal printers.

#### 8E. Update Barcode Labels Font

**File: `src/routes/(app)/inventory/[id]/labels/+page.svelte`** — Change `font-family: Arial` to:

```css
font-family: 'Inter', Arial, sans-serif;
```

And for the barcode text underneath:

```css
.barcode-text {
	font-family: 'JetBrains Mono', monospace;
}
```

### Summary

- **1 font family for all UI** (Inter) — clean, professional, no visual noise
- **1 monospace font** (JetBrains Mono) — for barcodes, order IDs, code blocks
- **Keep Courier New** for receipts — printer compatibility
- **Tabular numbers** enabled globally for financial data alignment
- Total Google Fonts load: ~100KB (Inter 6 weights + JetBrains Mono 3 weights)

---

## Summary of All Changes

| #   | Change                                       | Files Affected                                                  | Priority |
| --- | -------------------------------------------- | --------------------------------------------------------------- | -------- |
| 1   | Remove header, move theme/user to sidebar    | `(app)/+layout.svelte`, `pos/+page.svelte`                      | High     |
| 2A  | Fix Add Variant — use size template selector | `inventory/[id]/+page.svelte`, `inventory/[id]/+page.server.ts` | High     |
| 2B  | Add Delete Variant                           | `inventory/[id]/+page.svelte`, `inventory/[id]/+page.server.ts` | High     |
| 2C  | Add Edit Variant (price override)            | `inventory/[id]/+page.svelte`, `inventory/[id]/+page.server.ts` | Medium   |
| 3   | Orders — date range filter + pagination      | `orders/+page.svelte`, `orders/+page.server.ts`                 | High     |
| 4   | Customer detail — pagination + status        | `customers/[id]/+page.svelte`, `customers/[id]/+page.server.ts` | Medium   |
| 5   | Dynamic tab names                            | All page `.svelte` files (~15 files)                            | Medium   |
| 6A  | Inventory category filter                    | `inventory/+page.svelte`, `inventory/+page.server.ts`           | Low      |
| 6B  | Inventory pagination                         | `inventory/+page.svelte`, `inventory/+page.server.ts`           | Low      |
| 6C  | Customers list pagination                    | `customers/+page.svelte`, `customers/+page.server.ts`           | Low      |
| 6D  | Customer edit feature                        | `customers/[id]/+page.svelte`, `customers/[id]/+page.server.ts` | Medium   |
| 6F  | Order status management (refund/void)        | `orders/[id]/+page.svelte`, `orders/[id]/+page.server.ts`       | Medium   |
| 7A  | Fix chart N+1 query → single aggregate       | `reports/+page.server.ts`                                       | High     |
| 7B  | Add sales by category                        | `reports/+page.server.ts`                                       | Medium   |
| 7C  | Add cashier performance                      | `reports/+page.server.ts`                                       | Medium   |
| 7D  | Add top customers                            | `reports/+page.server.ts`                                       | Medium   |
| 7E  | Add refund/void summary                      | `reports/+page.server.ts`                                       | Medium   |
| 7F  | Reports frontend redesign                    | `reports/+page.svelte`                                          | High     |
| 8A  | Add Google Fonts (Inter + JetBrains Mono)    | `app.html`                                                      | High     |
| 8B  | Configure Tailwind font families             | `layout.css`                                                    | High     |
| 8C  | Enable tabular numbers                       | `layout.css`                                                    | Medium   |
| 8E  | Update barcode labels font                   | `inventory/[id]/labels/+page.svelte`                            | Low      |

### Implementation Order (Recommended)

1. **Typography setup** (8A, 8B, 8C) — Foundation, affects everything visually. Do first.
2. **Dynamic tab names** (5) — Quick win, touch all pages but minimal changes
3. **Remove header** (1) — Layout change, do early to establish new structure
4. **Inventory fixes** (2A, 2B, 2C) — Core feature fixes
5. **Order history redesign** (3) — Major feature improvement
6. **Customer detail** (4, 6D) — Related improvements
7. **Reports redesign** (7A-7F) — Fix performance + add analytics
8. **Pagination everywhere** (6A, 6B, 6C) — Scalability improvements
9. **Order status management** (6F) — Feature addition
10. **Barcode label font** (8E) — Minor polish
