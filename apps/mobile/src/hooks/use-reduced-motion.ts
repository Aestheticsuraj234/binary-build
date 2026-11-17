import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/** True when the person asked their phone to reduce motion. */
export function useReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (isMounted) {
        setIsReduced(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setIsReduced,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return isReduced;
}
