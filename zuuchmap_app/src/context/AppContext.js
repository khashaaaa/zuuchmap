import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const STORAGE_KEYS = {
    THEME_MODE: '@zuuchmap:theme_mode',
    LOCALE: '@zuuchmap:locale',
};

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
    const [themeMode, setThemeModeState] = useState('dark');
    const [locale, setLocaleState] = useState('mn');
    const [ready, setReady] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const unreadCount = notifications.filter((n) => !n.read).length;
    const notifIdRef = useRef(0);

    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const [storedTheme, storedLocale] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE),
                    AsyncStorage.getItem(STORAGE_KEYS.LOCALE),
                ]);
                const theme = storedTheme || 'dark';
                const lang = storedLocale || 'mn';
                setThemeModeState(theme);
                setLocaleState(lang);
                await i18n.changeLanguage(lang);
            } catch {}
            setReady(true);
        };
        loadPrefs();
    }, []);

    const setThemeMode = useCallback(async (mode) => {
        setThemeModeState(mode);
        await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode).catch(() => {});
    }, []);

    const setLocale = useCallback(async (lang) => {
        setLocaleState(lang);
        await i18n.changeLanguage(lang);
        await AsyncStorage.setItem(STORAGE_KEYS.LOCALE, lang).catch(() => {});
    }, []);

    const addNotification = useCallback(({ title, message, type = 'info', postId }) => {
        const id = ++notifIdRef.current;
        setNotifications((prev) => [
            { id, title, message, type, postId, ts: new Date().toISOString(), read: false },
            ...prev,
        ].slice(0, 50));
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }, []);

    const clearNotifications = useCallback(() => setNotifications([]), []);

    return (
        <AppContext.Provider value={{
            themeMode, setThemeMode, locale, setLocale, ready,
            notifications, unreadCount, addNotification, markAllRead, clearNotifications,
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
};
