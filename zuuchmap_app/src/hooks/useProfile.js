import { useQuery } from '@tanstack/react-query';
import userService from '../services/api/userService';

/**
 * The signed-in user's profile. One key for every reader and every
 * invalidation site (`PROFILE_KEY`). App.js wires React Query's focus manager
 * to AppState (foreground/background), not to navigation focus — so a change
 * made on another screen must invalidate `PROFILE_KEY`; nothing refetches on
 * tab return by itself.
 */
export const PROFILE_KEY = ['profile'];

export const useProfile = (options = {}) =>
    useQuery({
        queryKey: PROFILE_KEY,
        queryFn: userService.getUserProfile,
        staleTime: 60 * 1000,
        ...options,
    });

export default useProfile;
