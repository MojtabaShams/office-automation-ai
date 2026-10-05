"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Download,
  FileText,
  ImagePlus,
  MessageCircle,
  Paperclip,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import ConfirmModal from "../../components/ConfirmModal";
import { initialEmployees, type Employee } from "../lib/mock-employees";
import {
  ALL_EMPLOYEES_CONVERSATION_ID,
  type ChatAttachment,
  type ChatMessage,
  loadChatMessages,
  saveChatMessages,
} from "../lib/messaging";

function directConversationId(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
}

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messagePreview(message: ChatMessage | undefined, people: Employee[]) {
  if (!message) return "هنوز پیامی ارسال نشده";
  const sender = people.find((person) => person.id === message.senderId)?.fullName ?? "کارمند";
  const content = message.text || (message.attachments.length ? "فایل پیوست" : "");
  return `${sender}: ${content}`;
}

function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState("");
  const isImage = attachment.type.startsWith("image/");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);

  if (isImage && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block max-w-xs overflow-hidden rounded-xl border border-black/10"
      >
        <Image
          src={url}
          alt={attachment.name}
          width={320}
          height={220}
          unoptimized
          className="max-h-56 w-auto max-w-full object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={url || undefined}
      download={attachment.name}
      className="mt-2 flex max-w-xs items-center gap-2 rounded-xl border border-current/10 bg-black/[0.04] px-3 py-2 text-xs"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
  );
}

