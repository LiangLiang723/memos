import { create } from "@bufbuild/protobuf";
import { LatLng } from "leaflet";
import { useEffect, useState } from "react";
import { Location, LocationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { LocationState } from "../types/insert-menu";

const createLocationState = (location?: Location): LocationState => ({
  placeholder: location?.placeholder || "",
  position: location ? new LatLng(location.latitude, location.longitude) : undefined,
  latInput: location ? String(location.latitude) : "",
  lngInput: location ? String(location.longitude) : "",
});

export const useLocation = (initialLocation?: Location) => {
  const [locationInitialized, setLocationInitialized] = useState(false);
  const [state, setState] = useState<LocationState>(() => createLocationState(initialLocation));

  useEffect(() => {
    if (!locationInitialized) {
      setState(createLocationState(initialLocation));
    }
  }, [initialLocation, locationInitialized]);

  const updatePosition = (position?: LatLng) => {
    setState((prev) => ({
      ...prev,
      position,
      latInput: position ? String(position.lat) : "",
      lngInput: position ? String(position.lng) : "",
    }));
  };

  const handlePositionChange = (position: LatLng) => {
    if (!locationInitialized) setLocationInitialized(true);
    updatePosition(position);
  };

  const updateCoordinate = (type: "lat" | "lng", value: string) => {
    setState((prev) => ({ ...prev, [type === "lat" ? "latInput" : "lngInput"]: value }));
    const num = parseFloat(value);
    const isValid = type === "lat" ? !isNaN(num) && num >= -90 && num <= 90 : !isNaN(num) && num >= -180 && num <= 180;
    if (isValid && state.position) {
      updatePosition(type === "lat" ? new LatLng(num, state.position.lng) : new LatLng(state.position.lat, num));
    }
  };

  const setPlaceholder = (placeholder: string) => {
    setState((prev) => ({ ...prev, placeholder }));
  };

  const reset = () => {
    setState(createLocationState(initialLocation));
    setLocationInitialized(false);
  };

  const restoreInitial = () => {
    setState(createLocationState(initialLocation));
    setLocationInitialized(false);
  };

  const getLocation = (): Location | undefined => {
    if (!state.position || !state.placeholder.trim()) {
      return undefined;
    }
    return create(LocationSchema, {
      latitude: state.position.lat,
      longitude: state.position.lng,
      placeholder: state.placeholder,
    });
  };

  return {
    state,
    locationInitialized,
    handlePositionChange,
    updateCoordinate,
    setPlaceholder,
    reset,
    restoreInitial,
    getLocation,
  };
};
