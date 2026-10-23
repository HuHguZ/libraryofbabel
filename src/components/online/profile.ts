import type { ClientMessage } from "@/lib/online/protocol";

type Profile = Extract<ClientMessage, { type: "profile" }>;
/** Slider edits coalesce; nick and colour share the server's one-update-per-five-seconds bucket. */
export function createProfileQueue(send: (message: Profile) => boolean) {
  let pending: Omit<Profile, "type"> | null = null;
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (!pending) return;
    if (send({ type: "profile", ...pending })) {
      pending = null;
      last = Date.now();
    } else timer = setTimeout(flush, 1000);
  };
  return {
    edit(profile: Omit<Profile, "type">) {
      pending = { ...pending, ...profile };
      clearTimeout(timer);
      timer = setTimeout(flush, Math.max(250, last + 5100 - Date.now()));
    },
    dispose() { clearTimeout(timer); pending = null; },
  };
}
