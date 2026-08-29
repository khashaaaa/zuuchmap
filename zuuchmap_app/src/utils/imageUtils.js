import postService from '../services/api/postService';
import { getFixedImageUrl } from './postUtils';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { APP_CONFIG } from '../config/app.config';
import { logger } from './logger';
import { showErrorModal, showWarningModal } from './errorManager';
import i18n from '../i18n';

export const processPostImages = (postData) => {
    if (!postData) return postData;

    const processedData = { ...postData };

    if (processedData.images && Array.isArray(processedData.images)) {
        processedData.processedImages = processedData.images
            .map(image => {
                if (typeof image === 'string') {
                    if (!image.startsWith('http')) {
                        return getFixedImageUrl(`${postService.getApiUrl()}/uploads/posts/${image}`);
                    }
                    return getFixedImageUrl(image);
                }
                return image;
            })
            .filter(url => url);
    } else {
        processedData.processedImages = [];
    }

    return processedData;
};

// Profile photos and logos are stored at ≤1000px server-side (uploader.ts
// IMAGE_CONFIG), so anything larger is bandwidth spent for nothing — and a
// modern phone camera shot at picker quality 0.7 is still 3–8MB, past the 5MB
// profile limit and slow on mobile data. Resize before the upload, like post
// images already do in postService. The picker-side fileSize check above stays
// as a guard for a file the manipulator cannot decode.
const shrinkForUpload = async (uri, width = 1000) => {
    try {
        const out = await manipulateAsync(uri, [{ resize: { width } }], { compress: 0.8, format: SaveFormat.JPEG });
        return out.uri;
    } catch (error) {
        logger.error('Image resize failed, uploading original:', error);
        return uri;
    }
};

const _pickFromLibrary = async (permissionMsg, maxSizeBytes = null) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
        showWarningModal(i18n.t('upload.permissionTitle'), permissionMsg);
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: APP_CONFIG.IMAGE.COMPRESSION_QUALITY,
        allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (maxSizeBytes && asset.fileSize && asset.fileSize > maxSizeBytes) {
            const maxMB = Math.round(maxSizeBytes / 1024 / 1024);
            showWarningModal(i18n.t('upload.fileTooLarge'), i18n.t('upload.fileTooLargeDesc', { max: maxMB }));
            return null;
        }
        return shrinkForUpload(asset.uri);
    }
    return null;
};

export const pickProfileImage = async () => {
    try {
        return await _pickFromLibrary(i18n.t('upload.profileGalleryPermission'));
    } catch (error) {
        logger.error('Profile image picker error:', error);
        showErrorModal(i18n.t('common.error'), i18n.t('upload.pickError'));
        return null;
    }
};

export const takeProfilePhoto = async () => {
    try {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
            showWarningModal(i18n.t('upload.permissionTitle'), i18n.t('upload.cameraPermissionMsg'));
            return null;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: APP_CONFIG.IMAGE.COMPRESSION_QUALITY,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
            return shrinkForUpload(result.assets[0].uri);
        }
        return null;
    } catch (error) {
        logger.error('Camera error:', error);
        showErrorModal(i18n.t('common.error'), i18n.t('upload.cameraError'));
        return null;
    }
};

export const pickCompanyLogo = async () => {
    try {
        return await _pickFromLibrary(i18n.t('upload.galleryPermission'), 10 * 1024 * 1024);
    } catch (error) {
        logger.error('Logo picker error:', error);
        showErrorModal(i18n.t('common.error'), i18n.t('upload.logoError'));
        return null;
    }
};
