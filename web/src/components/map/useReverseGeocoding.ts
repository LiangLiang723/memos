import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/contexts/InstanceContext";
import { getMapSettingWithDefaults, isAmapProvider } from "./map-setting";
import { DEFAULT_AMAP_PLACEHOLDER, resolveLocationLabel } from "./geocoding";

export const useReverseGeocoding = (lat: number | undefined, lng: number | undefined) => {
  const { memoRelatedSetting } = useInstance();
  const mapSetting = getMapSettingWithDefaults(memoRelatedSetting.mapSetting);

  return useQuery({
    queryKey: ["geocoding", mapSetting.provider, mapSetting.amapApiKey, lat, lng],
    queryFn: async () => {
      const coordString = `${lat?.toFixed(6)}, ${lng?.toFixed(6)}`;
      const fallbackLabel = isAmapProvider(mapSetting.provider) ? DEFAULT_AMAP_PLACEHOLDER : coordString;
      if (lat === undefined || lng === undefined) return "";

      try {
        return await resolveLocationLabel({
          lat,
          lng,
          provider: mapSetting.provider,
          amapApiKey: mapSetting.amapApiKey,
          amapSecurityKey: mapSetting.amapSecurityKey,
          fallbackLabel,
        });
      } catch (error) {
        console.error("Failed to fetch reverse geocoding data:", error);
        return fallbackLabel;
      }
    },
    enabled: lat !== undefined && lng !== undefined,
    staleTime: Infinity,
  });
};
