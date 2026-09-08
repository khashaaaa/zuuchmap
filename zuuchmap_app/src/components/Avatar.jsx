import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * A profile or company picture, with a local fallback.
 *
 * The four profile screens each carried the same three lines — an <Image>
 * pointing at `profilePicture || DEFAULT_AVATAR_URL` plus an `imageError` flag
 * that fell back to the same remote URL. That URL was a fixed 150px
 * ui-avatars.com PNG reading "U", so every account without a photo showed the
 * same letter, blurred by a ~2x upscale, and showed nothing at all offline or
 * whenever that host was unreachable. An Ionicons glyph needs no network, is
 * sharp at any size and does not claim to be an initial.
 *
 * `uri` may be null — that is the normal "no photo" case, not an error.
 */
const Avatar = ({ uri, size = 80, icon = 'person-outline', style }) => {
    const { colors } = useAppTheme();
    const [failed, setFailed] = useState(false);

    // A dead URL must not outlive the URL itself: replacing the photo, or a
    // refetch after a network blip, has to clear the fallback.
    useEffect(() => { setFailed(false); }, [uri]);

    const showImage = Boolean(uri) && !failed;

    return (
        <View
            style={[
                styles.wrap,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: colors.opacity.background.primary,
                },
                style,
            ]}
        >
            {showImage ? (
                <Image
                    source={{ uri }}
                    style={styles.image}
                    onError={() => setFailed(true)}
                    accessibilityIgnoresInvertColors
                />
            ) : (
                <Ionicons name={icon} size={Math.round(size * 0.5)} color={colors.iconAccent} />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
});

export default React.memo(Avatar);
