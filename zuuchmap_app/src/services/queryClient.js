import { QueryClient } from '@tanstack/react-query';
import { invalidatePostCaches } from '../utils/cacheManager';

// Single app-wide client. Screens read server state exclusively through React Query;
// AsyncStorage-backed service caches (map, categories) exist only as offline fallbacks
// inside queryFns.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// One entry point for "post data changed" — clears both React Query caches and the
// AsyncStorage fallbacks so no layer serves stale posts after a mutation/socket event.
export const invalidatePostData = () => {
  invalidatePostCaches().catch(() => {});
  queryClient.invalidateQueries({ queryKey: ['posts'] });
  queryClient.invalidateQueries({ queryKey: ['post'] });
  queryClient.invalidateQueries({ queryKey: ['provider', 'mine'] });
  queryClient.invalidateQueries({ queryKey: ['map', 'posts'] });
  queryClient.invalidateQueries({ queryKey: ['admin'] });
  queryClient.invalidateQueries({ queryKey: ['liked'] });
};
