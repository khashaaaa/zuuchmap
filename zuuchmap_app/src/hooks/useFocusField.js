import { useCallback } from 'react';
import { logger } from '../utils/logger';

const SCROLL_OFFSET = 100;

/**
 * Returns a function that focuses an input and scrolls the scroll view so the field is visible.
 * @param {React.RefObject} scrollViewRef - Ref to the ScrollView
 * @param {React.RefObject} inputRefs - Ref object holding input refs by field name
 * @returns {(fieldName: string) => void}
 */
export const useFocusField = (scrollViewRef, inputRefs) => {
    return useCallback((fieldName) => {
        const input = inputRefs?.current?.[fieldName];
        const scrollView = scrollViewRef?.current;
        if (!input || !scrollView) return;
        input.focus();
        input.measureLayout(
            scrollView,
            (x, y) => {
                scrollView.scrollTo({ y: y - SCROLL_OFFSET, animated: true });
            },
            () => logger.warn('Measurement failed')
        );
    }, [scrollViewRef, inputRefs]);
};
