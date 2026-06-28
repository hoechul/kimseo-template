"use client";

import { useEffect, useState } from "react";

export function usePersistedTab<T extends string>(
  storageKey: string,
  defaultValue: T,
  values: readonly T[],
  hydrationReady = true
) {
  const [value, setValue] = useState<T>(defaultValue);
  const [isReady, setIsReady] = useState(false);
  const [storedValue, setStoredValue] = useState<string | null>();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStoredValue(window.localStorage.getItem(storageKey));
    } catch {
      setStoredValue(null);
    }
  }, [storageKey]);

  useEffect(() => {
    if (storedValue === undefined || !hydrationReady) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue((currentValue) => {
      if (storedValue && values.includes(storedValue as T) && currentValue === defaultValue) {
        return storedValue as T;
      }

      return values.includes(currentValue) ? currentValue : defaultValue;
    });

    setIsReady(true);
  }, [defaultValue, hydrationReady, storedValue, values]);

  useEffect(() => {
    if (!isReady || !values.includes(value)) return;

    try {
      window.localStorage.setItem(storageKey, value);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStoredValue(value);
    } catch {
      // Ignore storage failures and keep the in-memory selection.
    }
  }, [isReady, storageKey, value, values]);

  return [value, setValue, isReady] as const;
}
