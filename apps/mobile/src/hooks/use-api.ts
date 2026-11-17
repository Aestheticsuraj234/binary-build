import {useFocusEffect} from 'expo-router';
import {useCallback, useState} from 'react';

import {apiJson} from '@/lib/api';

interface ApiState<T> {
  data: T | undefined;
  error: string | undefined;
  /** Loads again, for example after saving something. */
  reload: () => Promise<void>;
}

/**
 * Loads `path` from the API whenever the screen comes into view, so going
 * back to a screen always shows fresh data.
 */
export function useApi<T>(path: string): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setData(await apiJson<T>(path));
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return {data, error, reload};
}
