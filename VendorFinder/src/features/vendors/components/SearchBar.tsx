// src/features/vendors/components/SearchBar.tsx
// Thin themed wrapper over TextField for the search input.

import React from 'react';
import { TextField } from '../../../components/TextField';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search vendors...' }: SearchBarProps) {
  return (
    <TextField
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
    />
  );
}
