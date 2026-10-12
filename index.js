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
        .setDescription("Upload an image, PDF, or DOCX file")
        .setRequired(true)
    )
].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
}

function formatField(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `• ${k}: ${v}`)
    .join("\n")
    .slice(0, 1024)
}

client.once("ready", () => {
  console.log(`Bot ready: ${client.user.tag}`)
})

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return
  if (interaction.commandName !== "metadata") return

  await interaction.deferReply()

  const attachment = interaction.options.getAttachment("file")
  const ext = path.extname(attachment.name).toLowerCase()

  const SUPPORTED = [".jpg", ".jpeg", ".png", ".pdf", ".docx"]
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

    let metadata = {}
    let sensitive = []

    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      try {
        const parser = exif.create(buffer)
        const result = parser.parse()

        ;({ metadata, sensitive } = imageMetadata(result.tags))
      } catch {
        metadata = { EXIF: "No readable EXIF metadata found" }
        sensitive.push("Image Metadata Stripped or Unsupported")
      }
    } else if (ext === ".pdf") {
      const pdf = { info: await pdfInfo(buffer) }

      metadata = {
        Author: pdf.info?.Author || "N/A",
        Creator: pdf.info?.Creator || "N/A",
        Producer: pdf.info?.Producer || "N/A",
        Created: pdf.info?.CreationDate || "N/A",
        Modified: pdf.info?.ModDate || "N/A"
      }

      if (pdf.info?.Author) sensitive.push("Author Name")
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

registerCommands().then(() => client.login(TOKEN))
