import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemePreference = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
	if (browser && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

function createThemeStore() {
	const initial: ThemePreference = browser
		? (localStorage.getItem('theme_preference') as ThemePreference) || 'system'
		: 'system';

	const { subscribe, set: rawSet, update } = writable<ThemePreference>(initial);

	function applyTheme(pref: ThemePreference) {
		if (!browser) return;
		const resolved = pref === 'system' ? getSystemTheme() : pref;
		document.documentElement.classList.toggle('dark', resolved === 'dark');
	}

	if (browser) {
		applyTheme(initial);

		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			const currentPref =
				(localStorage.getItem('theme_preference') as ThemePreference) || 'system';
			if (currentPref === 'system') {
				applyTheme('system');
			}
		});
	}

	return {
		subscribe,
		set(value: ThemePreference) {
			if (browser) {
				localStorage.setItem('theme_preference', value);
			}
			rawSet(value);
			applyTheme(value);
		},
		toggle() {
			update((current) => {
				const resolved = current === 'system' ? getSystemTheme() : current;
				const next: ThemePreference = resolved === 'light' ? 'dark' : 'light';
				if (browser) {
					localStorage.setItem('theme_preference', next);
				}
				applyTheme(next);
				return next;
			});
		}
	};
}

export const themeStore = createThemeStore();

export const isDark = derived(themeStore, ($theme) => {
	if ($theme === 'system') {
		return browser ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
	}
	return $theme === 'dark';
});
