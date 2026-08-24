import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { interactions } from '../design/theme';
import PressableScale from './PressableScale';

/**
 * Presentational building blocks for PostDetailScreen.
 *
 * Each takes `colors` and the screen's `styles` object rather than owning a
 * stylesheet, so the detail screen keeps a single source of layout truth.
 */

export const DetailItem = React.memo(({ icon, label, children, colors, styles }) => (
    <View style={styles.detailItem}>
        <View style={[styles.detailIcon, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name={icon} size={18} color={colors.text.secondary} />
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
    <PressableScale style={styles.contactRow} onPress={onPress}>
        <View style={[styles.contactIcon, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name={icon} size={20} color={colors.text.secondary} />
        </View>
        <View style={styles.contactContent}>
            <Text style={[styles.contactLabel, { color: colors.text.secondary }]}>{label}</Text>
            <Text style={[styles.contactText, { color: colors.text.primary }]}>{value}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
    </PressableScale>
));

export const MetaRow = React.memo(({ icon, label, value, colors, styles }) => (
    <View style={styles.metaRow}>
        <View style={[styles.metaIcon, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name={icon} size={18} color={colors.text.secondary} />
        </View>
        <View style={styles.metaContent}>
            <Text style={[styles.metaLabel, { color: colors.text.secondary }]}>{label}</Text>
            <Text style={[styles.metaText, { color: colors.text.primary }]}>{value}</Text>
        </View>
    </View>
));

// `label` renders an overline eyebrow above the content — the section's name,
// not a heading, so the scroll reads as a sequence of named blocks.
export const SectionCard = React.memo(({ children, label, style, colors, styles }) => (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }, style]}>
        {label ? <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>{label}</Text> : null}
        {children}
    </View>
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
            <View key={i} style={[styles.tag, { backgroundColor: colors.surfaceLight }]}>
                <Text style={[styles.tagText, { color: colors.text.secondary }]}>{tag}</Text>
            </View>
        ))}
    </View>
));
