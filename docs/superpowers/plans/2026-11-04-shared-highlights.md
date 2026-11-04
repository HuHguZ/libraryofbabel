# Shared highlights implementation plan

> For agentic workers: implement inline with test-driven checks and one final independent review. The user subsequently authorised committing and pushing all changes, including a README demo, on 2026-11-04.

**Goal:** Saved book highlights load for every reader of that page, keep their author's chosen colour, allow only their author to change/delete them, and can be shared to chat. Update the Full HD demo afterwards.

**Architecture:** Reuse anchored notes, chunk subscriptions, and note markers. Add a nullable highlight colour to existing note rows; an empty comment represents a saved highlight. Broadcast persisted colour updates. Render all anchored annotations in both the text panel and 3D page, independent of URL fragments. Chat shares reference the stored note ID.

**Tech stack:** Existing Next.js/React, WebSocket, Postgres, Vitest and FFmpeg; no new dependencies.

**Spec:** User request in this chat, 2026-11-04. The user explicitly selected the Save highlight button. Colour changes apply to the selected saved highlight unless the user steers otherwise.

## Constraints and review focus

- Preserve the existing uncommitted chat fixes and next-env.d.ts change; work in the current requested checkout.
- Only the authenticated author can recolour or delete an anchored highlight, including against an admin connection.
- Existing gallery notes and existing links keep working; the migration retains all rows.
- Overlapping highlights must preserve every author's annotation and colour.
- Buffer colour changes during a chunk snapshot so an old read cannot undo a live update.
- Reconnects and plain page URLs must reload highlights from Postgres.
- Capture actual 1920x1080 sources; resize the browser window before each recording and verify with ffprobe.

### Task 1: Persist, authorise and broadcast annotations

Files: protocol.ts/tests, server schema.ts, db.ts/tests, session.ts/tests, limits.ts, onlineStore.ts/tests, teleport.ts/tests.

- [x] Add failing protocol, database and session tests for empty-comment coloured highlights, owner-only recolouring/deletion, snapshot races and canonical chat shares.
- [x] Add Note.highlightColor, paint / share-note requests and painted events; validate colours, IDs and anchors at the wire boundary.
- [x] Add idempotent notes.highlight_color migration, noteById(lang,id) and paintNote(lang,id,author,color); preserve existing data.
- [x] Persist before broadcasting, enforce authorship, and update cached notes on painted events. Share stored anchors through existing chat history with a note ID.
- [x] Run targeted tests, including real Postgres tests.

### Task 2: Render all saved marks

Files: BookPage.tsx/tests, bookPages.ts/tests, stageStore.ts/tests, DeskBook.tsx.

- [x] Write a failing overlap test; verify redraw after a colour change with two live browser guests.
- [x] Split text at saved ranges; blend overlapping washes without losing their records.
- [x] Draw saved washes in the 3D texture and include their ranges/colours in its cache key.
- [x] Run render and stage tests.

### Task 3: Reader controls and sharing

Files: reader route, ReaderTextPanel.tsx/tests, NoteComposer.tsx, GalleryNotes.tsx, messages/en.json and ru.json.

- [x] Watch the reader's gallery directly and filter its anchored notes by book/page.
- [x] Add Save highlight, select saved mark, author-only colour/delete controls and Share to chat. Reuse existing colour picker and note records.
- [x] Opening a saved-note link focuses its current stored mark; ordinary page links show all marks without a query string.
- [x] Run UI tests, the whole suite, lint, typecheck and production build.

### Task 4: Live verification and video

- [x] Use two independent guests: save, plain-page autoload, live recolour, reject foreign edits, reconnect/persistence, and chat navigation.
- [x] Perform one independent final review, resolve material findings and rerun affected checks.
- [x] Record the new workflow in native Full HD and replace the old highlight demo scenes using the existing FFmpeg timeline.
- [x] Verify every source and the final MP4 dimensions/frame rate, decode the final video and inspect scene frames.

## Verification ledger

- 319 tests pass with ONLINE_INTEGRATION=1 and isolated Postgres; lint, typecheck and production build pass.
- Independent review found and resolved live-selection DOM churn, hidden search washes, and a stuck pending-save button. Reader route regression tests cover the selection, pending save and same-page chat navigation.
- Two isolated browser guests verified ordinary-page loading, persisted live repaint in text and 3D, rejected foreign edits, overlapping marks, author deletion, chat navigation, and restore after the WebSocket server restarted. Widths 390 and 500 have no document overflow.
- Updated FFmpeg demo: 156.167 seconds, 1920x1080, 30 fps, H.264 High CRF 14; five new native Full HD sources. Full decode and scene-frame review pass.
- The user subsequently requested commit/push and a README demo. Local Next.js, WebSocket and Postgres services stay running; there is no remote application deployment.
