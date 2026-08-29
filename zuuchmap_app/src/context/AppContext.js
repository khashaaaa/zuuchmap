import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const STORAGE_KEYS = {
    THEME_MODE: '@zuuchmap:theme_mode',
    LOCALE: '@zuuchmap:locale',
    NOTIFICATIONS: '@zuuchmap:notifications',
};

/** Matches the in-memory cap; the stored list never grows past what we show. */
const NOTIFICATION_LIMIT = 50;

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
    const [themeMode, setThemeModeState] = useState('dark');
    const [locale, setLocaleState] = useState('mn');
    const [notifications, setNotifications] = useState([]);
    const unreadCount = notifications.filter((n) => !n.read).length;
    const notifIdRef = useRef(0);

    // Notifications are only written to disk once the stored list has been read
    // back, so an early save can't clobber history with an empty array.
    const notificationsHydrated = useRef(false);

    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const [storedTheme, storedLocale, storedNotifs] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE),
                    AsyncStorage.getItem(STORAGE_KEYS.LOCALE),
                    AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS),
                ]);
                const theme = storedTheme || 'dark';
                const lang = storedLocale || 'mn';
                setThemeModeState(theme);
                setLocaleState(lang);
                await i18n.changeLanguage(lang);
                // A push landed, the user reopened the app later, and the list was
                // empty — the notification survived, the record of it did not.
                if (storedNotifs) {
                    const parsed = JSON.parse(storedNotifs);
                    if (Array.isArray(parsed) && parsed.length) {
                        // Keep generating ids above anything already on disk.
                        notifIdRef.current = parsed.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0);
                        // Append rather than replace: a socket event can land while
                        // this read is still in flight, and it must not be dropped.
                        setNotifications((live) => [...live, ...parsed].slice(0, NOTIFICATION_LIMIT));
                    }
                }
            } catch {}
            notificationsHydrated.current = true;
        };
        loadPrefs();
    }, []);

    useEffect(() => {
        if (!notificationsHydrated.current) return;
        AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications)).catch(() => {});
    }, [notifications]);

    const setThemeMode = useCallback(async (mode) => {
        setThemeModeState(mode);
        await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode).catch(() => {});
    }, []);

    const setLocale = useCallback(async (lang) => {
        setLocaleState(lang);
        await i18n.changeLanguage(lang);
        await AsyncStorage.setItem(STORAGE_KEYS.LOCALE, lang).catch(() => {});
    }, []);

    // postType/role/bookingRole are the navigation hints NotificationsScreen
    // uses to make rows tappable.
    const addNotification = useCallback(({ title, message, type = 'info', postId, postType, role, bookingRole, conversationId, reportId }) => {
        const id = ++notifIdRef.current;
        setNotifications((prev) => [
            { id, title, message, type, postId, postType, role, bookingRole, conversationId, reportId, ts: new Date().toISOString(), read: false },
            ...prev,
        ].slice(0, NOTIFICATION_LIMIT));
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }, []);

    const clearNotifications = useCallback(() => setNotifications([]), []);

    // Memoized: this context backs useAppTheme, so a fresh object every render
    // used to re-render nearly every themed component on each notification.
    const value = useMemo(() => ({
        themeMode, setThemeMode, locale, setLocale,
        notifications, unreadCount, addNotification, markAllRead, clearNotifications,
    }), [themeMode, setThemeMode, locale, setLocale,
        notifications, unreadCount, addNotification, markAllRead, clearNotifications]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
};
