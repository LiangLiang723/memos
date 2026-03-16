import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { getImageLocationCandidateDistanceMeters, setImageLocationCandidateDistanceMeters } from "@/components/map/map-setting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import {
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSetting_MapSetting,
  InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider,
  InstanceSetting_MemoRelatedSetting_MapSettingSchema,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import { getMapSettingWithDefaults, isAmapProvider } from "../map/map-setting";
import SettingGroup from "./SettingGroup";
import SettingRow from "./SettingRow";
import SettingSection from "./SettingSection";

const IMAGE_DISTANCE_OPTIONS = [200, 500, 1000];

const MapSettings = () => {
  const t = useTranslate();
  const { memoRelatedSetting: originalSetting, updateSetting, fetchSetting } = useInstance();
  const [mapSetting, setMapSetting] = useState<InstanceSetting_MemoRelatedSetting_MapSetting>(
    getMapSettingWithDefaults(originalSetting.mapSetting),
  );
  const [savedImageDistanceMeters, setSavedImageDistanceMeters] = useState<number>(() => getImageLocationCandidateDistanceMeters());
  const [imageDistanceMeters, setImageDistanceMeters] = useState<number>(() => getImageLocationCandidateDistanceMeters());

  const updatePartialMapSetting = (partial: Partial<InstanceSetting_MemoRelatedSetting_MapSetting>) => {
    const newMapSetting = create(InstanceSetting_MemoRelatedSetting_MapSettingSchema, {
      ...mapSetting,
      ...partial,
    });
    setMapSetting(newMapSetting);
  };

  const nextMemoRelatedSetting = useMemo(() => {
    return create(InstanceSetting_MemoRelatedSettingSchema, {
      ...originalSetting,
      mapSetting,
    });
  }, [originalSetting, mapSetting]);

  const isMapSettingChanged = !isEqual(mapSetting, getMapSettingWithDefaults(originalSetting.mapSetting));
  const isImageDistanceChanged = imageDistanceMeters !== savedImageDistanceMeters;

  const handleUpdateSetting = async () => {
    if (!isMapSettingChanged && !isImageDistanceChanged) {
      return;
    }

    try {
      if (isMapSettingChanged) {
        await updateSetting(
          create(InstanceSettingSchema, {
            name: `instance/settings/${InstanceSetting_Key[InstanceSetting_Key.MEMO_RELATED]}`,
            value: {
              case: "memoRelatedSetting",
              value: nextMemoRelatedSetting,
            },
          }),
        );
        await fetchSetting(InstanceSetting_Key.MEMO_RELATED);
      }

      if (isImageDistanceChanged) {
        setImageLocationCandidateDistanceMeters(imageDistanceMeters);
        setSavedImageDistanceMeters(imageDistanceMeters);
      }

      toast.success(t("message.update-succeed"));
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Update map settings",
      });
    }
  };

  return (
    <SettingSection>
      <SettingGroup title={t("setting.map-settings.title")}>
        <SettingRow label={t("setting.map-settings.provider")}>
          <Select
            value={String(mapSetting.provider)}
            onValueChange={(value) =>
              updatePartialMapSetting({
                provider: Number(value) as InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider,
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.OPEN_STREET_MAP)}>
                OpenStreetMap
              </SelectItem>
              <SelectItem value={String(InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.AMAP)}>AMap (Gaode)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {isAmapProvider(mapSetting.provider) && (
          <>
            <SettingRow label={t("setting.map-settings.amap-api-key")}>
              <Input
                className="max-w-md"
                placeholder={t("setting.map-settings.amap-api-key-placeholder")}
                value={mapSetting.amapApiKey}
                onChange={(event) => updatePartialMapSetting({ amapApiKey: event.target.value.trim() })}
              />
            </SettingRow>
            <SettingRow label={t("setting.map-settings.amap-security-key")}>
              <Input
                className="max-w-md"
                placeholder={t("setting.map-settings.amap-security-key-placeholder")}
                value={mapSetting.amapSecurityKey}
                onChange={(event) => updatePartialMapSetting({ amapSecurityKey: event.target.value.trim() })}
              />
            </SettingRow>
          </>
        )}

        <SettingRow label="图片地点候选最小间距（米）">
          <Select value={String(imageDistanceMeters)} onValueChange={(value) => setImageDistanceMeters(Number.parseInt(value, 10) || 500)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_DISTANCE_OPTIONS.map((distance) => (
                <SelectItem key={distance} value={String(distance)}>
                  {distance}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button disabled={!isMapSettingChanged && !isImageDistanceChanged} onClick={handleUpdateSetting}>
          {t("common.save")}
        </Button>
      </div>
    </SettingSection>
  );
};

export default MapSettings;