export default function MessagesPage() {
  const { isDarkMode } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const currentUserId = initialEmployees[0]?.id ?? "";
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const activePeer = initialEmployees.find((employee) => employee.id === activePeerId);
  const activeConversationId = activePeer
    ? directConversationId(currentUserId, activePeer.id)
    : ALL_EMPLOYEES_CONVERSATION_ID;
  const activeMessages = useMemo(
    () =>
      messages
        .filter((message) => message.conversationId === activeConversationId)
        .sort((first, second) => first.sentAt.localeCompare(second.sentAt)),
    [messages, activeConversationId]
  );

  const t = isDarkMode
    ? {
        shell: "border-white/10 bg-[#122925]",
        sidebar: "bg-[#17332f]",
        surface: "border-white/[0.08] bg-white/[0.035]",
        input: "border-white/10 bg-black/15 text-white placeholder:text-white/35",
        text: "text-white",
        sub: "text-white/50",
        hover: "hover:bg-white/[0.06]",
        active: "bg-[#15554f]/30",
        bubbleMine: "bg-[#15554f] text-white",
        bubbleOther: "bg-[#203b39] text-white",
        messageMetaOwn: "text-white/75",
        composer: "border-white/10 bg-[#102623]",
        badge: "bg-[#15554f] text-white",
      }
    : {
        shell: "border-[#d5dad4] bg-white",
        sidebar: "bg-[#f1f2ee]",
        surface: "border-[#d5dad4] bg-[#f6f7f4]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        hover: "hover:bg-[#edf0eb]",
        active: "bg-[#e2eee8]",
        bubbleMine: "bg-[#dcece3] text-[#28443d]",
        bubbleOther: "bg-white text-[#28443d]",
        messageMetaOwn: "text-[#50685f]",
        composer: "border-[#d5dad4] bg-[#f1f2ee]",
        badge: "bg-[#15554f] text-white",
      };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const savedMessages = await loadChatMessages();
        if (cancelled) return;
        messagesRef.current = savedMessages;
        setMessages(savedMessages);
      } catch (error) {
        if (!cancelled) {
          console.error("بارگذاری پیام‌ها ناموفق بود:", error);
          setStorageError("بارگذاری پیام‌ها انجام نشد. ممکن است ذخیره‌سازی مرورگر در دسترس نباشد.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitMessages = async (update: (current: ChatMessage[]) => ChatMessage[]) => {
    const next = update(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
    try {
      await saveChatMessages(next);
      setStorageError("");
    } catch (error) {
      console.error("ذخیره پیام ناموفق بود:", error);
      setStorageError("ذخیره‌سازی پیام یا فایل ناموفق بود. فضای مرورگر را بررسی کنید.");
    }
  };

  useEffect(() => {
    if (!ready) return;
    const incoming = messagesRef.current.filter(
      (message) =>
        message.conversationId === activeConversationId &&
        message.senderId !== currentUserId &&
        !message.readBy.includes(currentUserId)
    );
    if (incoming.length === 0) return;
    const incomingIds = new Set(incoming.map((message) => message.id));
    void commitMessages((current) =>
      current.map((message) =>
        incomingIds.has(message.id)
          ? { ...message, readBy: [...message.readBy, currentUserId] }
          : message
      )
    );
  }, [activeConversationId, currentUserId, ready]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [activeConversationId, activeMessages.length]);

  const lastMessageByConversation = useMemo(() => {
    const lastByConversation = new Map<string, ChatMessage>();
    messages.forEach((message) => {
      const previous = lastByConversation.get(message.conversationId);
      if (!previous || message.sentAt > previous.sentAt) {
        lastByConversation.set(message.conversationId, message);
      }
    });
    return lastByConversation;
  }, [messages]);

  const members = useMemo(
    () =>
      initialEmployees
        .filter(
          (employee) =>
            employee.id !== currentUserId &&
            employee.fullName.toLowerCase().includes(memberQuery.trim().toLowerCase())
        )
        .sort((first, second) => {
          const firstMessage = lastMessageByConversation.get(
            directConversationId(currentUserId, first.id)
          );
          const secondMessage = lastMessageByConversation.get(
            directConversationId(currentUserId, second.id)
          );
          return (secondMessage?.sentAt ?? "").localeCompare(firstMessage?.sentAt ?? "");
        }),
    [currentUserId, lastMessageByConversation, memberQuery]
  );

  const unreadCount = (conversationId: string) =>
    messages.filter(
      (message) =>
        message.conversationId === conversationId &&
        message.senderId !== currentUserId &&
        !message.readBy.includes(currentUserId)
    ).length;

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) return;

    const attachments: ChatAttachment[] = pendingFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      blob: file,
    }));
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      senderId: currentUserId,
      text,
      attachments,
      sentAt: new Date().toISOString(),
      readBy: [currentUserId],
    };
    await commitMessages((current) => [...current, message]);
    setDraft("");
    setPendingFiles([]);
    if (composerRef.current) {
      composerRef.current.style.height = "auto";
      composerRef.current.style.overflowY = "hidden";
    }
  };

  const saveEdit = async (message: ChatMessage) => {
    const text = editDraft.trim();
    if (!text && message.attachments.length === 0) return;
    await commitMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, text, editedAt: new Date().toISOString() } : item
      )
    );
    setEditingId(null);
    setEditDraft("");
  };

  const deleteMessage = async (messageId: string) => {
    await commitMessages((current) => current.filter((message) => message.id !== messageId));
    setDeleteMessageId(null);
  };

  const chooseConversation = (peerId: string | null) => {
    setActivePeerId(peerId);
    setShowConversation(true);
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) setPendingFiles((current) => [...current, ...files]);
    event.target.value = "";
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const unreadGroupCount = unreadCount(ALL_EMPLOYEES_CONVERSATION_ID);

  return (
    <div className={`flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col ${t.text}`}>
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-7 w-7 text-[#15554f]" />
        <div>
          <h1 className="text-xl font-black">پیام‌ها</h1>
          <p className={`mt-0.5 text-xs ${t.sub}`}>گفتگوی گروهی کارمندان و پیام خصوصی</p>
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 overflow-hidden rounded-2xl border shadow-sm ${t.shell}`}>
        <aside
          className={`w-full shrink-0 flex-col border-l border-current/10 sm:w-72 lg:w-80 ${
            showConversation ? "hidden sm:flex" : "flex"
          } ${t.sidebar}`}
        >
          <div className="border-b border-current/10 p-4">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${t.input}`}>
              <Search className={`h-4 w-4 shrink-0 ${t.sub}`} />
              <input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="جستجو بین اعضا..."
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                aria-label="جستجو بین اعضا"
              />
              {memberQuery && (
                <button
                  type="button"
                  aria-label="پاک کردن جستجوی اعضا"
                  onClick={() => setMemberQuery("")}
                  className={t.sub}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => chooseConversation(null)}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-right transition-colors ${
                !activePeerId ? t.active : t.hover
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#287267] to-[#174f49] text-white">
                <UsersRound className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">گروه همه کارمندان</span>
                  {unreadGroupCount > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${t.badge}`}>
                      {unreadGroupCount}
                    </span>
                  )}
                </span>
                <span className={`mt-1 block truncate text-[0.68rem] ${t.sub}`}>
                  {messagePreview(lastMessageByConversation.get(ALL_EMPLOYEES_CONVERSATION_ID), initialEmployees)}
                </span>
              </span>
            </button>

            <div className={`my-2 flex items-center gap-2 px-2 text-[0.65rem] font-medium ${t.sub}`}>
              <span className="h-px flex-1 bg-current/10" />
              پیام خصوصی
              <span className="h-px flex-1 bg-current/10" />
            </div>

            {members.map((member) => {
              const conversationId = directConversationId(currentUserId, member.id);
              const lastMessage = lastMessageByConversation.get(conversationId);
              const isActive = activePeerId === member.id;
              const unread = unreadCount(conversationId);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => chooseConversation(member.id)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-right transition-colors ${
                    isActive ? t.active : t.hover
                  }`}
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#15554f]/15 text-sm font-bold text-[#15554f]">
                    {initials(member.fullName)}
                    <span
                      className={`absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 ${
                        isDarkMode ? "border-[#172f38]" : "border-[#f1f2ee]"
                      } ${member.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{member.fullName}</span>
                      {unread > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${t.badge}`}>
                          {unread}
                        </span>
                      )}
                    </span>
                    <span className={`mt-1 block truncate text-[0.68rem] ${t.sub}`}>
                      {messagePreview(lastMessage, initialEmployees)}
                    </span>
                  </span>
                </button>
              );
            })}
            {members.length === 0 && (
              <p className={`px-3 py-8 text-center text-xs ${t.sub}`}>عضوی پیدا نشد.</p>
            )}
          </div>
          <div className={`border-t border-current/10 p-3 text-[0.65rem] leading-5 ${t.sub}`}>
            پیام‌ها و فایل‌ها فقط در همین مرورگر ذخیره می‌شوند.
          </div>
        </aside>

        <section
          className={`min-w-0 flex-1 flex-col ${
            showConversation ? "flex" : "hidden sm:flex"
          }`}
        >
          <header className={`flex items-center gap-3 border-b border-current/10 px-4 py-3 ${t.surface}`}>
            <button
              type="button"
              onClick={() => setShowConversation(false)}
              aria-label="بازگشت به فهرست گفتگوها"
              className={`rounded-lg p-2 sm:hidden ${t.hover}`}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#287267] to-[#174f49] text-white">
              {activePeer ? initials(activePeer.fullName) : <UsersRound className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold">
                {activePeer?.fullName ?? "گروه همه کارمندان"}
              </h2>
              <p className={`mt-0.5 text-[0.68rem] ${t.sub}`}>
                {activePeer
                  ? activePeer.status === "active"
                    ? "عضو فعال"
                    : "عضو غیرفعال"
                  : `${initialEmployees.length} عضو · گفتگوی مشترک`}
              </p>
            </div>
            <span title="گفتگوها در این مرورگر ذخیره می‌شوند" className={t.sub}>
              <ShieldCheck className="h-4 w-4" />
            </span>
          </header>

          {storageError && (
            <div
              role="alert"
              className="mx-4 mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600"
            >
              {storageError}
            </div>
          )}

          <div
            ref={messageListRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-5"
          >
            {!ready && (
              <p className={`m-auto text-sm ${t.sub}`}>در حال بارگذاری پیام‌ها...</p>
            )}
            {ready && activeMessages.length === 0 && (
              <div className={`m-auto max-w-xs text-center ${t.sub}`}>
                <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#15554f]/10 text-[#15554f]">
                  <MessageCircle className="h-6 w-6" />
                </span>
                <p className={`text-sm font-semibold ${t.text}`}>گفتگو را شروع کنید</p>
                <p className="mt-1 text-xs leading-5">
                  اولین پیام یا فایل را برای {activePeer?.fullName ?? "همه کارمندان"} بفرستید.
                </p>
              </div>
            )}
            {activeMessages.map((message) => {
              const ownMessage = message.senderId === currentUserId;
              const sender = initialEmployees.find((employee) => employee.id === message.senderId);
              const isRead = activePeer
                ? message.readBy.includes(activePeer.id)
                : message.readBy.some((readerId) => readerId !== message.senderId);
              return (
                <div
                  key={message.id}
                  className={`group flex ${ownMessage ? "justify-start" : "justify-end"}`}
                >
                  <article
                    className={`max-w-[min(88%,38rem)] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      ownMessage ? `${t.bubbleMine} rounded-tr-md` : `${t.bubbleOther} rounded-tl-md`
                    }`}
                  >
                    {!ownMessage && !activePeer && (
                      <p className="mb-1 text-[0.68rem] font-bold text-[#276e63]">
                        {sender?.fullName ?? "کارمند"}
                      </p>
                    )}
                    {editingId === message.id ? (
                      <div className="min-w-56 space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          rows={2}
                          className={`w-full resize-y rounded-lg border px-2.5 py-2 text-xs outline-none ${t.input}`}
                          aria-label="ویرایش متن پیام"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg px-2 py-1 text-[0.68rem] opacity-70"
                          >
                            انصراف
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEdit(message)}
                            className="rounded-lg bg-[#15554f] px-2.5 py-1 text-[0.68rem] text-white"
                          >
                            ذخیره
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.text && (
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">
                            {message.text}
                          </p>
                        )}
                        {message.attachments.map((attachment) => (
                          <AttachmentCard key={attachment.id} attachment={attachment} />
                        ))}
                      </>
                    )}
                    <div
                      className={`mt-1.5 flex items-center gap-1.5 text-[0.62rem] ${
                        ownMessage ? t.messageMetaOwn : t.sub
                      }`}
                    >
                      <time dateTime={message.sentAt}>{formatMessageDate(message.sentAt)}</time>
                      {message.editedAt && <span>ویرایش‌شده</span>}
                      {ownMessage &&
                        (isRead ? (
                          <CheckCheck
                            className="h-3.5 w-3.5 text-sky-300"
                            aria-label="دیده‌شده"
                          />
                        ) : (
                          <Check
                            className="h-3.5 w-3.5"
                            aria-label="ارسال‌شده"
                          />
                        ))}
                    </div>
                    {ownMessage && editingId !== message.id && (
                      <div className="mt-1 flex justify-end gap-1 opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        {message.text && (
                          <button
                            type="button"
                            aria-label="ویرایش پیام"
                            onClick={() => {
                              setEditingId(message.id);
                              setEditDraft(message.text);
                            }}
                            className="rounded-md p-1 hover:bg-black/10"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="درخواست حذف پیام"
                          onClick={() => setDeleteMessageId(message.id)}
                          className="rounded-md p-1 hover:bg-rose-500/15 hover:text-rose-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </article>
                </div>
              );
            })}
            <div />
          </div>

          <div className={`border-t p-3 sm:p-4 ${t.composer}`}>
            {pendingFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingFiles.map((file, index) => (
                  <span
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className={`flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[0.68rem] ${t.surface}`}
                  >
                    {file.type.startsWith("image/") ? (
                      <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="max-w-48 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`حذف فایل ${file.name}`}
                      onClick={() =>
                        setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFiles}
                className="hidden"
                aria-label="انتخاب فایل برای ارسال"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="افزودن عکس یا فایل"
                className={`mb-0.5 rounded-xl p-2.5 transition-colors ${t.sub} ${t.hover}`}
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  event.target.style.height = "auto";
                  const height = Math.min(event.target.scrollHeight, 144);
                  event.target.style.height = `${height}px`;
                  event.target.style.overflowY =
                    event.target.scrollHeight > height ? "auto" : "hidden";
                }}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                placeholder="پیام خود را بنویسید..."
                className={`chat-message-composer max-h-36 min-h-11 flex-1 resize-none overflow-y-auto rounded-2xl border px-4 py-3 text-sm outline-none focus:border-[#15554f] ${t.input}`}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!draft.trim() && pendingFiles.length === 0}
                aria-label="ارسال پیام"
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#15554f] text-white transition hover:bg-[#246b61] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className={`mt-1.5 pr-12 text-[0.62rem] ${t.sub}`}>
              Enter برای ارسال · Shift+Enter برای خط جدید
            </p>
          </div>
        </section>
      </div>
      <ConfirmModal
        open={deleteMessageId !== null}
        onClose={() => setDeleteMessageId(null)}
        onConfirm={() => {
          if (deleteMessageId) void deleteMessage(deleteMessageId);
        }}
        title="حذف پیام"
        message="آیا از حذف این پیام مطمئن هستید؟ این کار قابل بازگشت نیست."
        confirmLabel="حذف پیام"
        danger
      />
    </div>
  );
}
