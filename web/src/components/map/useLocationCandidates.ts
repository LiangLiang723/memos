import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/contexts/InstanceContext";
import { resolveLocationCandidates } from "./geocoding";
import { getMapSettingWithDefaults } from "./map-setting";

export const useLocationCandidates = (lat: number | undefined, lng: number | undefined) => {
  const { memoRelatedSetting } = useInstance();
  const mapSetting = getMapSettingWithDefaults(memoRelatedSetting.mapSetting);

  return useQuery({
    queryKey: ["location-candidates", mapSetting.provider, mapSetting.amapApiKey, lat, lng],
    queryFn: async () => {
      if (lat === undefined || lng === undefined) return [];
      return resolveLocationCandidates({
        lat,
        lng,
        provider: mapSetting.provider,
        amapApiKey: mapSetting.amapApiKey,
        amapSecurityKey: mapSetting.amapSecurityKey,
        fallbackLabel: "",
      });
    },
    enabled: lat !== undefined && lng !== undefined,
    staleTime: Infinity,
  });
};
