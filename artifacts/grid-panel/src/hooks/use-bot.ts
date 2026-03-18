import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetBotStatus, 
  useGetBotTrades, 
  useStartBot, 
  useStopBot, 
  useResetBot,
  useGetBotConfig,
  useUpdateBotConfig,
  getGetBotStatusQueryKey,
  getGetBotTradesQueryKey,
  getGetBotConfigQueryKey
} from "@workspace/api-client-react";

// Wrap generated hooks to add standard invalidation and polling behaviors
export function useBotPolling() {
  return useGetBotStatus({
    query: {
      queryKey: getGetBotStatusQueryKey(),
      refetchInterval: 3000,
      refetchOnWindowFocus: true,
    }
  });
}

export function useTradesPolling() {
  return useGetBotTrades(
    { limit: 50 },
    {
      query: {
        queryKey: getGetBotTradesQueryKey({ limit: 50 }),
        refetchInterval: 3000,
      }
    }
  );
}

export function useBotConfig() {
  return useGetBotConfig();
}

export function useBotActions() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBotTradesQueryKey({ limit: 50 }) });
    queryClient.invalidateQueries({ queryKey: getGetBotConfigQueryKey() });
  };

  const startMutation = useStartBot({
    mutation: { onSuccess: invalidateAll }
  });

  const stopMutation = useStopBot({
    mutation: { onSuccess: invalidateAll }
  });

  const resetMutation = useResetBot({
    mutation: { onSuccess: invalidateAll }
  });

  const updateConfigMutation = useUpdateBotConfig({
    mutation: { onSuccess: invalidateAll }
  });

  return {
    startBot: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    
    stopBot: stopMutation.mutateAsync,
    isStopping: stopMutation.isPending,
    
    resetBot: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
    
    updateConfig: updateConfigMutation.mutateAsync,
    isUpdatingConfig: updateConfigMutation.isPending,
  };
}
