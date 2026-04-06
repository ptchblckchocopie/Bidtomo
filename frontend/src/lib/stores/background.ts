import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type BackgroundType = 'horizontal_wave' | 'interactive_tile' | 'silk' | 'stream' | 'none';

const STORAGE_KEY = 'background_preference';

function createBackgroundStore() {
	const initial: BackgroundType = browser
		? (localStorage.getItem(STORAGE_KEY) as BackgroundType) || 'stream'
		: 'stream';

	const { subscribe, set: rawSet } = writable<BackgroundType>(initial);

	return {
		subscribe,
		set(value: BackgroundType) {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, value);
			}
			rawSet(value);
		},
	};
}

export const backgroundStore = createBackgroundStore();
