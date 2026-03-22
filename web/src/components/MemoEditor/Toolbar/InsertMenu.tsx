import { create } from "@bufbuild/protobuf";
import * as exifr from "exifr";
import { LatLng } from "leaflet";
import { uniqBy } from "lodash-es";
import { FileIcon, ImageIcon, LinkIcon, LoaderIcon, MapPinIcon, Maximize2Icon, MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useDebounce } from "react-use";
import { useLocationCandidates, useReverseGeocoding } from "@/components/map";
import { resolveLocationLabel } from "@/components/map/geocoding";
import { getImageLocationCandidateDistanceMeters, getMapSettingWithDefaults } from "@/components/map/map-setting";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useInstance } from "@/contexts/InstanceContext";
import useMediaQuery from "@/hooks/useMediaQuery";
import { LocationSchema, type MemoRelation } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { LinkMemoDialog, LocationDialog } from "../components";
import { useFileUpload, useLinkMemo, useLocation } from "../hooks";
import { useEditorContext } from "../state";
import type { InsertMenuProps } from "../types";
import type { LocalFile } from "../types/attachment";

const InsertMenu = (props: InsertMenuProps & { compact?: boolean }) => {
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const mapSetting = getMapSettingWithDefaults(memoRelatedSetting.mapSetting);
  const imageCandidateDistanceMeters = getImageLocationCandidateDistanceMeters();
  const { state, actions, dispatch } = useEditorContext();
  const { location: initialLocation, onLocationChange, onToggleFocusMode, isUploading: isUploadingProp } = props;
  const isCreatingMemo = !props.memoName;

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [hasUserOpenedLocationDialog, setHasUserOpenedLocationDialog] = useState(false);
  const hadLocationRef = useRef(Boolean(state.metadata.location));

  const { fileInputRef, selectingFlag, handleFileInputChange, handleUploadClick } = useFileUpload((newFiles: LocalFile[]) => {
    newFiles.forEach((file) => dispatch(actions.addLocalFile(file)));
  });

  const isMediumScreen = useMediaQuery("md");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const handlePhotoClick = useCallback(() => {
    photoInputRef.current?.click();
  }, []);

  const linkMemo = useLinkMemo({
    isOpen: linkDialogOpen,
    currentMemoName: props.memoName,
    existingRelations: state.metadata.relations,
    onAddRelation: (relation: MemoRelation) => {
      dispatch(actions.setMetadata({ relations: uniqBy([...state.metadata.relations, relation], (r) => r.relatedMemo?.name) }));
      setLinkDialogOpen(false);
    },
  });

  const location = useLocation(props.location);

  const [debouncedPosition, setDebouncedPosition] = useState<LatLng | undefined>(undefined);

  useDebounce(
    () => {
      setDebouncedPosition(location.state.position);
    },
    1000,
    [location.state.position],
  );

  const { data: displayName } = useReverseGeocoding(debouncedPosition?.lat, debouncedPosition?.lng);
  const { data: locationCandidates = [], isLoading: isGeocodingLoading } = useLocationCandidates(
    debouncedPosition?.lat,
    debouncedPosition?.lng,
  );
  const [imageLocationPoints, setImageLocationPoints] = useState<Array<{ lat: number; lng: number; label: string }>>([]);
  const [activeSeed, setActiveSeed] = useState<{ label: string; kind: "image" | "current"; imageIndex?: number } | undefined>(undefined);

  useEffect(() => {
    if (state.metadata.location) {
      hadLocationRef.current = true;
      return;
    }
  }, [state.metadata.location]);

  const handleGeolocationError = useCallback(
    (error?: GeolocationPositionError) => {
      console.error("Geolocation error:", error);
      const message =
        error?.code === error?.PERMISSION_DENIED
          ? t("editor.location-permission-denied")
          : error?.code === error?.POSITION_UNAVAILABLE
            ? t("editor.location-position-unavailable")
            : t("editor.location-unavailable");
      toast.error(message);
    },
    [t],
  );

  const requestCurrentPosition = useCallback(async (): Promise<GeolocationPosition | undefined> => {
    if (!navigator.geolocation) {
      toast.error(t("editor.location-unavailable"));
      return undefined;
    }

    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    })
      .then((position) => position)
      .catch((error: GeolocationPositionError) => {
        handleGeolocationError(error);
        return undefined;
      });
  }, [handleGeolocationError, t]);

  useEffect(() => {
    let cancelled = false;

    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const earthRadius = 6371000;
      const deltaLat = toRadians(b.lat - a.lat);
      const deltaLng = toRadians(b.lng - a.lng);
      const sinLat = Math.sin(deltaLat / 2);
      const sinLng = Math.sin(deltaLng / 2);
      const h = sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
      return 2 * earthRadius * Math.asin(Math.sqrt(h));
    };

    const loadImageLocationPoints = async () => {
      const localImageFiles = state.localFiles.map((item) => item.file).filter((file) => file.type.startsWith("image/"));
      const attachedImageUrls = state.metadata.attachments
        .filter((attachment) => attachment.type.startsWith("image/"))
        .map((attachment) => getAttachmentUrl(attachment));

      if (localImageFiles.length === 0 && attachedImageUrls.length === 0) {
        setImageLocationPoints([]);
        return;
      }

      const points: Array<{ lat: number; lng: number; label: string }> = [];
      const minDistanceMeters = imageCandidateDistanceMeters;

      const parseExif = async (source: File | string): Promise<Record<string, unknown> | null> => {
        try {
          if (typeof source === "string") {
            const response = await fetch(source, { credentials: "include" });
            if (!response.ok) {
              return null;
            }
            const blob = await response.blob();
            return (await exifr.parse(blob, { gps: true })) as Record<string, unknown> | null;
          }
          return (await exifr.parse(source, { gps: true })) as Record<string, unknown> | null;
        } catch {
          return null;
        }
      };

      for (const imageFile of localImageFiles) {
        try {
          const exifData = await parseExif(imageFile);
          if (!exifData) {
            continue;
          }

          const lat = toNumber(exifData?.latitude ?? exifData?.GPSLatitude);
          const lng = toNumber(exifData?.longitude ?? exifData?.GPSLongitude);
          const valid = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

          if (!valid) {
            continue;
          }

          const shouldAdd = points.every((point) => distanceMeters(point, { lat, lng }) > minDistanceMeters);
          if (!shouldAdd) {
            continue;
          }

          const fallbackLabel = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          let label = fallbackLabel;
          try {
            label = await resolveLocationLabel({
              lat,
              lng,
              provider: mapSetting.provider,
              amapApiKey: mapSetting.amapApiKey,
              amapSecurityKey: mapSetting.amapSecurityKey,
              fallbackLabel,
            });
          } catch {
            label = fallbackLabel;
          }

          points.push({ lat, lng, label });
        } catch {
          // Ignore files without readable EXIF data.
        }
      }

      for (const imageUrl of attachedImageUrls) {
        try {
          const exifData = await parseExif(imageUrl);
          if (!exifData) {
            continue;
          }

          const lat = toNumber(exifData?.latitude ?? exifData?.GPSLatitude);
          const lng = toNumber(exifData?.longitude ?? exifData?.GPSLongitude);
          const valid = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

          if (!valid) {
            continue;
          }

          const shouldAdd = points.every((point) => distanceMeters(point, { lat, lng }) > minDistanceMeters);
          if (!shouldAdd) {
            continue;
          }

          const fallbackLabel = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          let label = fallbackLabel;
          try {
            label = await resolveLocationLabel({
              lat,
              lng,
              provider: mapSetting.provider,
              amapApiKey: mapSetting.amapApiKey,
              amapSecurityKey: mapSetting.amapSecurityKey,
              fallbackLabel,
            });
          } catch {
            label = fallbackLabel;
          }

          points.push({ lat, lng, label });
        } catch {
          // Ignore files without readable EXIF data.
        }
      }

      if (!cancelled) {
        setImageLocationPoints(points);
      }
    };

    void loadImageLocationPoints();
    return () => {
      cancelled = true;
    };
  }, [
    imageCandidateDistanceMeters,
    mapSetting.amapApiKey,
    mapSetting.amapSecurityKey,
    mapSetting.provider,
    state.localFiles,
    state.metadata.attachments,
  ]);

  useEffect(() => {
    if (!isCreatingMemo) {
      return;
    }
    if (hasUserOpenedLocationDialog) {
      return;
    }
    if (state.localFiles.length === 0) {
      return;
    }

    const firstImagePoint = imageLocationPoints[0];
    if (!firstImagePoint) {
      return;
    }
    if (initialLocation || state.metadata.location) {
      return;
    }
    // If location existed before and is now cleared, treat it as explicit user removal.
    if (hadLocationRef.current && !state.metadata.location) {
      return;
    }

    onLocationChange(
      create(LocationSchema, {
        latitude: firstImagePoint.lat,
        longitude: firstImagePoint.lng,
        placeholder: firstImagePoint.label,
      }),
    );
  }, [
    hasUserOpenedLocationDialog,
    imageLocationPoints,
    initialLocation,
    isCreatingMemo,
    onLocationChange,
    state.localFiles.length,
    state.metadata.location,
  ]);

  const mergedCandidates = useMemo(() => {
    const seen = new Set<string>();
    const output: string[] = [];

    const pushCandidate = (value: string | undefined) => {
      const normalized = value?.trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    };

    if (activeSeed?.label) {
      // Required order: seed label first, then nearby alternatives.
      pushCandidate(activeSeed.label);
      locationCandidates.forEach((candidate) => pushCandidate(candidate));
      return output.slice(0, 5);
    }

    pushCandidate(location.state.placeholder);
    imageLocationPoints.forEach((point) => pushCandidate(point.label));
    locationCandidates.forEach((candidate) => pushCandidate(candidate));

    return output.slice(0, 6);
  }, [activeSeed, imageLocationPoints, location.state.placeholder, locationCandidates]);

  useEffect(() => {
    // Only auto-seed from image EXIF when the dialog opens for the first time
    // (locationInitialized === false). Once the user has manually set a location,
    // locationInitialized becomes true and we never override it again.
    if (locationDialogOpen && imageLocationPoints.length > 0 && !activeSeed && !location.locationInitialized) {
      const firstPoint = imageLocationPoints[0];
      location.handlePositionChange(new LatLng(firstPoint.lat, firstPoint.lng));
      location.setPlaceholder(firstPoint.label);
      setActiveSeed({ label: firstPoint.label, kind: "image", imageIndex: 0 });
      return;
    }

    if (!location.state.placeholder.trim() && imageLocationPoints[0]?.label) {
      location.setPlaceholder(imageLocationPoints[0].label);
      return;
    }
    if (!location.state.placeholder.trim() && locationCandidates[0]) {
      location.setPlaceholder(locationCandidates[0]);
      return;
    }
    if (!location.state.placeholder.trim() && displayName) {
      location.setPlaceholder(displayName);
    }
  }, [activeSeed, displayName, imageLocationPoints, location, location.state.placeholder, locationCandidates, locationDialogOpen]);

  const isUploading = selectingFlag || isUploadingProp;

  const handleOpenLinkDialog = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const handleLocationClick = useCallback(() => {
    setHasUserOpenedLocationDialog(true);

    if (initialLocation && !location.state.position) {
      location.restoreInitial();
    }

    setActiveSeed(undefined);
    setLocationDialogOpen(true);
    if (!initialLocation && !location.locationInitialized) {
      void requestCurrentPosition().then((position) => {
        if (!position) {
          return;
        }
        location.handlePositionChange(new LatLng(position.coords.latitude, position.coords.longitude));
      });
    }
  }, [initialLocation, location, requestCurrentPosition]);

  const handleLocationConfirm = useCallback(() => {
    const newLocation = location.getLocation();
    if (newLocation) {
      onLocationChange(newLocation);
      setLocationDialogOpen(false);
    }
  }, [location, onLocationChange]);

  const handleLocationCancel = useCallback(() => {
    setActiveSeed(undefined);
    location.reset();
    setLocationDialogOpen(false);
  }, [location]);

  const handlePositionChange = useCallback(
    (position: LatLng) => {
      setActiveSeed(undefined);
      location.handlePositionChange(position);
    },
    [location],
  );

  const handleSelectImageLocation = useCallback(
    (index: number) => {
      const point = imageLocationPoints[index];
      if (!point) {
        return;
      }

      location.handlePositionChange(new LatLng(point.lat, point.lng));
      location.setPlaceholder(point.label);
      setActiveSeed({ label: point.label, kind: "image", imageIndex: index });
    },
    [imageLocationPoints, location],
  );

  const handleUseCurrentLocation = useCallback(() => {
    void requestCurrentPosition().then(async (position) => {
      if (!position) {
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const fallbackLabel = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      let label = fallbackLabel;

      try {
        label = await resolveLocationLabel({
          lat,
          lng,
          provider: mapSetting.provider,
          amapApiKey: mapSetting.amapApiKey,
          amapSecurityKey: mapSetting.amapSecurityKey,
          fallbackLabel,
        });
      } catch {
        label = fallbackLabel;
      }

      location.handlePositionChange(new LatLng(lat, lng));
      location.setPlaceholder(label);
      setActiveSeed({ label, kind: "current" });
    });
  }, [location, mapSetting.amapApiKey, mapSetting.amapSecurityKey, mapSetting.provider, requestCurrentPosition]);

  const handleToggleFocusMode = useCallback(() => {
    onToggleFocusMode?.();
  }, [onToggleFocusMode]);

  return (
    <>
      {/* Flat button group for file upload, link memo, and location */}
      <div className="flex flex-row gap-2">
        {/* If compact is true, render a dropdown menu trigger to avoid overflow */}
        {props.compact ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2 shadow-sm hover:shadow-md transition-all duration-200" title={t("common.collapse")} aria-label={t("common.collapse")}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start">
              {!isMediumScreen && (
                <DropdownMenuItem
                  onClick={() => {
                    handlePhotoClick();
                  }}
                >
                  <ImageIcon className="size-4" /> {t("common.image")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  handleUploadClick();
                }}
              >
                <FileIcon className="size-4" /> {t("common.upload")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  handleOpenLinkDialog();
                }}
              >
                <LinkIcon className="size-4" /> {t("tooltip.link-memo")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  handleLocationClick();
                }}
              >
                <MapPinIcon className="size-4" /> {t("tooltip.select-location")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  handleToggleFocusMode();
                }}
              >
                <Maximize2Icon className="size-4" /> {t("editor.focus-mode")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            {/* Image (Photo Library) button - only show on small screens */}
            {!isMediumScreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePhotoClick()}
                disabled={isUploading}
                title={t("common.image")}
                className="px-2 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {isUploading ? <LoaderIcon className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              </Button>
            )}

            {/* Upload button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUploadClick()}
              disabled={isUploading}
              title={t("common.upload")}
              className="px-2 shadow-sm hover:shadow-md transition-all duration-200"
            >
              {isUploading ? <LoaderIcon className="size-4 animate-spin" /> : <FileIcon className="size-4" />}
            </Button>

            {/* Link memo button */}
            <Button variant="outline" size="sm" onClick={handleOpenLinkDialog} title={t("tooltip.link-memo")} className="px-2 shadow-sm hover:shadow-md transition-all duration-200">
              <LinkIcon className="size-4" />
            </Button>

            {/* Location button */}
            <Button variant="outline" size="sm" onClick={handleLocationClick} title={t("tooltip.select-location")} className="px-2 shadow-sm hover:shadow-md transition-all duration-200">
              <MapPinIcon className="size-4" />
            </Button>

            {/* Focus mode button */}
            <Button variant="outline" size="sm" onClick={handleToggleFocusMode} title={t("editor.focus-mode")} className="px-2 shadow-sm hover:shadow-md transition-all duration-200">
              <Maximize2Icon className="size-4" />
            </Button>
          </>
        )}
      </div>

      <input
        className="hidden"
        ref={photoInputRef}
        disabled={isUploading}
        onChange={handleFileInputChange}
        type="file"
        multiple={true}
        accept="image/*,video/*"
      />

      <input
        className="hidden"
        ref={fileInputRef}
        disabled={isUploading}
        onChange={handleFileInputChange}
        type="file"
        multiple={true}
        accept="*"
      />

      <LinkMemoDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        searchText={linkMemo.searchText}
        onSearchChange={linkMemo.setSearchText}
        filteredMemos={linkMemo.filteredMemos}
        isFetching={linkMemo.isFetching}
        onSelectMemo={linkMemo.addMemoRelation}
        isAlreadyLinked={linkMemo.isAlreadyLinked}
      />

      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        state={location.state}
        locationInitialized={location.locationInitialized}
        onPositionChange={handlePositionChange}
        onUpdateCoordinate={location.updateCoordinate}
        onPlaceholderChange={location.setPlaceholder}
        onCancel={handleLocationCancel}
        onConfirm={handleLocationConfirm}
        candidates={mergedCandidates}
        isGeocodingLoading={isGeocodingLoading}
        imageLocationLabels={imageLocationPoints.map((point) => point.label)}
        activeImageLocationIndex={activeSeed?.kind === "image" ? activeSeed.imageIndex : undefined}
        onSelectImageLocation={handleSelectImageLocation}
        onUseCurrentLocation={handleUseCurrentLocation}
      />
    </>
  );
};

export default InsertMenu;

