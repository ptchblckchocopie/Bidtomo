export const categories = [
	{ label: 'Electronics', value: 'electronics' },
	{ label: 'Fashion', value: 'fashion' },
	{ label: 'Home & Garden', value: 'home_garden' },
	{ label: 'Sports & Outdoors', value: 'sports_outdoors' },
	{ label: 'Collectibles', value: 'collectibles' },
	{ label: 'Vehicles', value: 'vehicles' },
	{ label: 'Books & Media', value: 'books_media' },
	{ label: 'Toys & Games', value: 'toys_games' },
	{ label: 'Art & Crafts', value: 'art_crafts' },
	{ label: 'Beauty & Health', value: 'beauty_health' },
	{ label: 'Jewelry & Watches', value: 'jewelry_watches' },
	{ label: 'Musical Instruments', value: 'musical_instruments' },
	{ label: 'Pet Supplies', value: 'pet_supplies' },
	{ label: 'Tools & Equipment', value: 'tools_equipment' },
	{ label: 'Food & Beverages', value: 'food_beverages' },
	{ label: 'Tickets & Vouchers', value: 'tickets_vouchers' },
	{ label: 'Real Estate', value: 'real_estate' },
	{ label: 'Services', value: 'services' },
	{ label: 'Other', value: 'other' },
] as const;

export type CategoryValue = (typeof categories)[number]['value'];

export function getCategoryLabel(value: string): string {
	return categories.find((c) => c.value === value)?.label || value;
}
