"use client";

import { Box, ColorPicker, Flex, HStack, Portal, Text, chakra, parseColor } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { DEFAULT_FRAGMENT_COLOR, FRAGMENT_ALPHA, FRAGMENT_SWATCHES, fragmentWash, parseHexColor } from "@/lib/fragmentColor";

const mono = "var(--font-jetbrains), monospace";
const serif = "var(--font-cormorant), Georgia, serif";

/**
 * The swatch of the fragment colour: a button that opens a colour picker (a saturation / brightness field,
 * a hue slider, ready-made colours and a hex field). Every change applies at once, to the text and the book.
 */
export default function FragmentColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useTranslations("Reader");
  return (
    <ColorPicker.Root
      value={parseColor(color)}
      onValueChange={(e) => {
        const hex = parseHexColor(e.value.toString("hex"));
        if (hex) onChange(hex);
      }}
      positioning={{ placement: "top-start", gutter: 10 }}
      size="xs"
      w="auto"
    >
      <ColorPicker.HiddenInput />
      <ColorPicker.Control>
        <ColorPicker.Trigger
          title={t("fragmentColorTitle")}
          aria-label={t("fragmentColor")}
          p="3px"
          w="22px"
          h="22px"
          minW="22px"
          borderRadius="5px"
          border="1px solid"
          borderColor="brand.300/40"
          bg="rgba(7,6,10,0.55)"
          cursor="pointer"
          transition="all 0.2s ease"
          _hover={{ borderColor: "brand.300/80", boxShadow: "0 0 0 3px rgba(201, 168, 76, 0.15)" }}
          _open={{ borderColor: "brand.300/90", boxShadow: "0 0 0 3px rgba(201, 168, 76, 0.25)" }}
        >
          {/* The wash itself over a scrap of parchment, the way it looks on the page. */}
          <Box w="100%" h="100%" borderRadius="3px" bg="#ede0c0" overflow="hidden">
            <Box w="100%" h="100%" bg={fragmentWash(color, 0.75)} />
          </Box>
        </ColorPicker.Trigger>
      </ColorPicker.Control>
      <Portal>
        <ColorPicker.Positioner>
          <ColorPicker.Content
            w="244px"
            p={3}
            gap={3}
            bg="rgba(12,9,12,0.97)"
            border="1px solid"
            borderColor="brand.300/35"
            borderRadius="6px"
            boxShadow="0 12px 40px rgba(0,0,0,0.6)"
            backdropFilter="blur(12px)"
          >
            <Flex justify="space-between" align="baseline">
              <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.2em" fontFamily={mono}>
                {t("fragmentColor")}
              </Text>
              <chakra.button
                type="button"
                onClick={() => onChange(DEFAULT_FRAGMENT_COLOR)}
                disabled={color === DEFAULT_FRAGMENT_COLOR}
                color="dark.100"
                fontSize="xs"
                fontFamily={serif}
                fontStyle="italic"
                cursor="pointer"
                _hover={{ color: "brand.200" }}
                _disabled={{ opacity: 0.35, cursor: "default", _hover: { color: "dark.100" } }}
              >
                {t("fragmentColorReset")}
              </chakra.button>
            </Flex>

            {/* How the colour looks on the page, with the ink over it. */}
            <Box bg="#ede0c0" borderRadius="4px" px={2.5} py={1.5} fontFamily={mono} fontSize="11px" color="#2a1f0e" lineHeight="1.6">
              {t("fragmentColorSample")}{" "}
              <Box as="span" bg={fragmentWash(color, FRAGMENT_ALPHA.panel)} px="1px">
                {t("fragmentColorSampleMarked")}
              </Box>
            </Box>

            <ColorPicker.Area h="120px" borderRadius="4px" />
            <ColorPicker.ChannelSlider channel="hue">
              <ColorPicker.ChannelSliderTrack borderRadius="full" />
              <ColorPicker.ChannelSliderThumb />
            </ColorPicker.ChannelSlider>

            <ColorPicker.SwatchGroup gap={1.5} flexWrap="wrap">
              {FRAGMENT_SWATCHES.map((swatch) => (
                <ColorPicker.SwatchTrigger key={swatch} value={swatch} title={swatch} cursor="pointer">
                  <ColorPicker.Swatch value={swatch} boxSize="20px" borderRadius="4px" boxShadow={swatch === color ? "0 0 0 2px #07060a, 0 0 0 3px rgba(240, 216, 144, 0.9)" : undefined} />
                </ColorPicker.SwatchTrigger>
              ))}
            </ColorPicker.SwatchGroup>

            <HStack gap={2}>
              <ColorPicker.ValueSwatch boxSize="24px" borderRadius="4px" />
              <ColorPicker.Input
                flex="1"
                h="26px"
                px={2}
                bg="rgba(7,6,10,0.6)"
                border="1px solid"
                borderColor="dark.400/50"
                borderRadius="4px"
                color="parchment.200"
                fontFamily={mono}
                fontSize="xs"
                _focus={{ borderColor: "brand.300/60", outline: "none" }}
              />
            </HStack>
          </ColorPicker.Content>
        </ColorPicker.Positioner>
      </Portal>
    </ColorPicker.Root>
  );
}
