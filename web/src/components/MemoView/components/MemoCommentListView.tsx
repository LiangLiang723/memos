import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, PaperclipIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MemoContent from "@/components/MemoContent";
import UserAvatar from "@/components/UserAvatar";
import { useMemoComments } from "@/hooks/useMemoQueries";
import { useUser } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { useMemoViewContext, useMemoViewDerived } from "../MemoViewContext";
import { AttachmentList } from "./metadata";

const SubCommentList = ({ parentName }: { parentName: string }) => {
  const { data } = useMemoComments(parentName);
  const comments = data?.memos ?? [];
  if (comments.length === 0) return null;

  const sorted = [...comments].sort((a, b) => Number(a.createTime?.seconds || 0) - Number(b.createTime?.seconds || 0));

  return (
    <div className="flex flex-col gap-2 mt-2">
      {sorted.map((c) => (
        <SubCommentItem key={c.name} comment={c} />
      ))}
    </div>
  );
};

const SubCommentItem = ({ comment }: { comment: Memo }) => {
  const creator = useUser(comment.creator).data;
  const navigate = useNavigate();
  const createTime = comment.createTime ? timestampDate(comment.createTime) : new Date();

  const displayName = creator?.nickname || creator?.displayName || creator?.username;

  return (
    <div
      className="flex gap-2 w-full cursor-pointer group bg-muted/30 border border-border/50 rounded-lg p-2 shadow-sm transition-all hover:shadow-md"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${comment.name}`);
      }}
    >
      <UserAvatar className="w-5 h-5 rounded-md shrink-0 mt-0.5" avatarUrl={creator?.avatarUrl} />
      <div className="flex flex-col w-full min-w-0">
        <div className="flex items-center gap-2 opacity-80">
          <span className="text-[13px] font-semibold text-foreground">{displayName}</span>
          <span className="text-[11px] text-muted-foreground">{dayjs(createTime).format("MM-DD HH:mm")}</span>
        </div>
        <div className="opacity-90 text-[13px] leading-snug">
          <MemoContent content={comment.content} compact={true} />
        </div>
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-1 w-full max-w-xs">
            <AttachmentList attachments={comment.attachments} />
          </div>
        )}
      </div>
    </div>
  );
};


const CommentItem = ({ comment, collapsed }: { comment: Memo; collapsed: boolean }) => {
  const creator = useUser(comment.creator).data;
  const navigate = useNavigate();

  const handleGotoDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/${comment.name}`);
  };

  const createTime = comment.createTime ? timestampDate(comment.createTime) : new Date();
  const displayName = creator?.nickname || creator?.displayName || creator?.username || "Unknown";

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2.5 mx-2 my-1 bg-card border border-border/40 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={handleGotoDetail}>
        <UserAvatar className="w-5 h-5 rounded-md shrink-0" avatarUrl={creator?.avatarUrl} />
        <div className="flex-1 truncate opacity-80 flex items-center gap-1">
          <span className="text-[14px] font-medium text-foreground shrink-0">{displayName}:</span>
          <span className="truncate text-[13px]">{comment.snippet || comment.content}</span>
        </div>
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0 text-[11px] text-muted-foreground opacity-80 bg-muted/50 px-1.5 py-0.5 rounded">
            <PaperclipIcon className="w-3 h-3" />
            <span>{comment.attachments.length}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 p-3 mx-2 my-1.5 bg-card border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={handleGotoDetail}>
      <div className="shrink-0">
        <Link to={`/u/${encodeURIComponent(creator?.username || "")}`} onClick={(e) => e.stopPropagation()}>
          <UserAvatar className="w-8 h-8 rounded-lg shrink-0" avatarUrl={creator?.avatarUrl} />
        </Link>
      </div>

      <div className="flex flex-col w-full min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[14px] font-medium text-foreground/90 hover:text-primary transition-colors">{displayName}</span>
          <span className="text-[12px] text-muted-foreground/60">{dayjs(createTime).format("MM-DD HH:mm")}</span>
        </div>

        <div className="text-[14px] text-foreground/90 mb-1 leading-relaxed">
          <MemoContent content={comment.content} compact={true} />
        </div>

        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-1 w-full max-w-sm">
            <AttachmentList attachments={comment.attachments} />
          </div>
        )}

        <SubCommentList parentName={comment.name} />
      </div>
    </div>
  );
};

const MemoCommentListView: React.FC = () => {
  const { memo } = useMemoViewContext();
  const { isInMemoDetailPage, commentAmount } = useMemoViewDerived();
  const { userGeneralSetting } = useAuth();
  const t = useTranslate();
  const defaultExpanded = userGeneralSetting?.commentDefaultVisibility === "EXPANDED";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const { data } = useMemoComments(memo.name, { enabled: !isInMemoDetailPage && commentAmount > 0 });
  const comments = data?.memos ?? [];

  if (isInMemoDetailPage || commentAmount === 0) {
    return null;
  }

  const sortedComments = [...comments].sort((a, b) => Number(a.createTime?.seconds || 0) - Number(b.createTime?.seconds || 0));

  const displayedComments = isExpanded ? sortedComments : sortedComments.slice(0, 3);

  return (
    <div className="w-full mt-1 border border-border/60 rounded-lg flex flex-col gap-0 overflow-hidden bg-background shadow-sm transition-all">
      <div 
        className="flex items-center justify-between px-4 py-2 bg-transparent border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground group">
          {t("memo.comment.self")} {commentAmount > 1 ? `(${commentAmount})` : ""}
          <div className="p-0.5 rounded-full group-hover:bg-background transition-colors ml-1">
            {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </div>
        </div>
        <Link
          to={`/${memo.name}#comments`}
          className="flex items-center gap-0.5 text-[13px] text-muted-foreground/80 hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {t("memo.view-all")}
          <ArrowUpRightIcon className="w-3 h-3" />
        </Link>
      </div>
      <div className={cn("flex flex-col bg-transparent", isExpanded ? "gap-0 py-1" : "gap-0 py-1")}>
        {displayedComments.map((comment) => (
          <CommentItem key={comment.name} comment={comment} collapsed={!isExpanded} />
        ))}
      </div>
    </div>
  );
};

export default MemoCommentListView;
