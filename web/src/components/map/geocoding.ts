import SparkMD5 from "spark-md5";
import { InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider } from "@/types/proto/api/v1/instance_service_pb";
import { wgs84ToGcj02 } from "./coord";

const OSM_GEOCODING_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const AMAP_REVERSE_GEOCODING_ENDPOINT = "https://restapi.amap.com/v3/geocode/regeo";
const AMAP_PLACE_AROUND_ENDPOINT = "https://restapi.amap.com/v3/place/around";
export const DEFAULT_AMAP_PLACEHOLDER = "Selected location";

type OSMReverseGeocodingResponse = {
  display_name?: string;
  address?: {
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
  };
};

type AMapPOI = {
  name?: string;
  distance?: string;
  type?: string;
  address?: string;
};

type AMapPlaceAroundResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  pois?: AMapPOI[];
};

type AMapReverseGeocodingResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  regeocode?: {
    formatted_address?: string;
    pois?: AMapPOI[];
    addressComponent?: {
      neighborhood?: {
        name?: string;
      };
      township?: string;
      district?: string;
      city?: string | string[];
    };
  };
};

type ResolveLocationLabelParams = {
  lat: number;
  lng: number;
  provider: InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider;
  amapApiKey?: string;
  amapSecurityKey?: string;
  fallbackLabel: string;
};

function pickFirstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeDisplayName(displayName: string): string {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  return parts.slice(0, 2).join(" ");
}

