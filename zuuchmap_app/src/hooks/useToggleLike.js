import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import likeService from '../services/api/likeService';
import { showErrorModal } from '../utils/errorManager';
import { logger } from '../utils/logger';

export const LIKED_IDS_KEY = ['liked', 'ids'];

/**
 * The one place a like is toggled. Owners do their own optimistic update in
 * `onMutate` (and undo it in `onRollback`); this hook talks to the engine,
 * turns a failure into the right dialog, and refreshes every `['liked', …]`
 * query so counts and lists agree afterwards.
 *
 * Variables: `{ post_type, post_id, liked }` where `liked` is the state
 * BEFORE the toggle.
 */
export const useToggleLike = ({ onMutate, onRollback, onSettled } = {}) => {
    const qc = useQueryClient();
    const { t } = useTranslation();

    return useMutation({
        mutationKey: ['like', 'toggle'],
        mutationFn: ({ post_type, post_id, liked }) => likeService.toggleLike(post_type, post_id, liked),
        onMutate: async (vars) => {
            await qc.cancelQueries({ queryKey: ['liked'] });
            return onMutate?.(vars);
        },
        onError: (error, vars, context) => {
            logger.error('Error toggling like:', error);
            onRollback?.(vars, context);
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                showErrorModal(t('auth.sessionExpired'), t('auth.sessionExpiredDesc'));
            } else if (error?.code === 'AUTH_TOKEN_MISSING') {
                showErrorModal(t('auth.title'), t('auth.loginRequired'), [{ text: t('common.close') }], 'warning');
            } else {
                showErrorModal(t('common.error'), t('posts.likeError'));
            }
        },
        onSettled: (data, error, vars, context) => {
            qc.invalidateQueries({ queryKey: ['liked'] });
            onSettled?.(vars, context, error);
        },
    });
};

/** Flip one id inside the `['liked','ids']` cache — the shared optimistic step for lists. */
export const toggleLikedIdInCache = (qc, { post_type, post_id, liked }) => {
    const previous = qc.getQueryData(LIKED_IDS_KEY);
    qc.setQueryData(LIKED_IDS_KEY, (old = {}) => {
        const ids = (old[post_type] ?? []).filter((id) => id !== post_id);
        return { ...old, [post_type]: liked ? ids : [...ids, post_id] };
    });
    return previous;
};

export default useToggleLike;
