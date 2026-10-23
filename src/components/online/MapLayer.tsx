"use client";

import { useEffect, useState } from "react";
import { Box, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { isTypingTarget } from "@/components/explore/GalleryControls";
import { useStageSelector, useStageStore } from "@/components/explore/stage/StageProvider";
import LibraryMap from "./LibraryMap";
import { useRouter } from "@/i18n/navigation";
import { isValidHex, MAX_ADDRESS_LENGTH } from "@/lib/library";

/** The minimap in the corner (not while reading: the reader's panel is there) and the full map on M. */
export default function MapLayer() {
  const t = useTranslations("Map");
  const stage = useStageStore();
  const router = useRouter();
  const reading = useStageSelector((s) => s.view?.kind === "desk");
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.defaultPrevented || e.repeat || e.isComposing || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyM") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // An open map needs the mouse.
  useEffect(() => {
    if (open) stage.commands.release?.();
  }, [open, stage]);

  return (
    <>
      {!open && <chakra.button position="absolute" right={{ base: 3, md: 6 }} bottom={{ base: 20, md: 24 }} zIndex={6} color="brand.300" bg="rgba(8,8,15,0.8)" px={3} py={2} borderRadius="8px" cursor="pointer" onClick={() => setOpen(true)}>{t("open")}</chakra.button>}
      {!open && !reading && (
        <Box position="absolute" top={{ base: 24, md: 28 }} right={{ base: 3, md: 6 }} w="180px" h="180px" zIndex={5} borderRadius="8px" overflow="hidden" border="1px solid" borderColor="brand.300/25" display={{ base: "none", md: "block" }}>
          <LibraryMap mode="mini" onExpand={() => setOpen(true)} />
        </Box>
      )}
      {open && (
        <Box position="absolute" inset={0} zIndex={10} bg="rgba(4, 3, 6, 0.94)" display="flex" flexDirection="column">
          <Box display="flex" alignItems="center" justifyContent="space-between" px={6} pt={4} pb={2}>
            <Text fontFamily="var(--font-jetbrains), monospace" fontSize="11px" color="dark.300">{t("title")} · {t("hint")}</Text>
            <chakra.button color="brand.300" cursor="pointer" onClick={() => setOpen(false)}>{t("close")}</chakra.button>
          </Box>
          <chakra.form display="flex" gap={2} px={6} pb={2} onSubmit={(event) => {
            event.preventDefault();
            if (!isValidHex(address.trim())) return;
            setOpen(false);
            router.push(`/explore/wall/1?hex=${address.trim()}`);
          }}>
            <Input size="sm" color="parchment.200" bg="rgba(7,6,10,0.92)" borderColor="brand.300/30" value={address} onChange={(event) => setAddress(event.target.value)} aria-label={t("address")} placeholder={t("address")} maxLength={MAX_ADDRESS_LENGTH} aria-invalid={!!address && !isValidHex(address.trim())} fontFamily="var(--font-jetbrains), monospace" />
            <chakra.button type="submit" disabled={!isValidHex(address.trim())} color="brand.300" cursor="pointer" flexShrink={0}>{t("goHere")}</chakra.button>
          </chakra.form>
          <Box flex="1" minH={0}>
            <LibraryMap mode="full" onClose={() => setOpen(false)} />
          </Box>
        </Box>
      )}
    </>
  );
}
