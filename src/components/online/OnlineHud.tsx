"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import FragmentColorPicker from "@/components/explore/FragmentColorPicker";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { useRouter } from "@/i18n/navigation";
import { placeHref } from "./teleport";
import { cleanNick, type Player } from "@/lib/online/protocol";
import { formatCoordinate, parseCellKey } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { createProfileQueue } from "./profile";

const mono = "var(--font-jetbrains), monospace";

/** "wandering · gallery 3 · floor −2", or what they read. */
function useDoing() {
  const t = useTranslations("Online");
  return (p: Player) => {
    const cell = parseCellKey(p.cell);
    const at = { x: cell ? formatCoordinate(cell.x) : "?", floor: cell ? formatCoordinate(cell.floor) : "?" };
    if (p.view.kind === "walk") return t("walking", at);
    if (p.view.kind === "shelf") return t("atShelf", { ...at, wall: p.view.wall, shelf: p.view.shelf });
    return t("reading", { ...at, wall: p.view.wall, shelf: p.view.shelf, volume: p.view.volume, page: p.view.page });
  };
}

/** Who else is in this Library and what they do; my own name and colour. Plan 3 adds the way to each of them. */
export default function OnlineHud() {
  const t = useTranslations("Online");
  const chat = useTranslations("Chat");
  const router = useRouter();
  const stage = useStageStore();
  const online = useOnlineStore();
  const status = useOnlineSelector((s) => s.status);
  const you = useOnlineSelector((s) => s.you);
  const players = useOnlineSelector((s) => s.players);
  const admin = useOnlineSelector((s) => s.admin);
  const doing = useDoing();
  const [open, setOpen] = useState(false);
  const [nick, setNick] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const profile = useMemo(() => createProfileQueue((message) => {
    if (online.getSnapshot().status !== "online") return false;
    online.send(message);
    return true;
  }), [online]);
  useEffect(() => () => profile.dispose(), [profile]);

  const label = status === "offline" ? t("offline") : status === "connecting" || !you ? t("connecting") : players.size ? t("online", { count: players.size + 1 }) : t("alone");
  const saveNick = () => {
    const clean = cleanNick(nick);
    if (!clean) return;
    profile.edit({ nick: clean });
    setNick(clean);
  };

  return (
    <Box position="absolute" top={{ base: 14, md: 16 }} right={{ base: 3, md: 6 }} zIndex={6} maxW="min(340px, calc(100% - 24px))" fontFamily={mono} fontSize="11px">
      <chakra.button
        onClick={() => { stage.commands.release?.(); setOpen((o) => !o); }}
        aria-expanded={open}
        display="flex"
        alignItems="center"
        gap={2}
        ml="auto"
        px={3}
        py={1.5}
        borderRadius="full"
        bg="rgba(8,8,15,0.72)"
        border="1px solid"
        borderColor="brand.300/30"
        color="dark.100"
        cursor="pointer"
      >
        <Box w="7px" h="7px" borderRadius="full" bg={status === "online" ? "#4f9a5a" : status === "connecting" ? "#c9a227" : "dark.400"} />
        {label}
      </chakra.button>

      {open && status === "online" && you && (
        <Box role="region" aria-label={label} maxH="calc(100dvh - var(--header-h) - 128px)" overflowY="auto" mt={2} p={3} borderRadius="8px" bg="rgba(8,8,15,0.86)" border="1px solid" borderColor="brand.300/20">
          <Flex align="center" gap={2} mb={players.size ? 3 : 0}>
            <FragmentColorPicker color={color ?? you.color} onChange={(next) => { setColor(next); profile.edit({ color: next }); }} />
            <Input
              size="xs"
              color="parchment.200"
              bg="rgba(7,6,10,0.92)"
              borderColor="brand.300/30"
              value={nick ?? you.nick}
              aria-label={t("nick")}
              onChange={(e) => setNick(e.target.value)}
              onBlur={saveNick}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              maxLength={24}
              aria-invalid={nick !== null && cleanNick(nick) === null}
            />
            <Text color="dark.300">{t("you")}</Text>
          </Flex>
          {[...players.values()].map((p) => (
            <Flex key={p.id} gap={2} py={1} align="baseline">
              <Box flex="none" w="8px" h="8px" borderRadius="full" bg={p.color} />
              <Box minW={0} flex={1} overflowWrap="anywhere">
                <Text color="dark.100">{p.nick}</Text>
                <Text color="dark.300">{doing(p)}</Text>
              </Box>
              <chakra.button ml="auto" color="brand.300" cursor="pointer" onClick={() => {
                const cell = parseCellKey(p.cell);
                if (cell) router.push(placeHref(cell, p.view.wall));
              }}>{t("goTo")}</chakra.button>
              {admin && <chakra.button color="red.400" cursor="pointer" onClick={() => {
                if (window.confirm(chat("banConfirm", { nick: p.nick }))) online.send({ type: "ban", guest: p.id });
              }}>{chat("ban")}</chakra.button>}
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}
