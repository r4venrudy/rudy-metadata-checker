#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const BASE = __dirname
const RAVEN = path.join(BASE, "raven.png")

function raven_fail() {
  console.log("Kabul etmesende mahçupsun - r4ven.leet. Fotoğrafımı geri yükle")
  process.exit(1)
}

if (!fs.existsSync(RAVEN)) raven_fail()

try {
  const stat = fs.statSync(RAVEN)
  if (!stat.isFile()) raven_fail()
  if (stat.size < 1024) raven_fail()

  const fd = fs.openSync(RAVEN, "r")
  const sig = Buffer.alloc(8)
  fs.readSync(fd, sig, 0, 8, 0)
  fs.closeSync(fd)

  const pngSig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])
  const jpgSig = Buffer.from([0xFF,0xD8])

  if (!sig.slice(0,8).equals(pngSig) && !sig.slice(0,2).equals(jpgSig)) {
    raven_fail()
  }
} catch {
  raven_fail()
}

const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, Routes, REST } = require("discord.js")
const axios = require("axios")
const exif = require("exif-parser")
const { pdfInfo } = require("./packaging/pdf-info.cjs")
const { imageMetadata } = require("./packaging/image-meta.cjs")
const { docxMetadata } = require("./packaging/docx-meta.cjs")
const { pngMetadata, pngExifChunk, xmpSummary } = require("./packaging/png-meta.cjs")
const { pdfMetadata, pdfActiveContent, pdfRevisions } = require("./packaging/pdf-meta.cjs")
const { formatField, escapeMarkdown } = require("./packaging/format.cjs")
const { isWebp, webpChunks, tiffAsJpeg } = require("./packaging/webp-meta.cjs")
const { isHeif, heifExif } = require("./packaging/heic-meta.cjs")
const { isVideo, videoMetadata } = require("./packaging/video-meta.cjs")
const { isGif, gifMetadata } = require("./packaging/gif-meta.cjs")
const { jpegComments, jpegIptc } = require("./packaging/jpeg-extra.cjs")
const { createCooldown, secondsFromEnv } = require("./packaging/cooldown.cjs")

const { loadConfig } = require('./packaging/config.cjs')
const { TOKEN, CLIENT_ID } = loadConfig({ TOKEN:'DISCORD_TOKEN', CLIENT_ID:'CLIENT_ID' })
if (process.argv.includes('--check-config')) { console.log('Configuration and dependencies ready'); process.exit(0) }

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

const commands = [
  new SlashCommandBuilder()
    .setName("metadata")
    .setDescription("Extract metadata from an uploaded file")
    .addAttachmentOption(o =>
      o.setName("file")
        .setDescription("Upload a JPEG, PNG, GIF, WebP, HEIC/AVIF, MP4/MOV, PDF or Office (DOCX/XLSX/PPTX) file")
        .setRequired(true)
    )
].map(c => c.toJSON())

const cooldown = createCooldown(secondsFromEnv(process.env.COOLDOWN_SECONDS, 10) * 1000)

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
}

// discord.js emits 'error' for gateway and network failures; with no listener Node treats it as
// an uncaught exception and the bot exits
client.on("error", err => console.error("Discord client error:", err))

client.once("ready", () => {
  console.log(`Bot ready: ${client.user.tag}`)
})

// Adds fields from an XMP packet stored as plain text in the file, without overriding EXIF values
function addEmbeddedXmp(buffer, metadata, sensitive) {
  const xmp = buffer.toString("latin1").match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/)
  if (!xmp) return
  const extra = xmpSummary(Buffer.from(xmp[0], "latin1").toString("utf8"))
  for (const [k, v] of Object.entries(extra)) if (!metadata[k] || metadata[k] === "N/A" || metadata[k] === "None") metadata[`XMP ${k}`] = v
  if (extra.Author && !sensitive.includes("Author Name")) sensitive.push("Author Name")
  if (extra.GPS && !sensitive.includes("GPS Location")) sensitive.push("GPS Location")
}

