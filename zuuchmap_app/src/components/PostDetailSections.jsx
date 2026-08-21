import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { interactions } from '../design/theme';

/**
 * Presentational building blocks for PostDetailScreen.
 *
 * Each takes `colors` and the screen's `styles` object rather than owning a
 * stylesheet, so the detail screen keeps a single source of layout truth.
 */

export const DetailItem = React.memo(({ icon, label, children, colors, styles }) => (
    <View style={styles.detailItem}>
        <View style={[styles.detailIcon, { backgroundColor: colors.opacity.background.primary }]}>
            <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.detailContent}>
            <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>{label}</Text>
            {typeof children === 'string' ? (
                <Text style={[styles.detailValue, { color: colors.text.primary }]}>{children}</Text>
            ) : children}
        </View>
    </View>
));

export const ContactRow = React.memo(({ icon, label, value, onPress, colors, styles }) => (
    <TouchableOpacity style={styles.contactRow} onPress={onPress} activeOpacity={interactions.activeOpacity}>
        <View style={[styles.contactIcon, { backgroundColor: colors.opacity.background.primary }]}>
            <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.contactContent}>
            <Text style={[styles.contactLabel, { color: colors.text.secondary }]}>{label}</Text>
            <Text style={[styles.contactText, { color: colors.text.primary }]}>{value}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
    </TouchableOpacity>
));

export const MetaRow = React.memo(({ icon, label, value, colors, styles }) => (
    <View style={styles.metaRow}>
        <View style={[styles.metaIcon, { backgroundColor: colors.opacity.background.primary }]}>
            <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.metaContent}>
            <Text style={[styles.metaLabel, { color: colors.text.secondary }]}>{label}</Text>
            <Text style={[styles.metaText, { color: colors.text.primary }]}>{value}</Text>
        </View>
    </View>
));

export const SectionCard = React.memo(({ children, style, colors, styles }) => (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }, style]}>{children}</View>
));

// Secondary/glanceable metadata — collapsed content stays mounted-out (no state to preserve).
export const CollapsibleSectionCard = ({ title, children, colors, styles, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <SectionCard colors={colors} styles={styles}>
            <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setOpen((prev) => !prev)}
                activeOpacity={interactions.activeOpacityLight}
                hitSlop={{ top: 8, bottom: 8 }}
            >
                <Text style={[styles.collapsibleTitle, { color: colors.text.secondary }]}>{title}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
            {open && <View style={styles.collapsibleBody}>{children}</View>}
        </SectionCard>
    );
};

export const TagList = React.memo(({ tags, colors, styles }) => (
    <View style={styles.tagsContainer}>
        {tags.map((tag, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.opacity.background.primary }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            </View>
        ))}
    </View>
));
