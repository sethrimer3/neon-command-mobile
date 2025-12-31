import { useCallback, useEffect, useState } from 'react';

/**
 * A persistent state hook that stores values in localStorage for non-Spark environments.
 * Falls back to the provided initial value when storage is unavailable or invalid.
 * @param key - Storage key for the persisted value.
 * @param initialValue - Default value to use when nothing is stored yet.
 * @returns The current value, a setter function, and a delete function.
 */
export function useKV<T>(
  key: string,
  initialValue?: T,
): readonly [T | undefined, (newValue: T | ((oldValue?: T) => T)) => void, () => void] {
  // Store the value in React state so components re-render on updates.
  const [value, setValue] = useState<T | undefined>(initialValue);

  // Load the stored value once on mount (or when the key changes).
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedValue = window.localStorage.getItem(key);

    if (storedValue === null) {
      setValue(initialValue);
      return;
    }

    try {
      setValue(JSON.parse(storedValue) as T);
    } catch (error) {
      console.warn('Failed to parse stored value, resetting to default.', error);
      setValue(initialValue);
    }
  }, [key, initialValue]);

  // Persist changes to localStorage whenever the value updates.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (value === undefined) {
      window.localStorage.removeItem(key);
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Failed to persist value to localStorage.', error);
    }
  }, [key, value]);

  // Keep a setter API aligned with Spark's useKV hook shape.
  const setStoredValue = useCallback(
    (newValue: T | ((oldValue?: T) => T)) => {
      setValue((currentValue) => (typeof newValue === 'function' ? newValue(currentValue) : newValue));
    },
    [],
  );

  // Expose a delete helper to clear the stored value.
  const deleteValue = useCallback(() => {
    setValue(undefined);
  }, []);

  return [value, setStoredValue, deleteValue];
}
