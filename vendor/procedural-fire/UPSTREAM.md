# procedural-fire provenance

- Source: https://github.com/Leonxlnx/procedural-fire
- Commit: `95ab0a9003e20f1b0a5556ac14b401dfa0a37596`
- Retrieved: 2026-10-26
- Copyright (c) 2026 Leon Lin; [MIT license](LICENSE), preserved verbatim.
- Upstream README credits Claude Code (Claude Opus 5.5).

`src/` and `README.md` are unmodified copies at this commit. The upstream
package manifest is not used: the viewer has no runtime npm dependencies.
The repository's LICENSE is MIT (the package manifest's generic ISC field
does not match that file).

`../../lab-fire/main.js` is an adapted copy of `src/main.js`, under the same
MIT terms. Local changes: relative imports to this vendor directory, low
quality by default and fallback for unknown presets, a new page shell with
shared lab navigation and research notes, button-driven ignition and audio,
accessible pause and view-filter controls, keyboard focus guards, and visible
startup/device-loss errors. Removed automatic ignition and the H hide shortcut
so navigation and research stay accessible. Rendering and simulation engines
are unchanged.

The two labs use separate documents so navigating between them unloads the
previous GPU renderer and audio context. All runtime source is served locally;
no upstream iframe or CDN is required. Upstream capture helpers remain in the
adapted entry point for research, but its Node video-rendering tools are not
included or exposed in the page UI.
