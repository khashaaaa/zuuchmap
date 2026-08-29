import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import postService from '../services/api/postService';
import { invalidatePostData } from '../services/queryClient';
import { showErrorModal } from '../utils/errorManager';
import { logger } from '../utils/logger';
import { successHaptic } from '../utils/haptics';

/**
 * Admin approve/reject flow for a post, including the edit-before-approve
 * pass. Pulled out of PostDetailScreen so the customer-facing screen doesn't
 * carry the moderation concern.
 *
 * Pending title/detail edits are flushed before either decision, so an admin
 * never approves a post that differs from what they just corrected on screen.
 */
export const usePostModeration = ({ post, enabled, onDone }) => {
    const { t } = useTranslation();
    const qc = useQueryClient();

    const [editMode, setEditMode] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedDetails, setEditedDetails] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    useEffect(() => {
        if (post && enabled) {
            setEditedTitle(post.name || post.title || '');
            setEditedDetails(post.description || post.details || '');
        }
    }, [post, enabled]);

    const saveEditsIfNeeded = async (currentPost) => {
        const original = currentPost.name || currentPost.title || '';
        const originalDesc = currentPost.description || currentPost.details || '';
        if (editedTitle.trim() === original && editedDetails.trim() === originalDesc) return;
        await postService.adminEditPost(currentPost.id, {
            title: editedTitle.trim() || undefined,
            details: editedDetails.trim() || undefined,
        });
    };

    // The queue, its counts and the post itself all change on a decision.
    const settled = () => {
        invalidatePostData();
        qc.invalidateQueries({ queryKey: ['admin'] });
        onDone();
    };

    const approve = useMutation({
        mutationKey: ['admin', 'approve'],
        mutationFn: async () => {
            await saveEditsIfNeeded(post);
            await postService.approvePost(post.id);
        },
        onSuccess: () => { successHaptic(); settled(); },
        onError: (err) => {
            logger.error('Approve error:', err);
            showErrorModal(t('common.error'), t('admin.approveError'));
        },
    });

    const reject = useMutation({
        mutationKey: ['admin', 'reject'],
        mutationFn: async (reason) => {
            await saveEditsIfNeeded(post);
            await postService.rejectPost(post.id, reason);
        },
        onSuccess: () => { successHaptic(); settled(); },
        onError: (err) => {
            logger.error('Reject error:', err);
            showErrorModal(t('common.error'), t('admin.rejectError'));
        },
    });

    const handleApprove = () => approve.mutate();

    const handleRejectConfirm = () => {
        if (!rejectReason.trim()) {
            showErrorModal(t('common.warning'), t('posts.enterReason'));
            return;
        }
        setShowRejectModal(false);
        reject.mutate(rejectReason.trim());
    };

    return {
        editMode, setEditMode,
        editedTitle, setEditedTitle,
        editedDetails, setEditedDetails,
        approving: approve.isPending,
        rejecting: reject.isPending,
        showRejectModal, setShowRejectModal,
        rejectReason, setRejectReason,
        handleApprove, handleRejectConfirm,
    };
};

export default usePostModeration;
