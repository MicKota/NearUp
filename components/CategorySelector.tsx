import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { EVENT_CATEGORIES } from '../types/eventCategory';

type Props = {
  selected: string[];
  onChange: (cats: string[]) => void;
};

export default function CategorySelector({ selected, onChange }: Props) {
  const toggle = (cat: string) => {
    if (selected.includes(cat)) onChange(selected.filter(s => s !== cat));
    else onChange([...selected, cat]);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Wybierz kategorie:</Text>
      <View style={styles.list}>
        {EVENT_CATEGORIES.map(cat => {
          const active = selected.includes(cat);
          return (
            <Pressable key={cat} onPress={() => toggle(cat)} style={[styles.item, active && styles.itemActive]}>
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{cat}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'flex-start', marginBottom: 8 },
  label: { fontWeight: 'bold', marginBottom: 6 },
  list: { flexDirection: 'row', flexWrap: 'wrap' },
  item: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 8,
    marginBottom: 8,
  },
  itemActive: {
    backgroundColor: '#4E6EF2',
    borderColor: '#4E6EF2',
  },
  itemText: { color: '#333' },
  itemTextActive: { color: '#fff', fontWeight: '600' },
});
