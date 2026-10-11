<p align="center"><img src="docs/banner.svg" alt="Rudy Metadata Checker — Inspect the traces carried by a file." width="100%"></p>

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Node.js%20%2F%20Discord-55e0b6?style=flat-square&labelColor=101b28" alt="Node.js / Discord">
  <img src="https://img.shields.io/badge/Docs-source_reviewed-55e0b6?style=flat-square&labelColor=101b28" alt="Documentation based on source review">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-55e0b6?style=flat-square&labelColor=101b28" alt="MIT license"></a>
</p>

<p align="center"><strong>Inspect the traces carried by a file.</strong></p>

<p align="center"><a href="#overview">Overview</a> · <a href="#capabilities">Capabilities</a> · <a href="#quick-start">Quick start</a> · <a href="#implementation-notes">Implementation notes</a></p>

---

## Overview

A Discord `/metadata` bot that downloads an attachment, attempts format-specific metadata extraction and returns an embed. It supports image EXIF attempts, PDF document information and a limited DOCX file observation path.

## Capabilities

| Format | Implemented behavior |
| :--- | :--- |
| JPEG / PNG | Attempts EXIF parsing for camera, model, software, timestamp and GPS fields; support depends on the parser and file |
| PDF | Attempts author, creator, producer, creation and modification fields |
| DOCX | Reports downloaded file size and the temporary file's local modification timestamp |
| Discord | `/metadata file:<attachment>` with extracted fields and review labels |

## Quick start

Requires Node.js, a Discord application and the parser dependencies in `package.json`. Keep the bundled `raven.png`; startup checks its file size and image signature.

```bash
git clone https://github.com/r4venrudy/rudy-metadata-checker.git
cd rudy-metadata-checker
npm install
```

Set the `DISCORD_TOKEN` and `CLIENT_ID` environment variables, then start the bot:

```bash
node index.js
```

Invite it with `bot` and `applications.commands` scopes. Use `/metadata` with a file you are permitted to inspect.

## Implementation notes

- DOCX core properties are not extracted. The displayed modification time belongs to the temporary download, not the original document. Mammoth is imported but unused.
- The PDF path uses the `pdf-parse` v2 `PDFParse.getInfo()` API and destroys its worker after use. An offline PDF fixture checks document information extraction.
- The code downloads the complete attachment and writes a temporary file, which is removed in `finally`. Download timeout is 15 seconds; no explicit file-size limit is implemented.
- Replies are channel-visible and may contain GPS coordinates or author names. A missing EXIF result can mean unsupported parsing or no readable metadata; it does not prove deliberate stripping.
- This documentation is based on source inspection; authenticated Discord and parser integrations require live validation.

## Project map

```text
index.js       Attachment handling, parser branches and Discord command
package.json   Discord, HTTP and metadata dependencies
raven.png      Required startup asset
```

## GitHub package

A non-root container is published to GitHub Packages after build and offline configuration checks. Credentials are supplied at runtime and are excluded from the image.

```sh
cp .env.example .env
# Fill in your own values in .env, keeping that file private.
docker run --rm --env-file .env ghcr.io/r4venrudy/rudy-metadata-checker:latest --check-config
docker run --rm --env-file .env ghcr.io/r4venrudy/rudy-metadata-checker:latest
```

`--check-config` validates installed dependencies, the bundled asset, and required settings without connecting to Discord. `RUDY_CONFIG` optionally points to a mounted JSON configuration file; environment variables take priority.

Only public project files are packaged. Image tags are `latest` and `sha-<full commit SHA>`. Discord login and external API behavior still require your own account configuration; CI never uses live credentials.


## License

[MIT](LICENSE). Preserve the attribution in the license file.

---

<p align="center">Part of the <a href="https://github.com/r4venrudy">r4venrudy</a> project collection.</p>
