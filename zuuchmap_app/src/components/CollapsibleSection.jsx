import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Optional-detail disclosure. Web's equivalent is
// zuuchmap_web/src/components/CollapsibleSection.jsx — keep the behaviour aligned.
const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
    const { colors } = useAppTheme();
    const [open, setOpen] = useState(defaultOpen);
    const styles = useMemo(() => createStyles(colors), [colors]);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen((v) => !v);
    };

    return (
        <View style={styles.wrap}>
            <PressableScale
                onPress={toggle}
                style={styles.header}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
            >
                <Text style={styles.title}>{title}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.secondary} />
            </PressableScale>
            {open && <View style={styles.body}>{children}</View>}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    wrap: { marginBottom: spacing.xl },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
    },
    title: { ...typography.styles.labelStrong, color: colors.text.primary },
    body: { paddingTop: spacing.md },
});

export default CollapsibleSection;
