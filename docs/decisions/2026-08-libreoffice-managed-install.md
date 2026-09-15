# LibreOffice as a required dependency and the document editor

Date: 2026-08-07
Status: accepted

Office downloads the LibreOffice Portable build and spawns it headless to render
layout, convert formats, and export PDF. It also launches it as a normal desktop
app when the user edits a Word, Excel, or PowerPoint file. The Documents tab does
not work without it and says so up front.

## Why LibreOffice at all

We wrote our own docx, xlsx, and pptx editors and they were lossy on purpose.
`docx-adapter.ts` rebuilds every paragraph as a single plain run, `xlsx-adapter.ts`
covers a 40x20 window, and the pptx adapter touches the first two text nodes of a
slide. That is enough for an agent to make a targeted edit and nowhere near enough
for a person to open a file someone else made and work in it.

There is no cheap way to close that gap. Faithful OOXML round-tripping is years of
work, and every month we did not spend on it, the editors would quietly destroy
tables, images, and character formatting on save. Shipping an editor that damages
files is worse than shipping no editor.

## Why it is now required, not optional

The previous version of this decision kept LibreOffice optional and kept our
editors as the only writer. That produced the worst of both: a preview accurate
enough to show users exactly what they were about to lose, a warning banner
explaining that we could not write it back, and two exits that both led away from
the editor we had just built.

Making LibreOffice required collapses that. One program reads and writes the file,
so there is a single answer to "what wrote this" and no save can race a
conversion. The preview stops being an approximation of the editor and becomes the
document. The fidelity scanner, the lossy banner, and the edit-a-copy escape hatch
all became unnecessary and are gone.

Markdown is the exception. It is our format, we do not lose anything writing it,
and LibreOffice has no reason to be involved, so `MarkdownEditor` stays in-app.

## Why the Portable build, not the MSI

The MSI installs into Program Files. That needs UAC, which means an admin prompt in
the middle of what should be a background download, and it rewrites file
associations and registry keys for `docx`, `xlsx`, and `pptx`. Taking over a user's
file associations as a side effect of installing our app is not a trade we get to
make on their behalf.

The PortableApps build takes `/DESTINATION="<dir>" /SILENT` and unpacks into
exactly that directory. Nothing outside it changes, no elevation is needed, and
uninstalling is a directory delete. It lands under `runtimeDir()/libreoffice`, next
to the llama.cpp backends, for the same reason those live there: the app must never
need write access to its own install directory, and a runtime has to survive an app
update.

The cost is size. The asset is about 214MB, which is why the requirement is
enforced at the Documents tab rather than at first launch. Chat, Tasks, Flows, and
the Floor all work without it, so a user who never opens a document never pays for
one.

## Process boundary and licensing

Running `soffice` as a separate process keeps the MPL-2.0 obligation where it
belongs: we invoke a binary the user downloaded from The Document Foundation, we do
not link against it, modify it, or redistribute it. Embedding it as an editing
surface would need either an OLE in-place container or LibreOffice Online, and both
put LibreOffice code inside our process boundary.

Editing therefore means launching LibreOffice detached, so closing Office does not
kill an open editing session.

## Keeping the two windows in sync

LibreOffice writes the file behind our back, so Office watches it. A `fs.watch` on
the open document coalesces the write burst LibreOffice produces on save, then
broadcasts `office:docReloaded`, and the preview re-renders. The renderer also
bumps its reload token on window focus, because file watching is unreliable across
network drives and some sync clients.

The agent's document tools still commit through `docs/session.ts` and the adapters,
and they route through the same broadcast. That path is unchanged: the adapters
were only ever wrong as a user-facing editor, and they are still the right tool for
a scoped, programmatic edit.

## Non-Windows

The silent installer is Windows only. On macOS and Linux, `findLibreOffice()` looks
for a system install and the setup card links to the download page instead of
offering to install. The Documents tab stays gated until one is found.

## Operational notes

- Conversions are serialized. Concurrent `soffice` processes contend for the same
  user profile lock and fail with "already running".
- Cold start is 2 to 4 seconds, so the first preview after opening the app is slow.
  A warm standby instance is deliberately out of scope for now.
- `LIBREOFFICE_ASSET_SHA256` in `libreoffice-install.ts` is unset until the pinned
  asset is verified by hand on Windows. The refresh procedure is in the comment
  above it.
- The `/DESTINATION` and `/SILENT` switches are documented by PortableApps but have
  not been exercised on a clean Windows machine yet. If they fail, the fallback is
  to launch the installer window and let the user confirm the path.
