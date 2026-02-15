// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: string;
				name: string;
				username: string;
				role: 'admin' | 'manager' | 'sales';
				theme: 'light' | 'dark' | 'system';
				email: string | null;
				phone: string | null;
				imageUrl: string | null;
			} | null;
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