function withAreaSuffix(primary: string | undefined, district: string | undefined, city: string | undefined): string | undefined {
  if (!primary?.trim()) {
    return undefined;
  }

  const normalizedPrimary = primary.trim();
  const suffixes = [district?.trim(), city?.trim()].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
  if (suffixes.length === 0) {
    return normalizedPrimary;
  }

  const missingSuffixes = suffixes.filter((suffix) => !normalizedPrimary.includes(suffix));
  return missingSuffixes.length > 0 ? `${normalizedPrimary}·${missingSuffixes.join("·")}` : normalizedPrimary;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | undefined> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as T;
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildAmapDebugLabel(
  fallbackLabel: string,
  response?: { status?: string; infocode?: string; info?: string },
  reason?: string,
): string {
  const parts = [
    response?.status ? `status=${response.status}` : "",
    response?.infocode ? `infocode=${response.infocode}` : "",
    response?.info || reason || "",
  ]
    .filter(Boolean)
    .join(" ");
  return parts ? `${fallbackLabel} [${parts}]` : fallbackLabel;
}

function buildSignedAmapUrl(endpoint: string, params: Record<string, string>, securityKey?: string): string {
  const entries = Object.entries(params).sort(([left], [right]) => left.localeCompare(right));
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const searchParams = new URLSearchParams(entries);

  if (securityKey) {
    searchParams.set("sig", SparkMD5.hash(`${query}${securityKey}`));
  }

  return `${endpoint}?${searchParams.toString()}`;
}

async function fetchAmapReverseGeocoding(
  lat: number,
  lng: number,
  amapApiKey: string,
  radius: number,
  amapSecurityKey?: string,
): Promise<AMapReverseGeocodingResponse | undefined> {
  const url = buildSignedAmapUrl(
    AMAP_REVERSE_GEOCODING_ENDPOINT,
    {
      extensions: "all",
      key: amapApiKey,
      location: `${lng},${lat}`,
      output: "json",
      radius: String(radius),
    },
    amapSecurityKey,
  );
  return fetchJsonWithTimeout<AMapReverseGeocodingResponse>(url, 1200);
}

async function fetchAmapNearbyPOIs(
  lat: number,
  lng: number,
  amapApiKey: string,
  radius: number,
  amapSecurityKey?: string,
): Promise<AMapPlaceAroundResponse | undefined> {
  const url = buildSignedAmapUrl(
    AMAP_PLACE_AROUND_ENDPOINT,
    {
      extensions: "base",
      key: amapApiKey,
      location: `${lng},${lat}`,
      offset: "5",
      output: "json",
      page: "1",
      radius: String(radius),
      sortrule: "distance",
    },
    amapSecurityKey,
  );
  return fetchJsonWithTimeout<AMapPlaceAroundResponse>(url, 1500);
}

function scorePOI(poi: AMapPOI): number {
  const name = poi.name?.trim() ?? "";
  const type = poi.type?.trim() ?? "";
  const distance = Number.parseFloat(poi.distance ?? "");
  let score = Number.isFinite(distance) ? Math.max(0, 1500 - distance) : 0;

  if (/(小区|花园|公园|广场|大厦|中心|公司|大楼|园区|学校|医院|商场|城|苑|府|国际|大街|广场|景区)/.test(name)) {
    score += 1200;
  }
  if (/(住宅区|住宅小区|公司企业|风景名胜|综合公园|商务住宅|购物服务|科教文化服务|医疗保健服务)/.test(type)) {
    score += 900;
  }
  if (/(门|出入口|入口|出口|停车场|充电站|快递柜|公交站|地铁站|厕所|卫生间|便利店|警务室|售票处)/.test(name)) {
    score -= 1000;
  }

  return score;
}

function pickNearestAmapPOI(
  data: AMapReverseGeocodingResponse,
  district: string | undefined,
  city: string | undefined,
): string | undefined {
  const nearestPOI = (data.regeocode?.pois ?? [])
    .filter((poi) => poi.name?.trim())
    .map((poi) => ({
      name: poi.name?.trim(),
      type: poi.type?.trim(),
      distance: Number.parseFloat(poi.distance ?? ""),
      score: scorePOI(poi),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
      const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    })[0];

  return withAreaSuffix(nearestPOI?.name, district, city) ?? nearestPOI?.name;
}

async function resolveAmapLocationLabel(
  lat: number,
  lng: number,
  amapApiKey: string,
  fallbackLabel: string,
  amapSecurityKey?: string,
): Promise<string> {
  const nearbyPOIs = await fetchAmapNearbyPOIs(lat, lng, amapApiKey, 200, amapSecurityKey);
  const areaDataPromise = fetchAmapReverseGeocoding(lat, lng, amapApiKey, 1000, amapSecurityKey);
  const expandedPOIs = nearbyPOIs?.pois?.length ? nearbyPOIs : await fetchAmapNearbyPOIs(lat, lng, amapApiKey, 1000, amapSecurityKey);
  if (expandedPOIs && expandedPOIs.status !== "1") {
    const debugLabel = buildAmapDebugLabel(fallbackLabel, expandedPOIs, "place/around failed");
    console.warn("AMap place/around failed", { lat, lng, response: expandedPOIs });
    return debugLabel;
  }
  const areaData = await areaDataPromise;
  const city = Array.isArray(areaData?.regeocode?.addressComponent?.city)
    ? areaData?.regeocode?.addressComponent?.city[0]
    : areaData?.regeocode?.addressComponent?.city;
  const district = areaData?.regeocode?.addressComponent?.district;
  const nearestPOIName = pickNearestAmapPOI({ status: expandedPOIs?.status, regeocode: { pois: expandedPOIs?.pois } }, district, city);
  if (nearestPOIName) {
    return nearestPOIName;
  }

  const data = areaData;
  if (!data || data.status !== "1") {
    const debugLabel = buildAmapDebugLabel(fallbackLabel, data, data ? "regeo failed" : "request timeout or blocked");
    console.warn("AMap regeo failed", { lat, lng, response: data });
    return debugLabel;
  }

  const nearestPOI = pickNearestAmapPOI(data, district, city);
  if (nearestPOI) {
    return nearestPOI;
  }

  const primary = pickFirstNonEmpty([
    data.regeocode?.addressComponent?.neighborhood?.name,
    data.regeocode?.addressComponent?.township,
    city,
  ]);
  const areaLabel = withAreaSuffix(primary, district, city) ?? withAreaSuffix(district, undefined, city) ?? city;
  if (areaLabel) {
    return areaLabel;
  }

  return data.regeocode?.formatted_address?.trim() || fallbackLabel;
}

async function resolveOSMLocationLabel(lat: number, lng: number, fallbackLabel: string): Promise<string> {
  const url = `${OSM_GEOCODING_ENDPOINT}?lat=${lat}&lon=${lng}&format=json`;
  const data = await fetchJsonWithTimeout<OSMReverseGeocodingResponse>(url, 1000);
  if (!data) {
    return fallbackLabel;
  }

  const primary = pickFirstNonEmpty([
    data.address?.neighbourhood,
    data.address?.suburb,
    data.address?.quarter,
    data.address?.city_district,
    data.address?.village,
    data.address?.town,
    data.address?.city,
    data.address?.county,
  ]);
  const district = pickFirstNonEmpty([data.address?.city_district, data.address?.county]);
  const city = pickFirstNonEmpty([data.address?.city, data.address?.town, data.address?.village]);
  const fromAddress = withAreaSuffix(primary, district, city);
  if (fromAddress) {
    return fromAddress;
  }

  return normalizeDisplayName(data.display_name ?? "") || fallbackLabel;
}

export async function resolveLocationLabel({
  lat,
  lng,
  provider,
  amapApiKey,
  amapSecurityKey,
  fallbackLabel,
}: ResolveLocationLabelParams): Promise<string> {
  if (provider === InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.AMAP && amapApiKey) {
    const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
    return resolveAmapLocationLabel(gcjLat, gcjLng, amapApiKey, fallbackLabel, amapSecurityKey);
  }

  return resolveOSMLocationLabel(lat, lng, fallbackLabel);
}

export async function resolveLocationCandidates({
  lat,
  lng,
  provider,
  amapApiKey,
  amapSecurityKey,
}: ResolveLocationLabelParams): Promise<string[]> {
  if (provider !== InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider.AMAP || !amapApiKey) {
    return [];
  }

  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);

  const [nearbyData, areaData] = await Promise.all([
    fetchAmapNearbyPOIs(gcjLat, gcjLng, amapApiKey, 1000, amapSecurityKey),
    fetchAmapReverseGeocoding(gcjLat, gcjLng, amapApiKey, 1000, amapSecurityKey),
  ]);

  if (!nearbyData?.pois?.length) {
    return [];
  }

  const city = Array.isArray(areaData?.regeocode?.addressComponent?.city)
    ? areaData?.regeocode?.addressComponent?.city[0]
    : areaData?.regeocode?.addressComponent?.city;
  const district = areaData?.regeocode?.addressComponent?.district;

  const seen = new Set<string>();
  return nearbyData.pois
    .filter((poi) => poi.name?.trim())
    .map((poi) => ({
      label: withAreaSuffix(poi.name!.trim(), district, city) ?? poi.name!.trim(),
      score: scorePOI(poi),
      distance: Number.parseFloat(poi.distance ?? "9999"),
    }))
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
    .filter((poi) => {
      if (seen.has(poi.label)) return false;
      seen.add(poi.label);
      return true;
    })
    .slice(0, 5)
    .map((poi) => poi.label);
}
