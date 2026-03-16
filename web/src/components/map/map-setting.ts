import { create } from "@bufbuild/protobuf";
import {
  InstanceSetting_MemoRelatedSetting_MapSetting,
  InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider,
  InstanceSetting_MemoRelatedSetting_MapSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { wgs84ToGcj02 } from "./coord";

export const IMAGE_LOCATION_CANDIDATE_DISTANCE_STORAGE_KEY = "memos.image-location-candidate-distance-meters";
export const DEFAULT_IMAGE_LOCATION_CANDIDATE_DISTANCE_METERS = 500;

export const getMapSettingWithDefaults = (
  mapSetting?: InstanceSetting_MemoRelatedSetting_MapSetting,
): InstanceSetting_MemoRelatedSetting_MapSetting => {
  const provider = mapSetting?.provider ?? InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.MAP_PROVIDER_UNSPECIFIED;
  const resolvedProvider =
    provider === InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.MAP_PROVIDER_UNSPECIFIED
      ? InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.OPEN_STREET_MAP
      : provider;

  return create(InstanceSetting_MemoRelatedSetting_MapSettingSchema, {
    provider: resolvedProvider,
    amapApiKey: mapSetting?.amapApiKey ?? "",
    amapSecurityKey: mapSetting?.amapSecurityKey ?? "",
  });
};

export const isAmapProvider = (provider: InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider): boolean => {
  return provider === InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.AMAP;
};

export const buildExternalMapUrl = (
  provider: InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider,
  lat: number,
  lng: number,
): string => {
  if (isAmapProvider(provider)) {
    const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
    return `https://uri.amap.com/marker?position=${gcjLng},${gcjLat}`;
  }
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

export const getImageLocationCandidateDistanceMeters = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_LOCATION_CANDIDATE_DISTANCE_METERS;
  }

  const value = Number.parseInt(window.localStorage.getItem(IMAGE_LOCATION_CANDIDATE_DISTANCE_STORAGE_KEY) ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_IMAGE_LOCATION_CANDIDATE_DISTANCE_METERS;
  }
  return value;
};

export const setImageLocationCandidateDistanceMeters = (value: number): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(IMAGE_LOCATION_CANDIDATE_DISTANCE_STORAGE_KEY, String(value));
};
