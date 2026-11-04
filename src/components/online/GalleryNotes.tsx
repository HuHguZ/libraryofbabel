"use client";

import { useEffect } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { chunkKeyOf, type Cell } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { noteHref } from "./teleport";

/** The notes of the visitor's gallery, newest first. */
export default function GalleryNotes({ cell }: { cell: Cell }) {
  const t = useTranslations("Notes");
  const router = useRouter();
  const online = useOnlineStore();
  const you = useOnlineSelector((s) => s.you?.id);
  const admin = useOnlineSelector((s) => s.admin);
  useOnlineSelector((s) => s.notesVersion);
  useEffect(() => online.watch([chunkKeyOf(cell)]), [online, cell]);
  const notes = online.notesAt(cell);
  if (notes.length === 0) return null;
  return (
    <Box p={3} borderRadius="8px" bg="rgba(8,8,15,0.8)" fontFamily="var(--font-jetbrains), monospace" fontSize="11px" maxH="30vh" overflowY="auto" pointerEvents="auto" w="min(340px, 90vw)">
      <Text color="dark.300" mb={2}>
        {t("title", { count: notes.length })}
      </Text>
      {notes.map((n) => (
        <Box key={n.id} mb={2}>
          <Flex gap={2} align="baseline">
            <Text color={n.color}>{n.nick}</Text>
            {n.anchor && (
              <chakra.button color="brand.300" cursor="pointer" onClick={() => router.push(noteHref(n))}>
                {t("onPage", { page: n.anchor.page })}
              </chakra.button>
            )}
            {(n.author === you || (admin && !n.anchor)) && (
              <chakra.button ml="auto" color="dark.400" cursor="pointer" onClick={() => online.send({ type: "forget", kind: "note", id: n.id })}>
                {t("forget")}
              </chakra.button>
            )}
          </Flex>
          <Text color="dark.50" wordBreak="break-word">
            {n.text || (n.anchor ? t("highlight", { count: n.anchor.end - n.anchor.start }) : "")}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
