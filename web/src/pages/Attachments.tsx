import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { ExternalLinkIcon, PaperclipIcon, SearchIcon, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";
import { getAccessToken } from "@/auth-state";
import AttachmentIcon from "@/components/AttachmentIcon";
import ConfirmDialog from "@/components/ConfirmDialog";
import Empty from "@/components/Empty";
import MobileHeader from "@/components/MobileHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { attachmentServiceClient } from "@/connect";
import { extractUserIdFromName } from "@/helpers/resource-names";
import { useDeleteAttachment } from "@/hooks/useAttachmentQueries";
import useCurrentUser from "@/hooks/useCurrentUser";
import useDialog from "@/hooks/useDialog";
import useLoading from "@/hooks/useLoading";
import useMediaQuery from "@/hooks/useMediaQuery";
import i18n from "@/i18n";
import { handleError } from "@/lib/error";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { User_Role } from "@/types/proto/api/v1/user_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";

const PAGE_SIZE = 50;

const groupAttachmentsByDate = (attachments: Attachment[]): Map<string, Attachment[]> => {
  const grouped = new Map<string, Attachment[]>();
  const sorted = [...attachments].sort((a, b) => {
    const aTime = a.createTime ? timestampDate(a.createTime) : undefined;
    const bTime = b.createTime ? timestampDate(b.createTime) : undefined;
    return dayjs(bTime).unix() - dayjs(aTime).unix();
  });

  for (const attachment of sorted) {
    const createTime = attachment.createTime ? timestampDate(attachment.createTime) : undefined;
    const monthKey = dayjs(createTime).format("YYYY-MM");
    const group = grouped.get(monthKey) ?? [];
    group.push(attachment);
    grouped.set(monthKey, group);
  }

  return grouped;
};

const filterAttachments = (attachments: Attachment[], searchQuery: string): Attachment[] => {
  if (!searchQuery.trim()) return attachments;
  const query = searchQuery.toLowerCase();
  return attachments.filter((attachment) => attachment.filename.toLowerCase().includes(query));
};

interface AttachmentItemProps {
  attachment: Attachment;
}

type AttachmentScope = "workspace" | "mine";

const isAttachmentUnavailable = async (attachment: Attachment): Promise<boolean> => {
  if (attachment.externalLink) {
    return false;
  }

  try {
    const response = await fetch(getAttachmentUrl(attachment), {
      method: "HEAD",
      credentials: "include",
    });

    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
};

const AttachmentItem = ({ attachment }: AttachmentItemProps) => (
  <div className="w-full h-auto flex flex-col justify-start items-start">
    <div className="w-full h-0 pb-[100%] relative overflow-hidden rounded-lg border border-border bg-muted/40 cursor-pointer transition-all hover:border-accent/50">
      <div className="absolute inset-0 flex items-center justify-center">
        <AttachmentIcon attachment={attachment} strokeWidth={0.5} />
      </div>
    </div>
    <div className="w-full max-w-full flex flex-row justify-between items-center mt-1 px-1">
      <p className="text-xs shrink text-muted-foreground truncate">{attachment.filename}</p>
      {attachment.memo && (
        <Link to={`/${attachment.memo}`} className="text-primary hover:opacity-80 transition-opacity shrink-0 ml-1" aria-label="View memo">
          <ExternalLinkIcon className="w-3 h-3" />
        </Link>
      )}
    </div>
  </div>
);

const Attachments = () => {
  const t = useTranslate();
  const md = useMediaQuery("md");
  const currentUser = useCurrentUser();
  const loadingState = useLoading();
  const deleteUnusedAttachmentsDialog = useDialog();
  const { mutateAsync: deleteAttachment } = useDeleteAttachment();

  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<AttachmentScope>("workspace");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCompactingSQLite, setIsCompactingSQLite] = useState(false);

  const currentUserId = useMemo(() => {
    if (!currentUser?.name) {
      return undefined;
    }
    const id = Number(extractUserIdFromName(currentUser.name));
    return Number.isNaN(id) ? undefined : id;
  }, [currentUser?.name]);

  const scopeFilter = useMemo(() => {
    if (scope !== "mine" || currentUserId === undefined) {
      return "";
    }
    return `creator_id == ${currentUserId}`;
  }, [scope, currentUserId]);

  const isAdmin = currentUser?.role === User_Role.ADMIN;
  const canDeleteAllUnused = scope === "mine" || isAdmin;

  // Memoized computed values
  const filteredAttachments = useMemo(() => filterAttachments(attachments, searchQuery), [attachments, searchQuery]);

  const usedAttachments = useMemo(() => filteredAttachments.filter((attachment) => attachment.memo), [filteredAttachments]);

  const unusedAttachments = useMemo(() => filteredAttachments.filter((attachment) => !attachment.memo), [filteredAttachments]);

  const groupedAttachments = useMemo(() => groupAttachmentsByDate(usedAttachments), [usedAttachments]);

  const buildListRequest = useCallback(
    (pageToken = "") => ({
      pageSize: PAGE_SIZE,
      pageToken,
      filter: scopeFilter,
    }),
    [scopeFilter],
  );

  // Fetch initial attachments
  useEffect(() => {
    const fetchInitialAttachments = async () => {
      try {
        loadingState.setLoading();
        const { attachments: fetchedAttachments, nextPageToken } = await attachmentServiceClient.listAttachments(buildListRequest());
        setAttachments(fetchedAttachments);
        setNextPageToken(nextPageToken ?? "");
        loadingState.setFinish();
      } catch (error) {
        handleError(error, toast.error, {
          context: "Failed to fetch attachments",
          fallbackMessage: "Failed to load attachments. Please try again.",
          onError: () => loadingState.setError(),
        });
      }
    };

    fetchInitialAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildListRequest]);

  // Load more attachments with pagination
  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const { attachments: fetchedAttachments, nextPageToken: newPageToken } = await attachmentServiceClient.listAttachments({
        ...buildListRequest(nextPageToken),
      });
      setAttachments((prev) => [...prev, ...fetchedAttachments]);
      setNextPageToken(newPageToken ?? "");
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to load more attachments",
        fallbackMessage: "Failed to load more attachments. Please try again.",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildListRequest, nextPageToken, isLoadingMore]);

  // Refetch all attachments from the beginning
  const handleRefetch = useCallback(async () => {
    try {
      loadingState.setLoading();
      const { attachments: fetchedAttachments, nextPageToken } = await attachmentServiceClient.listAttachments(buildListRequest());
      setAttachments(fetchedAttachments);
      setNextPageToken(nextPageToken ?? "");
      loadingState.setFinish();
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to refetch attachments",
        fallbackMessage: "Failed to refresh attachments. Please try again.",
        onError: () => loadingState.setError(),
      });
    }
  }, [buildListRequest, loadingState]);

  // Delete all unused attachments
  const handleDeleteUnusedAttachments = useCallback(async () => {
    if (!canDeleteAllUnused) {
      toast.error("Permission denied");
      return;
    }

    try {
      let allAttachments: Attachment[] = [];
      let nextPageToken = "";
      const deleteFilter = isAdmin ? "" : scopeFilter;
      do {
        const response = await attachmentServiceClient.listAttachments({
          pageSize: 1000,
          pageToken: nextPageToken,
          filter: deleteFilter,
        });
        allAttachments = [...allAttachments, ...response.attachments];
        nextPageToken = response.nextPageToken;
      } while (nextPageToken);

      const unavailableChecks = await Promise.all(allAttachments.map((attachment) => isAttachmentUnavailable(attachment)));
      const unavailableAttachmentNames = new Set(
        allAttachments.filter((_, index) => unavailableChecks[index]).map((attachment) => attachment.name),
      );

      const allUnusedAttachments = allAttachments.filter(
        (attachment) => !attachment.memo || unavailableAttachmentNames.has(attachment.name),
      );
      await Promise.all(allUnusedAttachments.map((attachment) => deleteAttachment(attachment.name)));

      toast.success(t("resource.delete-all-unused-success"));
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to delete unused attachments",
        fallbackMessage: t("resource.delete-all-unused-error"),
      });
    } finally {
      await handleRefetch();
    }
  }, [canDeleteAllUnused, scopeFilter, t, handleRefetch, deleteAttachment]);

  const handleCompactSQLite = useCallback(async () => {
    if (!isAdmin || isCompactingSQLite) {
      return;
    }

    setIsCompactingSQLite(true);
    try {
      const accessToken = getAccessToken();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const compactResponse = await fetch(`${window.location.origin}/api/v1/admin/sqlite/compact`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!compactResponse.ok) {
        throw new Error("Failed to compact sqlite database");
      }

      toast.success(t("resource.reclaim-sqlite-space-success"));
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to compact sqlite database",
        fallbackMessage: t("resource.reclaim-sqlite-space-error"),
      });
    } finally {
      setIsCompactingSQLite(false);
    }
  }, [isAdmin, isCompactingSQLite, t]);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  return (
    <section className="@container w-full max-w-5xl min-h-full flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      {!md && <MobileHeader />}
      <div className="w-full px-4 sm:px-6">
        <div className="w-full border border-border flex flex-col justify-start items-start px-4 py-3 rounded-xl bg-background text-foreground">
          <div className="relative w-full flex flex-row justify-between items-center">
            <p className="py-1 flex flex-row justify-start items-center select-none opacity-80">
              <PaperclipIcon className="w-6 h-auto mr-1 opacity-80" />
              <span className="text-lg">{t("common.attachments")}</span>
            </p>
            <div>
              <div className="flex flex-row items-center gap-2">
                <div className="inline-flex rounded-md border border-border p-1">
                  <Button
                    variant={scope === "workspace" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setScope("workspace")}
                  >
                    {t("common.all")}
                  </Button>
                  <Button
                    variant={scope === "mine" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setScope("mine")}
                  >
                    {t("common.yourself")}
                  </Button>
                </div>
                <div className="relative max-w-32">
                  <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder={t("common.search")} value={searchQuery} onChange={handleSearchChange} />
                </div>
              </div>
            </div>
          </div>
          <div className="w-full flex flex-col justify-start items-start mt-4 mb-6">
            {loadingState.isLoading ? (
              <div className="w-full h-32 flex flex-col justify-center items-center">
                <p className="w-full text-center text-base my-6 mt-8">{t("resource.fetching-data")}</p>
              </div>
            ) : (
              <>
                {filteredAttachments.length === 0 ? (
                  <div className="w-full mt-8 mb-8 flex flex-col justify-center items-center italic">
                    <Empty />
                    <p className="mt-4 text-muted-foreground">{t("message.no-data")}</p>
                  </div>
                ) : (
                  <>
                    <div className={"w-full h-auto px-2 flex flex-col justify-start items-start gap-y-8"}>
                      {Array.from(groupedAttachments.entries()).map(([monthStr, attachments]) => {
                        return (
                          <div key={monthStr} className="w-full flex flex-row justify-start items-start">
                            <div className="w-16 sm:w-24 pt-4 sm:pl-4 flex flex-col justify-start items-start">
                              <span className="text-sm opacity-60">{dayjs(monthStr).year()}</span>
                              <span className="font-medium text-xl">
                                {dayjs(monthStr).toDate().toLocaleString(i18n.language, { month: "short" })}
                              </span>
                            </div>
                            <div className="w-full max-w-[calc(100%-4rem)] sm:max-w-[calc(100%-6rem)] grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                              {attachments.map((attachment) => (
                                <AttachmentItem key={attachment.name} attachment={attachment} />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      <>
                        <Separator />
                        <div className="w-full flex flex-row justify-start items-start">
                          <div className="w-16 sm:w-24 sm:pl-4 flex flex-col justify-start items-start"></div>
                          <div className="w-full max-w-[calc(100%-4rem)] sm:max-w-[calc(100%-6rem)] grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            <div className="col-span-3 sm:col-span-4 md:col-span-5 w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex flex-row items-center gap-2">
                                <span className="text-muted-foreground">{t("resource.unused-resources")}</span>
                                <span className="text-muted-foreground opacity-80">({unusedAttachments.length})</span>
                              </div>
                              {(canDeleteAllUnused || isAdmin) && (
                                <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  {isAdmin && (
                                    <Button
                                      variant="outline"
                                      onClick={handleCompactSQLite}
                                      size="sm"
                                      disabled={isCompactingSQLite}
                                      className="w-full sm:w-auto"
                                    >
                                      {isCompactingSQLite ? t("resource.reclaim-sqlite-space-loading") : t("resource.reclaim-sqlite-space")}
                                    </Button>
                                  )}
                                  {canDeleteAllUnused && (
                                    <Button
                                      variant="destructive"
                                      onClick={() => deleteUnusedAttachmentsDialog.open()}
                                      size="sm"
                                      className="w-full sm:w-auto"
                                    >
                                      <Trash />
                                      {t("resource.delete-all-unused")}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            {unusedAttachments.map((attachment) => (
                              <AttachmentItem key={attachment.name} attachment={attachment} />
                            ))}
                            {unusedAttachments.length === 0 && (
                              <div className="col-span-3 sm:col-span-4 md:col-span-5 text-sm text-muted-foreground italic">
                                {t("resource.no-unused-resources")}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    </div>
                    {nextPageToken && (
                      <div className="w-full flex flex-row justify-center items-center mt-4">
                        <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
                          {isLoadingMore ? t("resource.fetching-data") : t("memo.load-more")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteUnusedAttachmentsDialog.isOpen}
        onOpenChange={deleteUnusedAttachmentsDialog.setOpen}
        title={t("resource.delete-all-unused-confirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDeleteUnusedAttachments}
        confirmVariant="destructive"
      />
    </section>
  );
};

export default Attachments;
