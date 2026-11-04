"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { isTypingTarget } from "@/components/explore/GalleryControls";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { TEXT_LIMIT, cleanText, type SharedPlace } from "@/lib/online/protocol";
import { cellKey } from "@/lib/world";
import { rememberAdmin, useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { viewOf } from "./presence";
import { sharedPlaceHref } from "./teleport";

const mono = "var(--font-jetbrains), monospace";
/** Closed, the panel shows lines younger than this (ms). */
const FADE = 10_000;
const SHOWN = 8;

/** The place the visitor is at, as a chip for a message. */
function placeHere(stage: ReturnType<typeof useStageStore>): SharedPlace | null {
  const { place, view, desk } = stage.getSnapshot();
  const pose = stage.commands.visitorPose?.();
  if (!place || !view || !pose) return null;
  const shared: SharedPlace = { cell: cellKey(place.cell), view: viewOf(view, pose.yaw, desk?.spread ?? 0) };
  return view.kind === "desk" && view.mode === "read" && desk?.mark ? { ...shared, fragment: desk.mark } : shared;
}

/** One chat for everyone in this Library: T to write, Enter to send, Esc to close; `/admin <token>` to moderate. */
export default function ChatPanel() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const online = useOnlineStore();
  const stage = useStageStore();
  const status = useOnlineSelector((s) => s.status);
  const messages = useOnlineSelector((s) => s.messages);
  const you = useOnlineSelector((s) => s.you);
  const admin = useOnlineSelector((s) => s.admin);
  const refused = useOnlineSelector((s) => s.refused);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [place, setPlace] = useState<SharedPlace | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => ({ wall: Date.now(), mono: performance.now() }));
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  // T opens the input, wherever the mouse is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.code !== "KeyT") return;
      e.preventDefault();
      stage.commands.release?.();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!open || status !== "online") following.current = true;
    else if (following.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [open, messages, status]);
  // Closed, old lines fade: re-render once a second while any line is still young.
  useEffect(() => {
    const timer = setInterval(() => setNow({ wall: Date.now(), mono: performance.now() }), 1000);
    return () => clearInterval(timer);
  }, []);

  if (status !== "online" || !you) return null;

  const send = () => {
    const command = /^\/admin(?:\s+(\S+))?$/.exec(text.trim());
    if (command) {
      rememberAdmin(command[1]);
      setNote(command[1] ? t("adminOn") : t("adminOff"));
      setText("");
      online.reconnect();
      return;
    }
    const clean = cleanText(text);
    if (!clean) return setNote(t("length"));
    online.send(place ? { type: "chat", text: clean, place } : { type: "chat", text: clean });
    setText("");
    setPlace(null);
  };

  const shown = open ? messages : messages.filter((m) => now.wall - Date.parse(m.at) < FADE).slice(-SHOWN);
  const refusal = refused && now.mono - refused.at < 4000 ? t(refused.reason as "rate" | "length" | "banned" | "invalid") : null;

  return (
    <Box position="absolute" left={{ base: 3, md: 6 }} bottom={{ base: 32, md: 24 }} zIndex={6} w="min(420px, calc(100% - 24px))" fontFamily={mono} fontSize="12px" pointerEvents="none">
      <Box ref={history} onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        following.current = scrollHeight - scrollTop - clientHeight <= 24;
      }} maxH={open ? "40vh" : "none"} overflowY={open ? "auto" : "visible"} pointerEvents={open ? "auto" : "none"} bg={open ? "rgba(8,8,15,0.8)" : "transparent"} borderRadius="8px" p={open ? 2 : 0}>
        {shown.map((m) => (
          <Flex key={m.id} gap={2} py="2px" align="baseline" textShadow="0 0 4px #000">
            <Text as="span" color={m.color} flex="none">
              {m.nick}
            </Text>
            <Text as="span" color="dark.50" wordBreak="break-word">
              {m.text}
              {m.place && (
                <chakra.button ml={2} color="brand.300" cursor="pointer" pointerEvents="auto" onClick={() => router.push(sharedPlaceHref(m.place!))}>
                  [{t("go")}]
                </chakra.button>
              )}
              {open && (m.author === you.id || admin) && (
                <chakra.button ml={2} color="dark.300" cursor="pointer" onClick={() => online.send({ type: "forget", kind: "chat", id: m.id })}>
                  {t("forget")}
                </chakra.button>
              )}
              {open && admin && m.author !== you.id && (
                <chakra.button ml={2} color="red.400" cursor="pointer" title={t("banTitle")} onClick={() => { if (window.confirm(t("banConfirm", { nick: m.nick }))) online.send({ type: "ban", guest: m.author }); }}>
                  {t("ban")}
                </chakra.button>
              )}
            </Text>
          </Flex>
        ))}
      </Box>
      {(refusal || (note && open)) && (
        <Text color="dark.300" mt={1}>
          {refusal || note}
        </Text>
      )}
      {open ? (
        <Flex mt={2} gap={2} pointerEvents="auto">
          <Input
            ref={input}
            size="sm"
            value={text}
            maxLength={TEXT_LIMIT + 50}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            color="parchment.200"
            bg="rgba(7,6,10,0.92)"
            borderColor="brand.300/30"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") { e.preventDefault(); send(); }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <chakra.button color={place ? "brand.300" : "dark.200"} title={t("shareTitle")} cursor="pointer" onClick={() => setPlace(place ? null : placeHere(stage))}>
            {place ? t("shared") : t("share")}
          </chakra.button>
          <chakra.button flexShrink={0} px={2} color="dark.100" aria-label={t("close")} title={t("close")} cursor="pointer" onClick={() => setOpen(false)}>
            ✕
          </chakra.button>
        </Flex>
      ) : (
        <chakra.button color="dark.400" mt={1} pointerEvents="auto" cursor="pointer" onClick={() => { stage.commands.release?.(); setOpen(true); }}>
          {t("open")}
        </chakra.button>
      )}
    </Box>
  );
}
