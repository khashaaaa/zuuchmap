import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { healthBand } from '../utils/postHealth';

/**
 * Listing-quality ring: a circular progress track with the score in the centre.
 *
 * Drawn with plain Views (no SVG dependency in this app): two half-clips, each
 * holding a full circle whose top+right borders carry the colour. Rotating the
 * inner circle sweeps the coloured half through the clip window, so the right
 * clip renders 0–50% and the left clip 50–100%, clockwise from 12 o'clock.
 *
 * Colour comes from the band, not the raw number — the same three semantic
 * fills the status badges already use, so "good/fair/poor" reads the same
 * everywhere.
 */
const PostHealthRing = ({ score = 0, size = 36, stroke = 3, showLabel = true, style }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    const band = healthBand(clamped);
    const color = band === 'good' ? colors.success : band === 'fair' ? colors.warning : colors.danger;
    const p = clamped / 100;

    const styles = useMemo(() => createStyles(size, stroke), [size, stroke]);

    // The painted half (top + right borders) spans 315°→135° clockwise from 12,
    // so putting its leading edge at angle `a` paints `a−180°→a`. Feed each clip
    // the angle its own half should reach — the right clip saturates at 180°
    // (50%), the left one starts there — and the unfilled arc falls outside the
    // clip window on its own. Both offsets are the same expression on purpose:
    // when they were not, an empty ring and a full ring both rendered as half a
    // ring, and 8/100 painted more of the circle than 79/100 did.
    const rightDeg = Math.min(p, 0.5) * 360 - 135;
    const leftDeg = Math.max(p, 0.5) * 360 - 135;

    const arc = (deg) => [
        styles.arc,
        { borderColor: color, borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: `${deg}deg` }] },
    ];

    return (
        <View
            style={[styles.wrap, style]}
            accessibilityRole="progressbar"
            accessibilityLabel={t('provider.healthA11y', { score: clamped })}
            accessibilityValue={{ min: 0, max: 100, now: clamped }}
        >
            <View style={[styles.track, { borderColor: colors.border.light }]} />
            <View style={[styles.clip, styles.clipRight]}>
                <View style={[arc(rightDeg), { left: -size / 2 }]} />
            </View>
            <View style={[styles.clip, styles.clipLeft]}>
                <View style={[arc(leftDeg), { left: 0 }]} />
            </View>
            {showLabel && (
                <Text
                    style={[styles.label, { color: colors.text.primary }]}
                    maxFontSizeMultiplier={1.2}
                    allowFontScaling={size >= 44}
                >
                    {clamped}
                </Text>
            )}
        </View>
    );
};

const createStyles = (size, stroke) => StyleSheet.create({
    wrap: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    track: { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: stroke },
    clip: { position: 'absolute', top: 0, width: size / 2, height: size, overflow: 'hidden' },
    clipRight: { left: size / 2 },
    clipLeft: { left: 0 },
    arc: { position: 'absolute', top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: stroke },
    label: {
        ...(size >= 44 ? typography.styles.labelStrong : typography.styles.badge),
        fontVariant: ['tabular-nums'],
        lineHeight: undefined,
    },
});

export default React.memo(PostHealthRing);
