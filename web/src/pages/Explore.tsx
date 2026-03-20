import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PlusIcon } from "lucide-react";
import MemoEditor from "@/components/MemoEditor";
import MemoView from "@/components/MemoView/MemoView";
import PagedMemoList from "@/components/PagedMemoList";
import { Dialog, DialogPortal, DialogOverlay, DialogTrigger } from "@/components/ui/dialog";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const Explore = () => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const [editorOpen, setEditorOpen] = useState(false);

  // Determine visibility filter based on authentication status
  // - Logged-in users: Can see PUBLIC and PROTECTED memos
  // - Visitors: Can only see PUBLIC memos
  // Note: The backend is responsible for filtering stats based on visibility permissions.
  const visibilities = currentUser ? [Visibility.PUBLIC, Visibility.PROTECTED] : [Visibility.PUBLIC];

  // Build filter using unified hook (no creator scoping for Explore)
  const memoFilter = useMemoFilters({
    includeShortcuts: false,
    includePinned: false,
    visibilities,
  });

  // Get sorting logic using unified hook (no pinned sorting)
  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: false,
    state: State.NORMAL,
  });

  return (
    <div className="relative min-h-full w-full">
      <PagedMemoList
        renderer={(memo: Memo) => <MemoView key={`${memo.name}-${memo.updateTime}`} memo={memo} showCreator showVisibility compact />}
        listSort={listSort}
        orderBy={orderBy}
        filter={memoFilter}
        showCreator
      />

      {currentUser && (
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogTrigger asChild>
            <button className="fixed bottom-6 right-6 md:bottom-12 md:right-12 z-20 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all outline-none border border-primary-foreground/10">
              <PlusIcon className="w-8 h-8" strokeWidth={3} />
            </button>
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay className="duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              className="fixed inset-0 z-50 flex items-start sm:items-center justify-center pt-20 sm:pt-0 bg-transparent outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  const activeElement = document.activeElement;
                  if (activeElement instanceof HTMLElement) {
                    activeElement.blur();
                  }
                  // Wait for the virtual keyboard to begin retracting or the blur to process
                  setTimeout(() => {
                    setEditorOpen(false);
                  }, 123);
                }
              }}
            >
              <div className="w-full max-w-2xl mx-4 outline-none">
                <MemoEditor placeholder={t("editor.any-thoughts")} cacheKey="explore-memo-editor" autoFocus onConfirm={() => setEditorOpen(false)} />
              </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      )}
    </div>
  );
};

export default Explore;
