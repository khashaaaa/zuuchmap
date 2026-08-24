import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import Button from '../../components/Button';
import ScreenHeader from '../../components/ScreenHeader';
import WizardSteps from '../../components/WizardSteps';
import ScreenLoading from '../../components/ScreenLoading';
import { showErrorModal } from '../../utils/errorManager';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const ProviderLocationSelection = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const { category, subcategory } = route.params;

    const [location, setLocation] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [locationName, setLocationName] = useState('');
    const [errorMsg, setErrorMsg] = useState(null);
    const insets = useSafeAreaInsets();

    const defaultLocation = {
        latitude: 47.9184,
        longitude: 106.9177,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
    };

    // GPS is a convenience here, never a gate: the point of this screen is to
    // tap a spot on the map. A denied permission or a failed fix falls back to
    // Ulaanbaatar and leaves the map interactive, with an inline notice — an
    // error screen would strand the provider mid-way through creating a post.
    const fallBackToDefault = (message) => {
        setErrorMsg(message);
        setLocation(defaultLocation);
        setSelectedLocation({
            latitude: defaultLocation.latitude,
            longitude: defaultLocation.longitude,
        });
        setLocationName(t('provider.ulaanbaatar'));
    };

    const locate = async () => {
        setIsLoading(true);
        setErrorMsg(null);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                fallBackToDefault(t('provider.locationPermission'));
                return;
            }

            const currentLocation = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            setLocation({
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                latitudeDelta: LATITUDE_DELTA,
                longitudeDelta: LONGITUDE_DELTA,
            });
            setSelectedLocation({
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
            });

            try {
                const addresses = await Location.reverseGeocodeAsync({
                    latitude: currentLocation.coords.latitude,
                    longitude: currentLocation.coords.longitude,
                });
                if (addresses && addresses.length > 0) {
                    setLocationName(formatAddress(addresses[0]));
                }
            } catch (geocodeError) {
                setLocationName(t('provider.locationSelected'));
            }
        } catch (error) {
            fallBackToDefault(t('provider.locationCurrentFail'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        locate();
    }, []);

    const formatAddress = (address) => {
        const parts = [];
        if (address.name) parts.push(address.name);
        if (address.street) parts.push(address.street);
        if (address.district) parts.push(address.district);
        if (address.city) parts.push(address.city);
        if (address.region) parts.push(address.region);
        if (address.country) parts.push(address.country);
        return parts.join(', ') || t('provider.locationSelected');
    };

    const handleMapPress = async (event) => {
        const { coordinate } = event.nativeEvent;
        setSelectedLocation(coordinate);
        try {
            const addresses = await Location.reverseGeocodeAsync({
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
            });
            if (addresses && addresses.length > 0) {
                const address = addresses[0];
                setLocationName(formatAddress(address));
            } else {
                setLocationName(t('provider.locationSelected'));
            }
        } catch (error) {
            setLocationName(t('provider.locationSelected'));
        }
    };

    const handleConfirmLocation = () => {
        if (!selectedLocation) {
            showErrorModal(t('common.error'), t('provider.locationSelectFromMap'));
            return;
        }
        navigation.navigate('ProviderPostCreate', {
            location: {
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
                locationName: locationName
            },
            category,
            subcategory
        });
    };

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('provider.locationTitle')} onBack={() => navigation.goBack()} />
            <WizardSteps current={3} labels={[t('provider.stepCategory'), t('provider.stepSubcategory'), t('provider.stepLocation'), t('provider.stepDetails')]} />

            {isLoading ? (
                <ScreenLoading message={t('provider.locationLoading')} />
            ) : (
                <>
                    <MapView
                        style={styles.map}
                        provider={PROVIDER_GOOGLE}
                        initialRegion={location || defaultLocation}
                        showsUserLocation
                        showsMyLocationButton
                        showsCompass
                        toolbarEnabled={false}
                        onPress={handleMapPress}
                        mapPadding={{
                            top: 0,
                            right: 0,
                            bottom: 140 + safeAreaHelpers.getBottomSafeArea(insets),
                            left: 0
                        }}
                    >
                        {selectedLocation && (
                            <Marker
                                coordinate={selectedLocation}
                                pinColor={colors.primary}
                                draggable
                                onDragEnd={(e) => handleMapPress(e)}
                            />
                        )}
                    </MapView>

                    <View style={[
                        gStyles.bottomContainerWithInset(
                            safeAreaHelpers.getBottomSafeArea(insets)
                        ),
                        styles.locationInfoContainer,
                        { backgroundColor: colors.surface },
                    ]}>
                        <View style={styles.locationHeader}>
                            <View style={styles.locationIcon}>
                                <Ionicons name="location" size={24} color={colors.iconAccent} />
                            </View>
                            <View style={styles.locationTextContainer}>
                                <Text style={styles.locationLabel}>{t('provider.locationSelected')}</Text>
                                <Text style={styles.locationName} numberOfLines={2}>
                                    {locationName || t('provider.locationUnknown')}
                                </Text>
                            </View>
                        </View>

                        {selectedLocation && (
                            <View style={styles.coordinatesContainer}>
                                <Text style={styles.coordinatesText}>
                                    {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                                </Text>
                            </View>
                        )}

                        {errorMsg ? (
                            <View style={styles.noticeContainer}>
                                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                                <Text style={styles.noticeText}>{errorMsg}</Text>
                                <TouchableOpacity
                                    onPress={locate}
                                    activeOpacity={interactions.activeOpacityLight}
                                    hitSlop={interactions.hitSlop}
                                >
                                    <Text style={styles.noticeAction}>{t('common.retry')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.instructionContainer}>
                                <Ionicons name="information-circle-outline" size={16} color={colors.iconAccent} />
                                <Text style={styles.instructionText}>
                                    {t('provider.locationInstruction')}
                                </Text>
                            </View>
                        )}

                        <Button
                            title={t('provider.locationConfirm')}
                            onPress={handleConfirmLocation}
                            disabled={!selectedLocation}
                            icon="checkmark-circle-outline"
                            iconPosition="left"
                            fullWidth
                        />
                    </View>
                </>
            )}
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    map: {
        flex: 1,
    },
    locationInfoContainer: {
        ...colors.elevation.md,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surface,
        padding: spacing.xl,
        borderTopLeftRadius: radius.modal,
        borderTopRightRadius: radius.modal,
    },
    locationHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: spacing.md,
    },
    locationIcon: {
        width: 40,
        height: 40,
        borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    locationTextContainer: {
        flex: 1,
    },
    locationLabel: {
        ...typography.styles.label,
        color: colors.text.secondary,
        marginBottom: spacing.xxs,
    },
    locationName: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
    },
    coordinatesContainer: {
        backgroundColor: colors.background,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        marginBottom: spacing.md,
        alignSelf: 'flex-start',
    },
    coordinatesText: {
        ...typography.styles.small,
        color: colors.text.secondary,
    },
    instructionContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: colors.background,
        padding: spacing.md,
        borderRadius: radius.md,
        marginBottom: spacing.xl,
        gap: spacing.sm,
    },
    instructionText: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        flex: 1,
    },
    noticeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.opacity.background.warning,
        padding: spacing.md,
        borderRadius: radius.md,
        marginBottom: spacing.xl,
        gap: spacing.sm,
    },
    noticeText: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        flex: 1,
    },
    noticeAction: {
        ...typography.styles.labelStrong,
        color: colors.text.link,
    },
});

export default ProviderLocationSelection;