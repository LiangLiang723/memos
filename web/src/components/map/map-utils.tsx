import { DivIcon } from "leaflet";
import { MapPinIcon } from "lucide-react";
import { useMemo } from "react";
import ReactDOMServer from "react-dom/server";
import { TileLayer } from "react-leaflet";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider } from "@/types/proto/api/v1/instance_service_pb";
import { resolveTheme } from "@/utils/theme";
import { getMapSettingWithDefaults, isAmapProvider } from "./map-setting";

const OSM_TILE_URLS = {
  light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

const AMAP_TILE_URLS = {
  light: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
  dark: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
} as const;

export const ThemedTileLayer = () => {
  const { userGeneralSetting } = useAuth();
  const { memoRelatedSetting } = useInstance();
  const isDark = useMemo(() => resolveTheme(userGeneralSetting?.theme || "system").includes("dark"), [userGeneralSetting?.theme]);
  const mapSetting = useMemo(() => getMapSettingWithDefaults(memoRelatedSetting.mapSetting), [memoRelatedSetting.mapSetting]);

  const layerConfig = useMemo(() => {
    if (isAmapProvider(mapSetting.provider)) {
      return {
        url: isDark ? AMAP_TILE_URLS.dark : AMAP_TILE_URLS.light,
        subdomains: ["1", "2", "3", "4"],
        attribution: "(c) AutoNavi",
      };
    }

    return {
      url: isDark ? OSM_TILE_URLS.dark : OSM_TILE_URLS.light,
      subdomains: ["a", "b", "c"],
      attribution:
        mapSetting.provider === InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.OPEN_STREET_MAP
          ? "(c) OpenStreetMap contributors"
          : "",
    };
  }, [isDark, mapSetting.provider]);

  return <TileLayer url={layerConfig.url} subdomains={layerConfig.subdomains} attribution={layerConfig.attribution} />;
};

interface MarkerIconOptions {
  fill?: string;
  size?: number;
  className?: string;
}

export const createMarkerIcon = (options?: MarkerIconOptions): DivIcon => {
  const { fill = "orange", size = 28, className = "" } = options || {};
  return new DivIcon({
    className: "relative border-none",
    html: ReactDOMServer.renderToString(
      <MapPinIcon className={`absolute bottom-1/2 -left-1/2 ${className}`.trim()} fill={fill} size={size} />,
    ),
  });
};

export const defaultMarkerIcon = createMarkerIcon();
