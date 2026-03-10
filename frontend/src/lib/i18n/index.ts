import en from './en.json';

export type Locale = 'en' | 'fil' | 'ja' | 'zh' | 'vi';

export type Translations = typeof en;

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
	{ code: 'en', label: 'English', nativeLabel: 'English' },
	{ code: 'fil', label: 'Filipino', nativeLabel: 'Filipino' },
	{ code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
	{ code: 'zh', label: 'Chinese', nativeLabel: '中文' },
	{ code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
];

const cache = new Map<Locale, Translations>();
cache.set('en', en);

export async function loadTranslations(locale: Locale): Promise<Translations> {
	const cached = cache.get(locale);
	if (cached) return cached;

	let translations: Translations;
	switch (locale) {
		case 'fil':
			translations = (await import('./fil.json')).default as unknown as Translations;
			break;
		case 'ja':
			translations = (await import('./ja.json')).default as unknown as Translations;
			break;
		case 'zh':
			translations = (await import('./zh.json')).default as unknown as Translations;
			break;
		case 'vi':
			translations = (await import('./vi.json')).default as unknown as Translations;
			break;
		default:
			translations = en;
	}

	cache.set(locale, translations);
	return translations;
}

export function getEnglish(): Translations {
	return en;
}
