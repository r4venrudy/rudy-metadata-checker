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
const { pngMetadata, xmpSummary } = require("./packaging/png-meta.cjs")
const { pdfMetadata } = require("./packaging/pdf-meta.cjs")
const { formatField } = require("./packaging/format.cjs")
const { isWebp, webpChunks, tiffAsJpeg } = require("./packaging/webp-meta.cjs")

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
        .setDescription("Upload a JPEG, PNG, WebP, PDF or DOCX file")
        .setRequired(true)
    )
].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
}

client.once("ready", () => {
  console.log(`Bot ready: ${client.user.tag}`)
})

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return
  if (interaction.commandName !== "metadata") return

  await interaction.deferReply()

  const attachment = interaction.options.getAttachment("file")
  let ext = path.extname(attachment.name).toLowerCase()

  const SUPPORTED = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".docx"]
  const MAX_BYTES = 25 * 1024 * 1024
  if (!SUPPORTED.includes(ext)) {
    await interaction.editReply(`❌ Unsupported file type. Use one of: ${SUPPORTED.join(", ")}`)
    return
  }
  if (attachment.size > MAX_BYTES) {
    await interaction.editReply("❌ File is larger than 25 MB.")
    return
  }

  try {
    const res = await axios.get(attachment.url, { responseType: "arraybuffer", timeout: 15000 })
    const buffer = Buffer.from(res.data)

    // Trust the file's magic bytes over its name, so a renamed .png sent as .jpg still parses
    const sniffed = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? ".png"
      : buffer[0] === 0xff && buffer[1] === 0xd8 ? ".jpg"
      : isWebp(buffer) ? ".webp"
      : buffer.subarray(0, 5).toString("latin1") === "%PDF-" ? ".pdf"
      : buffer.subarray(0, 2).toString("latin1") === "PK" && ext === ".docx" ? ".docx"
      : null
    if (!sniffed) throw new Error("The file contents don't match a supported JPEG, PNG, WebP, PDF or DOCX file")
    ext = sniffed

    let metadata = {}
    let sensitive = []

    if (ext === ".png") {
      // exif-parser only reads JPEG; PNGs keep their metadata in text chunks instead
      ;({ metadata, sensitive } = pngMetadata(buffer))
    } else if ([".jpg", ".jpeg"].includes(ext)) {
      try {
        const parser = exif.create(buffer)
        const result = parser.parse()

        ;({ metadata, sensitive } = imageMetadata(result.tags))
      } catch {
        metadata = { EXIF: "No readable EXIF metadata found (stripped or unsupported)" }
      }
      // Photoshop, Lightroom and Canva also embed an XMP packet in JPEGs
      const xmp = buffer.toString("utf8").match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/)
      if (xmp) {
        const extra = xmpSummary(xmp[0])
        for (const [k, v] of Object.entries(extra)) if (!metadata[k] || metadata[k] === "N/A") metadata[`XMP ${k}`] = v
        if (extra.Author && !sensitive.includes("Author Name")) sensitive.push("Author Name")
      }
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
      }
    } else if (ext === ".pdf") {
      ;({ metadata, sensitive } = pdfMetadata(await pdfInfo(buffer)))
    } else if (ext === ".docx") {
      ;({ metadata, sensitive } = docxMetadata(buffer))
    } else {
      throw new Error("Unsupported file type")
    }

    const embed = new EmbedBuilder()
      .setTitle("🧠 Rudy Metadata Intelligence")
      .setColor(sensitive.length ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "File", value: attachment.name },
        { name: "Type", value: ext.replace(".", "").toUpperCase() },
        { name: "Extracted Metadata", value: formatField(metadata) || "None" },
        { name: "Sensitive Findings", value: sensitive.length ? sensitive.join(", ") : "None detected" }
      )
      .setFooter({ text: "Passive Metadata Extraction | OSINT Use Only" })

    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    await interaction.editReply(`❌ Error: ${err.message}`)
  }
})

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(err => {
    console.error(`Startup failed (check DISCORD_TOKEN and CLIENT_ID): ${err.message}`)
    process.exit(1)
  })
