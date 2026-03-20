import L, { DivIcon, Marker as LeafletMarker } from "leaflet";
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

interface ClusterLayer {
  getAllChildMarkers(): LeafletMarker[];
}

interface ClusterClickEvent {
  layer: ClusterLayer;
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

const INITIAL_VISIBLE_MEMO_COUNT = 23;
const LOAD_MORE_MEMO_STEP = 9;

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
  const [selectedMemoNames, setSelectedMemoNames] = useState<string[]>([]);
  const [visibleMemoCount, setVisibleMemoCount] = useState(INITIAL_VISIBLE_MEMO_COUNT);
  const [animateCard, setAnimateCard] = useState(false);
  const hadCardOpenRef = useRef(false);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedMemos = useMemo(
    () => memosWithLocation.filter((memo) => selectedMemoNames.includes(memo.name)),
    [memosWithLocation, selectedMemoNames],
  );

  const hasSelectedMemos = selectedMemos.length > 0;

  const handleSelectMemo = (memoName: string) => {
    setSelectedMemoNames([memoName]);
  };

  const handleSelectCluster = (event: ClusterClickEvent) => {
    const childMemoNames = event.layer
      .getAllChildMarkers()
      .map((marker) => marker.options.title)
      .filter((name): name is string => Boolean(name));
    if (childMemoNames.length === 0) {
      return;
    }

    setSelectedMemoNames(Array.from(new Set(childMemoNames)));
  };

  useEffect(() => {
    const hasSelectedCard = selectedMemoNames.length > 0;
    setAnimateCard(hasSelectedCard && !hadCardOpenRef.current);
    hadCardOpenRef.current = hasSelectedCard;
  }, [selectedMemoNames]);

  useEffect(() => {
    setVisibleMemoCount(INITIAL_VISIBLE_MEMO_COUNT);
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [selectedMemoNames]);

  useEffect(() => {
    if (selectedMemoNames.length === 0) {
      return;
    }

    const existingMemoNameSet = new Set(memosWithLocation.map((memo) => memo.name));
    const nextSelectedMemoNames = selectedMemoNames.filter((memoName) => existingMemoNameSet.has(memoName));
    if (nextSelectedMemoNames.length !== selectedMemoNames.length) {
      setSelectedMemoNames(nextSelectedMemoNames);
    }
  }, [memosWithLocation, selectedMemoNames]);

  if (isLoading) return null;

  const defaultCenter = { lat: 48.8566, lng: 2.3522 };
  const visibleSelectedMemos = selectedMemos.slice(0, visibleMemoCount);
  const hasMoreSelectedMemos = selectedMemos.length > visibleMemoCount;
  const remainingSelectedMemoCount = Math.max(selectedMemos.length - visibleMemoCount, 0);

  return (
      <div className={cn("relative z-0 w-full h-full min-h-0 overflow-hidden", className)}>
      <div
        className={cn(
            "absolute top-0 left-0 w-full rounded-xl overflow-hidden border border-border shadow-sm transition-all duration-300 ease-in-out z-0",
            hasSelectedMemos ? "h-[42%]" : "h-full",
        )}
      >
        {memosWithLocation.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-background/70 px-4 py-2 shadow-sm backdrop-blur-sm">
              <MapPinIcon className="h-5 w-5 text-muted-foreground opacity-60" />
              <p className="text-xs font-medium text-muted-foreground">No location data found</p>
            </div>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={2}
          className="h-full w-full z-0"
          scrollWheelZoom={true}
          touchZoom={true}
          attributionControl={false}
        >
          <ThemedTileLayer />
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterCustomIcon}
            maxClusterRadius={40}
            spiderfyOnMaxZoom={false}
            zoomToBoundsOnClick={false}
            showCoverageOnHover={false}
            eventHandlers={{
              clusterclick: handleSelectCluster,
            }}
          >
            {memosWithLocation.map((memo) => (
              <Marker
                key={memo.name}
                position={[memo.location!.latitude, memo.location!.longitude]}
                icon={defaultMarkerIcon}
                title={memo.name}
                eventHandlers={{
                  click: () => {
                    handleSelectMemo(memo.name);
                  },
                }}
              />
            ))}
          </MarkerClusterGroup>
          <MapFitBounds memos={memosWithLocation} />
        </MapContainer>
      </div>

        <div
          ref={listScrollRef}
          className={cn(
            "absolute bottom-0 left-0 w-full rounded-xl border bg-background shadow-sm transition-all duration-300 ease-in-out overflow-y-auto whitespace-nowrap z-10",
            hasSelectedMemos
              ? "h-[calc(58%-0.75rem)] p-3 border-border opacity-100 translate-y-0"
              : "h-0 p-0 border-transparent opacity-0 translate-y-4 pointer-events-none",
            animateCard && "animate-in slide-in-from-bottom-2 fade-in-0",
          )}
        >
        {hasSelectedMemos && (
          <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              已显示 {visibleSelectedMemos.length} / {selectedMemos.length} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMemoNames([])}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
                aria-label="Close selected memo"
                title="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {visibleSelectedMemos.map((memo) => (
                <MemoView key={`${memo.name}-${memo.displayTime}`} memo={memo} parentPage="/map" compact={false} className="mb-0 whitespace-normal" />
            ))}
          </div>
          {hasMoreSelectedMemos && (
              <div className="mt-3 flex justify-center whitespace-normal">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                onClick={() => setVisibleMemoCount((previousCount) => previousCount + LOAD_MORE_MEMO_STEP)}
              >
                加载更多（剩余 {remainingSelectedMemoCount} 条）
              </button>
            </div>
          )}
          </>
      )}
      </div>
    </div>
  );
};

export default UserMemoMap;


