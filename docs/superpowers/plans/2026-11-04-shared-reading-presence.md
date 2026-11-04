# Visible shared reading

User intent: nearby players visibly take a volume, place it on a reading desk, turn its pages and look down at it. Other readers can join them. Joining opens the current book/page and then leaves each reader independent (confirmed in chat). A crowded map must remain usable. The user also requested connection notices, an obvious nickname editor, readable closed chat, live unsaved selections and the actual magnifying-glass model showing the same examined text and zoom to observers.

Reuse the existing guest identity, pose view/book/page fields, reader page endpoint, book flight timelines and DeskBook renderer. No additional protocol stream or dependencies for remote reading. Ephemeral reading metadata travels with the existing ten-Hz pose stream and never writes drafts to the database. Sample existing pose tracks five times a second; change React state only when a reading descriptor changes. Fetch only the pages currently shown by a nearby remote book, abort obsolete fetches, and keep a bounded content cache.

Rendering policy: only nearby readers receive a skinned avatar (at most 24); full remote books are limited to eight, at most two per desk. Stable identity ordering gives coincident readers separate places around a desk. A nearby book label lists its owner/page and offers Join. Other readers remain available in the complete roster and grouped map. Observer books have no OrbitControls or page event handlers, and cannot alter the local camera or local reader controls.

Remote books reuse the shelf-to-desk and return animations, with page changes driving the existing turning leaves. Shelf gaps follow visible remote books. On reconnect, a snapshot already reading starts on the desk; an observed transition into reading animates the take. Disconnects, gallery changes, rapid book switches and page changes cancel/replace obsolete transitions without leaking resources.

Live highlights use instanced page bands rather than redrawing large text textures for every draft update. Shared loupes reuse the original GLTF model and glass shader. The owner publishes a page-UV homography for the examined crop, including camera perspective and magnification. Observers sample their matching page texture with that transform; their own camera cannot shift the examined text. This also removes additional whole-scene rendering passes for peer loupes. Protocol validation bounds the optional matrix and existing UV/power fields.

## Work and verification

- [x] Reproduce and fix the avatar mixer cache crash under StrictMode. Add a regression with real Three.js actions and model refresh; verify two live clients.
- [x] Add bounded nearby/desk placement helpers and tests with crowded, reordered and distant players.
- [x] Render actual remote book flights and page turns; orient readers toward their books and handle duplicate table use.
- [x] Add direct Join actions, retaining independent page navigation.
- [x] Integrate map clustering, profile controls, readable chat and first/last-session system notices from independent agents.
- [x] Share unsaved selections and their removal without database writes; keep saved highlights owner-controlled.
- [x] Verify the actual shared loupe model and exact examined crop in two browser clients.
- [x] Run full tests against an isolated database, lint, typecheck and build; verify live observers, reader transitions and crowd bounds.
- [x] Review the combined change and correct page-hit ownership, returning-book desk limits and skeleton cleanup.
- [ ] Update the native Full HD demo, commit/push and leave local services running.

Hardware performance claims are limited to measured browser checks; no public deployment or sustained real-user load is implied.

Verified on 2026-11-04: 52 test files / 367 tests pass, including PostgreSQL/WebSocket integration against an isolated database; lint, typecheck and production build pass. Two independent browser guests confirmed take/page motion, independent Join navigation, live draft replacement/removal, matching lens matrices and text, and system join/leave messages. A real oblique-camera regression also caught and fixed non-canonical floating-point matrix normalization. Peer loupes do not include separate annotation meshes or scenery beyond the source page edge.
