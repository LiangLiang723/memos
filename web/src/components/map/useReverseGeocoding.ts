import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/contexts/InstanceContext";
import { getMapSettingWithDefaults, isAmapProvider } from "./map-setting";

const OSM_GEOCODING_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const AMAP_REVERSE_GEOCODING_ENDPOINT = "https://restapi.amap.com/v3/geocode/regeo";

export const useReverseGeocoding = (lat: number | undefined, lng: number | undefined) => {
  const { memoRelatedSetting } = useInstance();
  const mapSetting = getMapSettingWithDefaults(memoRelatedSetting.mapSetting);

  return useQuery({
    queryKey: ["geocoding", mapSetting.provider, lat, lng],
    queryFn: async () => {
      const coordString = `${lat?.toFixed(6)}, ${lng?.toFixed(6)}`;
      if (lat === undefined || lng === undefined) return "";

      try {
        if (isAmapProvider(mapSetting.provider)) {
          if (!mapSetting.amapApiKey) {
            return coordString;
          }

          const url = `${AMAP_REVERSE_GEOCODING_ENDPOINT}?key=${encodeURIComponent(mapSetting.amapApiKey)}&location=${lng},${lat}&extensions=base&radius=1000&output=json`;
          const response = await fetch(url, { headers: { Accept: "application/json" } });

          if (!response.ok) {
            throw new Error(`AMap reverse geocoding failed with status: ${response.status}`);
          }

          const data = await response.json();
          if (data?.status === "1") {
            return (data?.regeocode?.formatted_address as string) || coordString;
          }
          return coordString;
        }

        const url = `${OSM_GEOCODING_ENDPOINT}?lat=${lat}&lon=${lng}&format=json`;
        const response = await fetch(url, { headers: { Accept: "application/json" } });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return (data?.display_name as string) || coordString;
      } catch (error) {
        console.error("Failed to fetch reverse geocoding data:", error);
        return coordString;
      }
    },
    enabled: lat !== undefined && lng !== undefined,
    staleTime: Infinity,
  });
};
