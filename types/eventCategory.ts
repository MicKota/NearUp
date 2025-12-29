export type EventCategory = 'Sport' | 'Kultura' | 'Gry planszowe' | 'Podróże' | 'Filmy' | 'Inne';

export type EventCategoryOption = {
	value: EventCategory;
	label: string;
};

export const EVENT_CATEGORIES: EventCategory[] = ['Sport', 'Kultura', 'Gry planszowe', 'Podróże', 'Filmy', 'Inne'];

export const EVENT_CATEGORY_OPTIONS: EventCategoryOption[] = EVENT_CATEGORIES.map((value) => ({
	value,
	label: value,
}));