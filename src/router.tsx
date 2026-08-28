import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ApiError } from "./lib/api";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Auth and "not implemented yet" failures should surface immediately;
        // transient network/server errors get one retry.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [401, 403, 404, 400].includes(error.status)) return false;
          return failureCount < 1;
        },
      },
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
