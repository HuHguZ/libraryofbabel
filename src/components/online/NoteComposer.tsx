"use client";

import { useEffect, useState } from "react";
import { Box, Flex, Textarea, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { TEXT_LIMIT, cleanText, type Anchor } from "@/lib/online/protocol";
import { cellKey, type Cell } from "@/lib/world";
import { useOnlineStore } from "./OnlineProvider";
import { useStageStore } from "@/components/explore/stage/StageProvider";

/** Writing a note on a gallery (anchor null) or on a fragment of a page. */
export default function NoteComposer({ cell, anchor, highlightColor, onDone }: { cell: Cell; anchor: Anchor | null; highlightColor?: string; onDone: () => void }) {
  const t = useTranslations("Notes");
  const online = useOnlineStore();
  const stage = useStageStore();
  useEffect(() => { stage.commands.release?.(); }, [stage]);
  const [text, setText] = useState("");
  const clean = cleanText(text);
  const save = () => {
    if (!clean || online.getSnapshot().status !== "online") return;
    online.send({ type: "note", cell: cellKey(cell), anchor, text: clean, ...(highlightColor && { highlightColor }) });
    onDone();
  };
  return (
    <Box p={3} borderRadius="8px" bg="rgba(8,8,15,0.92)" border="1px solid" borderColor="brand.300/30" pointerEvents="auto" w="min(360px, 90vw)">
      <Textarea
        autoFocus
        size="sm"
        color="parchment.200"
        bg="rgba(7,6,10,0.92)"
        borderColor="brand.300/30"
        rows={3}
        value={text}
        maxLength={TEXT_LIMIT}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onDone();
        }}
      />
      <Flex justify="flex-end" gap={3} mt={2} fontSize="12px">
        <chakra.button color="dark.300" cursor="pointer" onClick={onDone}>
          {t("cancel")}
        </chakra.button>
        <chakra.button disabled={!clean} color={clean ? "brand.300" : "dark.400"} cursor={clean ? "pointer" : "default"} onClick={save}>
          {t("save")}
        </chakra.button>
      </Flex>
    </Box>
  );
}
