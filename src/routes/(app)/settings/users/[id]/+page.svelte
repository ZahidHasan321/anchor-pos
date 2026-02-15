<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import {
		ChevronLeft,
		Save,
		Loader2,
		User,
		Phone,
		Mail,
		Shield,
		Image as ImageIcon,
		Camera
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { roleLabels } from '$lib/utils';

	let { data, form } = $props();
	let loading = $state(false);
	let previewUrl = $state<string | null>(null);

	$effect(() => {
		if (form?.success) {
			toast.success(form.message || 'Updated successfully');
		} else if (form?.message) {
			toast.error(form.message);
		}
	});
</script>

<div class="space-y-6 p-3 sm:p-6">
	<div class="flex items-center gap-4">
		<Button variant="outline" size="icon" href="/settings/users" class="cursor-pointer">
			<ChevronLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">User Details</h1>
			<p class="text-sm text-muted-foreground sm:text-base">
				View and edit staff profile information.
			</p>
		</div>
	</div>

	<form
		method="POST"
		action="?/update"
		enctype="multipart/form-data"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-6"
	>
		<div class="grid gap-6 lg:grid-cols-12">
			<!-- Sidebar Profile Info -->
			<div class="lg:col-span-4">
				<Card.Root>
					<Card.Content class="pt-6">
						<div class="flex flex-col items-center text-center">
							<label class="group relative cursor-pointer" for="image-upload">
								<Avatar.Root
									class="h-24 w-24 border-2 border-muted transition-colors group-hover:border-primary"
								>
									<Avatar.Image src={previewUrl || data.user.imageUrl} alt={data.user.name} />
									<Avatar.Fallback class="text-2xl">{data.user.name.charAt(0)}</Avatar.Fallback>
								</Avatar.Root>
								<div
									class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<Camera class="h-8 w-8 text-white" />
								</div>
								<input
									id="image-upload"
									name="image"
									type="file"
									class="hidden"
									accept="image/*"
									onchange={(e) => {
										const file = e.currentTarget.files?.[0];
										if (file) {
											if (file.size > 2 * 1024 * 1024) {
												toast.error('Image size must be less than 2MB');
												e.currentTarget.value = '';
												return;
											}
											previewUrl = URL.createObjectURL(file);
										}
									}}
								/>
							</label>
							<h2 class="mt-4 text-xl font-bold">{data.user.name}</h2>
							<p class="text-muted-foreground">@{data.user.username}</p>
							<div class="mt-4 flex flex-wrap justify-center gap-2">
								<span
									class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
								>
									{roleLabels[data.user.role] ?? data.user.role}
								</span>
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {data
										.user.isActive
										? 'bg-emerald-100 text-emerald-700'
										: 'bg-red-100 text-red-700'}"
								>
									{data.user.isActive ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>

						<div class="mt-8 space-y-4">
							<div class="flex items-center gap-3 text-sm">
								<Mail class="h-4 w-4 text-muted-foreground" />
								<span>{data.user.email || 'No email provided'}</span>
							</div>
							<div class="flex items-center gap-3 text-sm">
								<Phone class="h-4 w-4 text-muted-foreground" />
								<span>{data.user.phone || 'No phone provided'}</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>

			<!-- Edit Form -->
			<div class="lg:col-span-8">
				<Card.Root>
					<Card.Header>
						<Card.Title>Edit Profile</Card.Title>
						<Card.Description>Update personal and account information.</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-6">
							<div class="grid gap-6 md:grid-cols-2">
								<div class="space-y-2">
									<Label for="name">Full Name</Label>
									<div class="relative">
										<User class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
										<Input id="name" name="name" value={data.user.name} class="pl-10" required />
									</div>
								</div>

								<div class="space-y-2">
									<Label for="username">Username</Label>
									<div class="relative">
										<span class="absolute top-2.5 left-3 text-sm text-muted-foreground">@</span>
										<Input
											id="username"
											name="username"
											value={data.user.username}
											class="pl-7"
											required
										/>
									</div>
								</div>
							</div>

							<div class="grid gap-6 md:grid-cols-2">
								<div class="space-y-2">
									<Label for="email">Email Address</Label>
									<div class="relative">
										<Mail class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
										<Input
											id="email"
											name="email"
											type="email"
											value={data.user.email}
											class="pl-10"
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="phone">Phone Number</Label>
									<div class="relative">
										<Phone class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
										<Input id="phone" name="phone" value={data.user.phone} class="pl-10" />
									</div>
								</div>
							</div>

							<div class="space-y-2">
								<Label for="role">System Role</Label>
								<div class="relative">
									<Shield class="absolute top-3 left-3 z-10 h-4 w-4 text-muted-foreground" />
									<select
										name="role"
										class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
										value={data.user.role}
										required
									>
										<option value="sales">Sales Person</option>
										<option value="manager">Inventory Manager</option>
										<option value="admin">Admin (Owner)</option>
									</select>
								</div>
							</div>

							<div class="flex justify-end">
								<Button type="submit" class="cursor-pointer" disabled={loading}>
									{#if loading}
										<Loader2 class="mr-2 h-4 w-4 animate-spin" />
									{/if}
									<Save class="mr-2 h-4 w-4" />
									Save Changes
								</Button>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</form>
</div>
