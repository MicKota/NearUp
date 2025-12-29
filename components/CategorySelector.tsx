import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { EVENT_CATEGORY_OPTIONS, EventCategory, EventCategoryOption } from '../types/eventCategory';

type PropsMultiple = {
  selected: EventCategory[];
  onChange: (value: EventCategory[]) => void;
  label?: string;
  options?: EventCategoryOption[];
  mode: 'multiple';
  containerStyle?: StyleProp<ViewStyle>;
};

type PropsSingle = {
  selected: EventCategory | '';
  onChange: (value: EventCategory | '') => void;
  label?: string;
  options?: EventCategoryOption[];
  mode: 'single';
  containerStyle?: StyleProp<ViewStyle>;
};

type Props = PropsMultiple | PropsSingle;

export default function CategorySelector({
  selected,
  onChange,
  label,
  options = EVENT_CATEGORY_OPTIONS,
  mode = 'multiple',
  containerStyle,
}: Props) {
  const toggle = (cat: EventCategory) => {
    if (mode === 'multiple') {
      const arr = Array.isArray(selected) ? selected : [];
      if (arr.includes(cat)) {
        (onChange as (val: EventCategory[]) => void)(arr.filter(s => s !== cat));
      } else {
        (onChange as (val: EventCategory[]) => void)([...arr, cat]);
      }
    } else {
      // single mode
      const newVal = (selected as string | EventCategory) === cat ? ('' as const) : cat;
      (onChange as (val: EventCategory | '') => void)(newVal);
    }
  };

  const getLabel = () => {
    if (label) return label;
    return mode === 'multiple' ? 'Wybierz kategorie:' : 'Wybierz kategorię:';
  };

  const isActive = (cat: EventCategory) => {
    if (mode === 'multiple') {
      return Array.isArray(selected) && selected.includes(cat);
    } else {
      return (selected as string | EventCategory) === cat;
    }
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {!!getLabel() && <Text style={styles.label}>{getLabel()}</Text>}
      <View style={styles.list}>
        {options.map(({ value, label: optionLabel }) => {
          const active = isActive(value);
          return (
            <Pressable key={value} onPress={() => toggle(value)} style={[styles.item, active && styles.itemActive]}>
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{optionLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginBottom: 8 },
  label: { fontWeight: 'bold', marginBottom: 6 },
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  item: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  itemActive: {
    backgroundColor: '#4E6EF2',
    borderColor: '#4E6EF2',
  },
  itemText: { fontSize: 14, color: '#333', fontWeight: '500' },
  itemTextActive: { color: '#fff', fontWeight: '600' },
});
