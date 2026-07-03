import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Activity,
  Bot,
  CheckCheck,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plug,
  Settings,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUser } from "@/auth/hooks";
import { useConfirm } from "@/components/useConfirm";
import { usePendingApprovalCount } from "@/features/approvals/hooks";
import { type ChatRow, useChats, useDeleteChat, useRenameChat } from "@/features/chat/hooks";

import { EntrivesLogo } from "./brand";

const NAV = [
  { to: "/dashboard", label: "Chat", icon: MessageSquarePlus, exact: true },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/approvals", label: "Approvals", icon: CheckCheck },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const STORAGE_KEY = "flowy.sidebar.collapsed";

export function Sidebar() {
  const { data: user } = useUser();
  const { data: chats } = useChats();
  const { data: pendingApprovals } = usePendingApprovalCount();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <aside className={`flowy-sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="flowy-top">
        <Link to="/dashboard" className="flowy-brand" title="Entrives">
          <EntrivesLogo />
          <span className="wm">entrives</span>
        </Link>
        <button
          type="button"
          className="flowy-collapse"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
        </button>
      </div>

      <nav className="flowy-nav">
        {NAV.map(({ to, label, icon: Icon, exact }) => {
          const badge = to === "/approvals" ? (pendingApprovals ?? 0) : 0;
          return (
            <Link
              key={to}
              to={to}
              search={to === "/dashboard" ? { c: undefined } : undefined}
              title={label}
              activeProps={{ className: "active" }}
              activeOptions={exact ? { exact: true } : undefined}
            >
              <Icon className="nav-ico" />
              <span className="nav-label">{label}</span>
              {badge ? <span className="nav-badge">{badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="flowy-recent">
        <div className="flowy-side-label">Recent chats</div>
        {chats && chats.length > 0 ? (
          chats.map((c) => <RecentChatItem key={c.id} chat={c} />)
        ) : (
          <p className="flowy-recent-empty">No chats yet</p>
        )}
      </div>

      <div className="flowy-side-foot">
        <div className="flowy-user">
          <span className="flowy-avatar">{initial}</span>
          <span className="flowy-user-email truncate text-sm">{user?.email ?? "Account"}</span>
        </div>
        <Link to="/auth/logout" className="flowy-signout" title="Sign out">
          Sign out
        </Link>
      </div>
    </aside>
  );
}

function RecentChatItem({ chat }: { chat: ChatRow }) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { c?: string };
  const rename = useRenameChat();
  const del = useDeleteChat();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== chat.title) rename.mutate({ id: chat.id, title: t });
    else setDraft(chat.title);
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Delete chat?",
      description: `“${chat.title}” will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(chat.id);
    if (search?.c === chat.id) void navigate({ to: "/dashboard", search: { c: undefined } });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="flowy-recent-edit"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(chat.title);
            setEditing(false);
          }
        }}
        onBlur={commit}
      />
    );
  }

  return (
    <div className="flowy-recent-row">
      <Link
        to="/dashboard"
        search={{ c: chat.id }}
        className="flowy-recent-item"
        activeProps={{ className: "flowy-recent-item active" }}
        activeOptions={{ includeSearch: true }}
        title={chat.title}
      >
        <span className="truncate">{chat.title}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flowy-recent-menu" aria-label="Chat options">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(chat.title);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => void onDelete()}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </div>
  );
}
