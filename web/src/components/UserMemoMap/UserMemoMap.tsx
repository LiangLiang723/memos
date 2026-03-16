import L, { DivIcon } from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import MemoView from "@/components/MemoView/MemoView";
import { defaultMarkerIcon, ThemedTileLayer } from "@/components/map/map-utils";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface Props {
  creator?: string;
  filter?: string;
  className?: string;
}

interface ClusterGroup {
  getChildCount(): number;
}

const createClusterCustomIcon = (cluster: ClusterGroup) => {
  return new DivIcon({
    html: `<span class="flex items-center justify-center w-full h-full bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-md border-2 border-background">${cluster.getChildCount()}</span>`,
    className: "custom-marker-cluster",
    iconSize: L.point(32, 32, true),
  });
};

const extractUserIdFromName = (name: string): string => {
  const match = name.match(/users\/(\d+)/);
  return match ? match[1] : "";
};

const MapFitBounds = ({ memos }: { memos: Memo[] }) => {
  const map = useMap();

  useEffect(() => {
    if (memos.length === 0) return;

    const validMemos = memos.filter((m) => m.location);
    if (validMemos.length === 0) return;

    const bounds = L.latLngBounds(validMemos.map((memo) => [memo.location!.latitude, memo.location!.longitude]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [memos, map]);

  return null;
};

const UserMemoMap = ({ creator, filter, className }: Props) => {
  const creatorId = useMemo(() => (creator ? extractUserIdFromName(creator) : ""), [creator]);
  const combinedFilter = useMemo(() => {
    const conditions = [creatorId ? `creator_id == ${creatorId}` : "", filter || ""].filter(Boolean);
    return conditions.length > 0 ? conditions.join(" && ") : undefined;
  }, [creatorId, filter]);

  const { data, isLoading } = useInfiniteMemos({
    state: State.NORMAL,
    orderBy: "display_time desc",
    pageSize: 1000,
    ...(combinedFilter ? { filter: combinedFilter } : {}),
  });

  const memosWithLocation = useMemo(() => data?.pages.flatMap((page) => page.memos).filter((memo) => memo.location) || [], [data]);
  const [selectedMemoName, setSelectedMemoName] = useState<string | undefined>(undefined);
  const [animateCard, setAnimateCard] = useState(false);
  const hadCardOpenRef = useRef(false);
  const selectedMemo = useMemo(
    () => memosWithLocation.find((memo) => memo.name === selectedMemoName),
    [memosWithLocation, selectedMemoName],
  );

  useEffect(() => {
    const hasSelectedCard = Boolean(selectedMemoName);
    setAnimateCard(hasSelectedCard && !hadCardOpenRef.current);
    hadCardOpenRef.current = hasSelectedCard;
  }, [selectedMemoName]);

  useEffect(() => {
    if (selectedMemoName && !memosWithLocation.some((memo) => memo.name === selectedMemoName)) {
      setSelectedMemoName(undefined);
    }
  }, [memosWithLocation, selectedMemoName]);

  if (isLoading) return null;

  const defaultCenter = { lat: 48.8566, lng: 2.3522 };

  return (
    <div className={cn("relative z-0 w-full h-full min-h-0 flex flex-col gap-3", className)}>
      <div className="relative w-full min-h-[260px] flex-1 rounded-xl overflow-hidden border border-border shadow-sm transition-all duration-300">
        {memosWithLocation.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-background/70 px-4 py-2 shadow-sm backdrop-blur-sm">
              <MapPinIcon className="h-5 w-5 text-muted-foreground opacity-60" />
              <p className="text-xs font-medium text-muted-foreground">No location data found</p>
            </div>
          </div>
        )}

        <MapContainer center={defaultCenter} zoom={2} className="h-full w-full z-0" scrollWheelZoom={true} touchZoom={true} attributionControl={false}>
          <ThemedTileLayer />
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterCustomIcon}
            maxClusterRadius={40}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {memosWithLocation.map((memo) => (
              <Marker
                key={memo.name}
                position={[memo.location!.latitude, memo.location!.longitude]}
                icon={defaultMarkerIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedMemoName(memo.name);
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
          <MapFitBounds memos={memosWithLocation} />
        </MapContainer>
      </div>

      {selectedMemo && (
        <div
          className={cn(
            "rounded-xl border border-border bg-background p-3 shadow-sm transition-all duration-300 ease-out",
            animateCard && "animate-in slide-in-from-bottom-2 fade-in-0",
          )}
        >
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setSelectedMemoName(undefined)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
              aria-label="Close selected memo"
              title="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <MemoView memo={selectedMemo} parentPage="/map" compact={false} className="mb-0" />
        </div>
      )}
    </div>
  );
};

export default UserMemoMap;
