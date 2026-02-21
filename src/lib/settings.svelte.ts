// Global settings state for localized formatting
class SettingsState {
	private dbLocale = $state<string | null>(null);
	private dbTimezone = $state<string | null>(null);
	private dbCurrency = $state<string | null>(null);

	// effective locale: Hardcoded for BD
	get locale() {
		return 'en-GB';
	}

	// effective timezone: Hardcoded for BD
	get timezone() {
		return 'Asia/Dhaka';
	}

	// effective currency: Hardcoded for BD
	get currency() {
		return 'BDT';
	}

	update(
		newLocale: string | null | undefined,
		newTimezone: string | null | undefined,
		newCurrency: string | null | undefined
	) {
		this.dbLocale = newLocale && newLocale.trim() !== '' ? newLocale : null;
		this.dbTimezone = newTimezone && newTimezone.trim() !== '' ? newTimezone : null;
		this.dbCurrency = newCurrency && newCurrency.trim() !== '' ? newCurrency : null;
	}
}

export const globalSettings = new SettingsState();
