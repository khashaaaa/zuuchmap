import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { getPostThumbUrl } from '../config/api.config';

/**
 * A post photo rendered at card size.
 *
 * Every list, map carousel and thread row was pointing RN's `<Image>` at the
 * 1920x1080 original for a box a hundred-odd points wide. On a mobile
 * connection that is megabytes a screen, and on the cheap Android hardware most
 * of this marketplace runs on the full-size decode costs more than the download
 * — a list that is slow on the first scroll does not get a second one.
 *
 * The engine writes a `_thumb` copy beside every upload, so this asks for that
 * first and falls back to the original once if it is not there. Posts uploaded
 * before thumbnails existed have no `_thumb` object until
 * `npm run backfill:thumbs` has run over them, which is what the fallback is
 * for — never a permanent state, but never a broken card either.
 *
 * `onFail` fires only when both are gone, so a caller can show its placeholder.
 */
const ThumbImage = ({ uri, onFail, ...rest }) => {
    const [full, setFull] = useState(false);

    // A recycled row handing over a different photo has to start at the thumb
    // again, or one 404 in a list permanently downgrades every card after it.
    useEffect(() => { setFull(false); }, [uri]);

    if (!uri) return null;
    return (
        <Image
            source={{ uri: full ? uri : getPostThumbUrl(uri) }}
            onError={() => (full ? onFail?.() : setFull(true))}
            {...rest}
        />
    );
};

export default ThumbImage;
