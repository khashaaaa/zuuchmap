import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Platform, ActionSheetIOS, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { showErrorModal, showInfoModal } from '../utils/errorManager';
import { logger } from '../utils/logger';

const ImageUploadSection = ({
    images,
    onImagesChange,
    imagesLoading,
    setImagesLoading,
    error,
    isEdit = false
}) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const pickImages = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permissionResult.granted) {
                showErrorModal(t('upload.permissionTitle'), t('upload.galleryPermission'), [], 'warning');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                aspect: [4, 3],
                quality: 0.7,
                allowsMultipleSelection: true,
                selectionLimit: 10 - images.length,
                exif: false,
                base64: false,
            });

            if (!result.canceled && result.assets) {
                setImagesLoading(true);

                const newImageUris = [];
                for (const asset of result.assets) {
                    try {
                        newImageUris.push(asset.uri);
                    } catch (imageError) {
                        logger.error('Error processing image:', imageError);
                    }
                }

                const newImages = [...images, ...newImageUris];
                onImagesChange(newImages);
            }
        } catch (error) {
            showErrorModal(t('common.error'), t('upload.pickError'));
            logger.error('Image picker error:', error);
        } finally {
            setImagesLoading(false);
        }
    };

    const takePhoto = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

            if (!permissionResult.granted) {
                showErrorModal(t('upload.permissionTitle'), t('upload.cameraPermission'), [], 'warning');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7,
                exif: false,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                setImagesLoading(true);
                const newImages = [...images, result.assets[0].uri];
                onImagesChange(newImages);
            }
        } catch (error) {
            showErrorModal(t('common.error'), t('upload.cameraError'));
            logger.error('Camera error:', error);
        } finally {
            setImagesLoading(false);
        }
    };

    const showImageSourceOptions = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [t('upload.gallery'), t('upload.camera'), t('common.cancel')],
                    cancelButtonIndex: 2,
                    title: t('upload.addTitle')
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) {
                        pickImages();
                    } else if (buttonIndex === 1) {
                        takePhoto();
                    }
                }
            );
        } else {
            showInfoModal(
                t('upload.addTitle'),
                t('upload.addQuestion'),
                [
                    { text: t('common.cancel') },
                    { text: t('upload.gallery'), onPress: pickImages },
                    { text: t('upload.camera'), onPress: takePhoto },
                ]
            );
        }
    };

    const removeImage = useCallback((index) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        onImagesChange(newImages);
    }, [images, onImagesChange]);

    return (
        <>
            <View style={gStyles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                    {t('upload.images')} <Text style={gStyles.requiredStar}>*</Text>
                </Text>
                <Text style={styles.sectionSubtitle}>
                    {isEdit ? t('upload.editImagesSubtitle') : t('upload.addImagesSubtitle')}
                </Text>
            </View>

            <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={showImageSourceOptions}
                disabled={images.length >= 10 || imagesLoading}
                activeOpacity={interactions.activeOpacityLight}
            >
                {imagesLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                    <Ionicons name="camera-outline" size={32} color={colors.primary} />
                )}
                <Text style={styles.imagePickerText}>
                    {imagesLoading
                        ? t('upload.processing')
                        : images.length === 0
                            ? t('upload.addMore')
                            : t('upload.addMoreRemaining', { count: 10 - images.length })
                    }
                </Text>
            </TouchableOpacity>

            {imagesLoading ? (
                <View style={styles.loadingImagesContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingImagesText}>{t('upload.loading')}</Text>
                </View>
            ) : images.length > 0 ? (
                <ScrollView
                    horizontal
                    contentContainerStyle={styles.imagesContainer}
                    showsHorizontalScrollIndicator={false}
                >
                    {images.map((uri, index) => (
                        <View key={index} style={styles.imageContainer}>
                            <Image
                                source={{ uri }}
                                style={styles.image}
                                resizeMode="cover"
                                onError={(error) => {
                                    logger.error('Image load error:', error);
                                }}
                            />
                            <TouchableOpacity
                                style={styles.removeImageButton}
                                onPress={() => removeImage(index)}
                                activeOpacity={interactions.activeOpacityLight}
                                hitSlop={interactions.hitSlop}
                                accessibilityRole="button"
                                accessibilityLabel={t('upload.removeImage')}
                            >
                                <Ionicons name="close-circle" size={24} color={colors.primary} />
                            </TouchableOpacity>
                            <View style={styles.imageIndexBadge}>
                                <Text style={styles.imageIndexText}>{index + 1}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            ) : (
                error && <Text style={gStyles.errorText}>{error}</Text>
            )}

            {images.length > 0 && (
                <Text style={styles.imageCountText}>
                    {t('upload.selectedCount', { count: images.length })}
                </Text>
            )}
        </>
    );
};

const createStyles = (colors) => StyleSheet.create({
    sectionTitle: {
        ...typography.styles.h3,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    sectionSubtitle: {
        ...typography.styles.caption,
        color: colors.text.secondary,
    },
    imagePickerButton: {
        height: 120,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: colors.border.medium,
        borderStyle: 'dashed',
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    imagePickerText: {
        color: colors.primary,
        ...typography.styles.label,
        marginTop: spacing.xs,
    },
    loadingImagesContainer: {
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderStyle: 'dashed',
        marginBottom: spacing.lg,
    },
    loadingImagesText: {
        marginTop: spacing.sm,
        color: colors.text.secondary,
        ...typography.styles.caption,
    },
    imagesContainer: {
        paddingVertical: spacing.sm,
        marginBottom: spacing.lg,
    },
    imageContainer: {
        position: 'relative',
        marginRight: spacing.md,
    },
    image: {
        width: 100,
        height: 100,
        borderRadius: radius.md,
        backgroundColor: colors.border.light,
    },
    removeImageButton: {
        ...colors.elevation.sm,
        position: 'absolute',
        top: -spacing.sm,
        right: -spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.xs,
    },
    imageIndexBadge: {
        ...colors.elevation.sm,
        position: 'absolute',
        bottom: -spacing.sm,
        left: -spacing.sm,
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageIndexText: {
        color: colors.onPrimary,
        ...typography.styles.badge,
    },
    imageCountText: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        textAlign: 'center',
        marginTop: -spacing.md,
        marginBottom: spacing.lg,
    },
});

export default React.memo(ImageUploadSection);
