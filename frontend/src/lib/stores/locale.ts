import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { loadTranslations, getEnglish, type Locale, type Translations } from '$lib/i18n';

const STORAGE_KEY = 'locale';

function getInitialLocale(): Locale {
	if (!browser) return 'en';
	const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
	if (stored && ['en', 'fil', 'ja', 'zh', 'vi'].includes(stored)) return stored;
	return 'en';
}

function createLocaleStore() {
	const initial = getInitialLocale();
	const { subscribe, set: rawSet } = writable<Locale>(initial);

	// Internal translations store
	const translations = writable<Translations>(getEnglish());

	// Load initial translations
	if (browser && initial !== 'en') {
		loadTranslations(initial).then((t) => translations.set(t));
	}

	if (browser) {
		document.documentElement.lang = initial;
	}

	return {
		subscribe,
		translations,
		async set(locale: Locale) {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, locale);
				document.documentElement.lang = locale === 'fil' ? 'tl' : locale;
			}
			rawSet(locale);
			const t = await loadTranslations(locale);
			translations.set(t);
		},
	};
}

export const localeStore = createLocaleStore();

/**
 * Get a nested value from translations by dot-notation key.
 * Supports simple {param} interpolation.
 *
 * Usage in components:
 *   import { t } from '$lib/stores/locale';
 *   $t('nav.browse')
 *   $t('products.newProductsAvailable', { count: 5 })
 */
export const t = derived(localeStore.translations, ($translations) => {
	return (key: string, params?: Record<string, string | number>): string => {
		const parts = key.split('.');
		let value: any = $translations;
		for (const part of parts) {
			value = value?.[part];
		}

		// Fallback to English if key not found
		if (value === undefined || value === null) {
			let fallback: any = getEnglish();
			for (const part of parts) {
				fallback = fallback?.[part];
			}
			value = fallback ?? key;
		}

		if (typeof value !== 'string') return key;

		// Simple {param} interpolation
		if (params) {
			return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
		}

		return value;
	};
});
