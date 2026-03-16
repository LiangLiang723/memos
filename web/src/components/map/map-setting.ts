import { create } from "@bufbuild/protobuf";
import {
  InstanceSetting_MemoRelatedSetting_MapSetting,
  InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider,
  InstanceSetting_MemoRelatedSetting_MapSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";

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
    return `https://uri.amap.com/marker?position=${lng},${lat}`;
  }
  return `https://www.google.com/maps?q=${lat},${lng}`;
};
