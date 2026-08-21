import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import postService from '../services/api/postService';
import { invalidatePostData } from '../services/queryClient';
import { showErrorModal } from '../utils/errorManager';
import { logger } from '../utils/logger';

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

    const [editMode, setEditMode] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedDetails, setEditedDetails] = useState('');
    const [approving, setApproving] = useState(false);
    const [rejecting, setRejecting] = useState(false);
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

    const handleApprove = async () => {
        setApproving(true);
        try {
            await saveEditsIfNeeded(post);
            await postService.approvePost(post.id);
            invalidatePostData();
            onDone();
        } catch (err) {
            logger.error('Approve error:', err);
            showErrorModal(t('common.error'), t('admin.approveError'));
        } finally {
            setApproving(false);
        }
    };

    const handleRejectConfirm = async () => {
        if (!rejectReason.trim()) {
            showErrorModal(t('common.warning'), t('posts.enterReason'));
            return;
        }
        setRejecting(true);
        setShowRejectModal(false);
        try {
            await saveEditsIfNeeded(post);
            await postService.rejectPost(post.id, rejectReason.trim());
            invalidatePostData();
            onDone();
        } catch (err) {
            logger.error('Reject error:', err);
            showErrorModal(t('common.error'), t('admin.rejectError'));
        } finally {
            setRejecting(false);
        }
    };

    return {
        editMode, setEditMode,
        editedTitle, setEditedTitle,
        editedDetails, setEditedDetails,
        approving, rejecting,
        showRejectModal, setShowRejectModal,
        rejectReason, setRejectReason,
        handleApprove, handleRejectConfirm,
    };
};

export default usePostModeration;
