"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * Streams Emotion (Chakra) styles into <head> during SSR instead of inline <style> tags
 * in the body, which React 19 refuses to hydrate next to Suspense boundaries.
 */
export default function EmotionRegistry({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "css" });
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: { name: string; isGlobal: boolean }[] = [];
    cache.insert = (...args) => {
      const [selector, serialized] = args;
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push({ name: serialized.name, isGlobal: !selector });
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const prev = inserted;
      inserted = [];
      return prev;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    let styles = "";
    let attribute = cache.key;
    const globals: { name: string; style: string }[] = [];
    for (const { name, isGlobal } of names) {
      const style = cache.inserted[name];
      if (typeof style !== "string") continue;
      if (isGlobal) globals.push({ name, style });
      else {
        styles += style;
        attribute += ` ${name}`;
      }
    }
    return (
      <>
        {globals.map(({ name, style }) => (
          <style key={name} data-emotion={`${cache.key}-global ${name}`} dangerouslySetInnerHTML={{ __html: style }} />
        ))}
        {styles && <style data-emotion={attribute} dangerouslySetInnerHTML={{ __html: styles }} />}
      </>
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
