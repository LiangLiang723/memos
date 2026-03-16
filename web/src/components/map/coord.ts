function outOfChina(lat: number, lng: number): boolean {
  if (lng < 72.004 || lng > 137.8347) return true;
  if (lat < 0.8293 || lat > 55.8271) return true;
  return false;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

const a = 6378245.0;
const ee = 0.006693421622965943;

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lat, lng)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  const mgLat = lat + dLat;
  const mgLng = lng + dLng;
  return [mgLng, mgLat];
}

export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lat, lng)) return [lng, lat];

  const dLng = 0.01;
  const dLat = 0.01;
  let mLng = lng - dLng;
  let mLat = lat - dLat;
  let pLng = lng + dLng;
  let pLat = lat + dLat;
  let wLng = 0;
  let wLat = 0;

  for (let i = 0; i < 30; i++) {
    wLng = (mLng + pLng) / 2;
    wLat = (mLat + pLat) / 2;
    const [tLng, tLat] = wgs84ToGcj02(wLng, wLat);
    const dL = tLng - lng;
    const dB = tLat - lat;
    if (Math.abs(dL) < 1e-7 && Math.abs(dB) < 1e-7) return [wLng, wLat];
    if (dL > 0) pLng = wLng;
    else mLng = wLng;
    if (dB > 0) pLat = wLat;
    else mLat = wLat;
  }

  return [wLng, wLat];
}