async function handleMetadata(interaction) {
  if (!interaction.isChatInputCommand()) return
  if (interaction.commandName !== "metadata") return

  const attachment = interaction.options.getAttachment("file")
  let ext = path.extname(attachment.name).toLowerCase()

  // Rejections are only shown to the user who ran the command, so they don't clutter the channel
  const SUPPORTED = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif", ".mp4", ".mov", ".m4v", ".pdf", ".docx", ".xlsx", ".pptx"]
  // Word, Excel and PowerPoint files share the same ZIP layout and docProps metadata
  const OFFICE = [".docx", ".xlsx", ".pptx"]
  const MAX_BYTES = 25 * 1024 * 1024
  if (!SUPPORTED.includes(ext)) {
    await interaction.reply({ content: `❌ Unsupported file type. Use one of: ${SUPPORTED.join(", ")}`, ephemeral: true })
    return
  }
  if (attachment.size > MAX_BYTES) {
    await interaction.reply({ content: "❌ File is larger than 25 MB.", ephemeral: true })
    return
  }
  const wait = cooldown.take(interaction.user.id)
  if (wait > 0) {
    await interaction.reply({ content: `⏳ Please wait ${Math.ceil(wait / 1000)} s before the next file.`, ephemeral: true })
    return
  }

  await interaction.deferReply()

  try {
    // the size Discord reports is checked above; cap the download too in case it differs
    const res = await axios.get(attachment.url, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_BYTES })
    const buffer = Buffer.from(res.data)

    // Trust the file's magic bytes over its name, so a renamed .png sent as .jpg still parses
    const sniffed = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? ".png"
      : buffer[0] === 0xff && buffer[1] === 0xd8 ? ".jpg"
      : isWebp(buffer) ? ".webp"
      : isGif(buffer) ? ".gif"
      // AVIF uses the same HEIF container (and Exif item); keep its own name in the embed
      : isHeif(buffer) ? (buffer.toString("latin1", 8, 12) === "avif" ? ".avif" : ".heic")
      // QuickTime files carry the "qt  " brand; label them MOV rather than MP4 in the embed
      : isVideo(buffer) ? (buffer.toString("latin1", 8, 12) === "qt  " ? ".mov" : ".mp4")
      : buffer.subarray(0, 5).toString("latin1") === "%PDF-" ? ".pdf"
      : buffer.subarray(0, 2).toString("latin1") === "PK" && OFFICE.includes(ext) ? ext
      : null
    if (!sniffed) throw new Error("The file contents don't match a supported JPEG, PNG, GIF, WebP, HEIC/AVIF, MP4/MOV, PDF or Office (DOCX/XLSX/PPTX) file")
    ext = sniffed

    let metadata = {}
    let sensitive = []

    if (ext === ".png") {
      // PNGs keep most metadata in text chunks rather than EXIF
      ;({ metadata, sensitive } = pngMetadata(buffer))
      // newer PNGs (screenshots, phone exports) can also carry a full EXIF block, GPS included
      const pngExif = pngExifChunk(buffer)
      if (pngExif) {
        try {
          const fromExif = imageMetadata(exif.create(tiffAsJpeg(pngExif)).parse().tags)
          if (metadata.PNG) metadata = {}
          for (const [k, v] of Object.entries(fromExif.metadata)) if (v && v !== "N/A" && v !== "None" && !(k in metadata)) metadata[k] = v
          for (const label of fromExif.sensitive) if (!sensitive.includes(label)) sensitive.push(label)
        } catch {
          metadata["EXIF"] = "eXIf chunk present but unreadable"
        }
      }
    } else if ([".jpg", ".jpeg"].includes(ext)) {
      try {
        const parser = exif.create(buffer)
        const result = parser.parse()

        ;({ metadata, sensitive } = imageMetadata(result.tags, { thumbnail: result.hasThumbnail("image/jpeg") }))
      } catch {
        metadata = { EXIF: "No readable EXIF metadata found (stripped or unsupported)" }
      }
      // Photoshop, Lightroom and Canva also embed an XMP packet in JPEGs
      addEmbeddedXmp(buffer, metadata, sensitive)
      // IPTC (photographer, city, caption) from news and stock photos, and free-text comments
      for (const [k, v] of Object.entries(jpegIptc(buffer))) metadata[`IPTC ${k}`] = v
      if (metadata["IPTC By-line"] && !sensitive.includes("Author Name")) sensitive.push("Author Name")
      if (metadata["IPTC City"] || metadata["IPTC Country"]) sensitive.push("Location Name")
      const comments = jpegComments(buffer)
      if (comments.length) metadata.Comment = comments.join(" | ").slice(0, 300)
    } else if (ext === ".gif") {
      ;({ metadata, sensitive } = gifMetadata(buffer))
      addEmbeddedXmp(buffer, metadata, sensitive)
    } else if (ext === ".webp") {
      const { exif: tiff, xmp } = webpChunks(buffer)
      if (tiff) {
        try {
          ;({ metadata, sensitive } = imageMetadata(exif.create(tiffAsJpeg(tiff)).parse().tags))
        } catch {
          metadata = { EXIF: "EXIF chunk present but unreadable" }
        }
      } else {
        metadata = { EXIF: "No EXIF chunk (most WebP exports strip it)" }
      }
      if (xmp) {
        const extra = xmpSummary(xmp)
        for (const [k, v] of Object.entries(extra)) metadata[`XMP ${k}`] = v
        if (extra.Author && !sensitive.includes("Author Name")) sensitive.push("Author Name")
        if (extra.GPS && !sensitive.includes("GPS Location")) sensitive.push("GPS Location")
      }
    } else if (ext === ".heic" || ext === ".avif") {
      // iPhone photos: same EXIF fields as JPEG, including GPS when location was on
      const tiff = heifExif(buffer)
      if (tiff) {
        try {
          ;({ metadata, sensitive } = imageMetadata(exif.create(tiffAsJpeg(tiff)).parse().tags))
        } catch {
          metadata = { EXIF: "EXIF item present but unreadable" }
        }
      } else {
        metadata = { EXIF: "No EXIF item in this HEIC file" }
      }
      // edited iPhone photos and Lightroom exports carry an XMP item next to the EXIF one
      addEmbeddedXmp(buffer, metadata, sensitive)
    } else if (ext === ".mp4" || ext === ".mov") {
      // phone videos: recording date, device and the location where it was filmed
      ;({ metadata, sensitive } = videoMetadata(buffer))
    } else if (ext === ".pdf") {
      ;({ metadata, sensitive } = pdfMetadata(await pdfInfo(buffer)))
      const revisions = pdfRevisions(buffer)
      if (revisions > 1) {
        metadata.Revisions = `${revisions} (edited after creation; earlier versions may still be in the file)`
        sensitive.push("Earlier Revisions")
      }
      // scripts, auto-run actions and attachments are how malicious PDFs work
      const active = pdfActiveContent(buffer)
      if (active.length) {
        metadata["Active Content"] = active.join(", ")
        sensitive.push("Active Content")
      }
    } else if (OFFICE.includes(ext)) {
      ;({ metadata, sensitive } = docxMetadata(buffer))
    } else {
      throw new Error("Unsupported file type")
    }

    const embed = new EmbedBuilder()
      .setTitle("🧠 Rudy Metadata Intelligence")
      .setColor(sensitive.length ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "File", value: escapeMarkdown(attachment.name).slice(0, 1024) },
        { name: "Type", value: ext.replace(".", "").toUpperCase() },
        { name: "Extracted Metadata", value: formatField(metadata) || "None" },
        { name: "Sensitive Findings", value: sensitive.length ? sensitive.join(", ") : "None detected" }
      )
      .setFooter({ text: "Passive Metadata Extraction | OSINT Use Only" })

    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    console.error(`/metadata ${attachment.name} failed:`, err)
    // parser errors can be very long; Discord rejects messages over 2000 characters
    const reason = String(err.message || err).slice(0, 300)
    await interaction.editReply(`❌ Error: ${reason}`).catch(() => {})
  }
}

// reply/deferReply fail when Discord expires the interaction (the bot answered after 3 s); outside a
// catch that rejection is unhandled, and Node 15+ exits on unhandled rejections
client.on("interactionCreate", interaction => {
  handleMetadata(interaction).catch(err => console.error("/metadata could not reply:", err))
})

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(err => {
    console.error(`Startup failed (check DISCORD_TOKEN and CLIENT_ID): ${err.message}`)
    process.exit(1)
  })
