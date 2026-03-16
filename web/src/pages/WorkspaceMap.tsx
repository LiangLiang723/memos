import UserMemoMap from "@/components/UserMemoMap";
import { useMemoFilters } from "@/hooks/useMemoFilters";

const WorkspaceMap = () => {
  const filter = useMemoFilters();

  return (
    <div className="w-full h-[calc(100dvh-3rem)] md:h-[calc(100dvh-4rem)]">
      <UserMemoMap filter={filter} className="h-full" />
    </div>
  );
};

export default WorkspaceMap;
