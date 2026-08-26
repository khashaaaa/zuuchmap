import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Whether the device currently has a usable internet connection.
 *
 * Mirrors `useOnline` in zuuchmap_web/src/hooks/useOnline.js so both clients
 * express "offline" the same way. The web reads `navigator.onLine`; React Native
 * has no equivalent, so this subscribes to NetInfo.
 *
 * `isInternetReachable` is the honest signal — a phone can hold a wifi
 * association that routes nowhere, which `isConnected` alone reports as online.
 * It is null until the first reachability probe resolves, and null must be read
 * as "assume online": showing an offline banner for a moment on every cold start
 * would train people to ignore it.
 *
 * Like the web's, this is a hint for the user and never a gate on a request.
 */
export default function useOnline() {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const apply = (state) => {
            const reachable = state.isInternetReachable;
            setOnline(Boolean(state.isConnected) && reachable !== false);
        };
        NetInfo.fetch().then(apply);
        return NetInfo.addEventListener(apply);
    }, []);

    return online;
}
