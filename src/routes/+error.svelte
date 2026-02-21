<script lang="ts">
    import { page } from '$app/stores';
    import { Button } from '$lib/components/ui/button';
    import { AlertCircle, RefreshCw, Home, ServerCrash } from '@lucide/svelte';
    import { browser } from '$app/environment';

    const status = $derived($page.status);
    const message = $derived($page.error?.message || 'An unexpected error occurred');

    function reload() {
        if (browser) window.location.reload();
    }
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
    <div class="mb-6 rounded-full bg-destructive/10 p-4 text-destructive">
        {#if status === 404}
            <AlertCircle size={48} />
        {:else}
            <ServerCrash size={48} />
        {/if}
    </div>

    <h1 class="mb-2 text-3xl font-black tracking-tighter italic text-foreground uppercase">
        {#if status === 404}
            Page Not Found
        {:else}
            System Error
        {/if}
    </h1>

    <p class="mb-8 max-w-md text-muted-foreground">
        {message}
        {#if status !== 404}
            <br/><span class="mt-2 block text-xs opacity-50 font-mono">Status Code: {status}</span>
        {/if}
    </p>

    <div class="flex flex-col gap-3 sm:flex-row">
        <Button variant="default" size="lg" onclick={reload} class="gap-2">
            <RefreshCw size={18} />
            Try Again
        </Button>
        
        <Button variant="outline" size="lg" href="/dashboard" class="gap-2">
            <Home size={18} />
            Back to Dashboard
        </Button>
    </div>

    <div class="mt-12 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-30">
        Anchor POS Native Engine
    </div>
</div>
