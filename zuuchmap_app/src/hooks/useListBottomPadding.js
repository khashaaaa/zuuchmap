import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, safeAreaHelpers } from '../design/theme';

/**
 * The bottom padding a scrolling screen's content needs so its last row
 * clears whatever sits below it.
 *
 * Inside the dashboards' tabs the tab bar is laid out (not overlaid) and
 * already owns the system inset, so a breath of space is enough. The same
 * screens also open as plain stack screens (Saved, Messages, a category's
 * posts), where nothing owns the inset and the gesture bar would sit on the
 * last row. Each screen used to guess — browse padded for an overlaid bar by
 * hand, Saved and Messages padded for neither, and their last row ended
 * under the tab bar.
 */
export function useListBottomPadding(extra = spacing.xl) {
    const tabBarHeight = useContext(BottomTabBarHeightContext);
    const insets = useSafeAreaInsets();
    return (tabBarHeight != null ? 0 : safeAreaHelpers.getBottomSafeArea(insets)) + extra;
}

export default useListBottomPadding;
