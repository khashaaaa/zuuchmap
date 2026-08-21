import { useQuery } from '@tanstack/react-query';
import categoryService from '../services/api/categoryService';

/**
 * The category schemas, from the API.
 *
 * Every per-category affordance in the app — label, icon, marker colour, filter
 * list, form fields — must come from here. Hardcoding a category key means a new
 * vertical stays invisible until the next App Store release, which is exactly
 * the coupling the schema system exists to avoid.
 */
export function useCategorySchemas() {
    const { data = [] } = useQuery({
        queryKey: ['categories'],
        // React Query owns freshness here. The service's own 1h AsyncStorage
        // cache is the offline fallback only — serving it on a live refetch
        // would hide a newly added vertical for up to an hour.
        queryFn: () => categoryService.getCategories(true),
        staleTime: 5 * 60 * 1000,
    });
    return data;
}

/** Only the categories an admin has left switched on, in their configured order. */
export function useActiveCategorySchemas() {
    const schemas = useCategorySchemas();
    return schemas
        .filter((s) => s.active !== false)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
