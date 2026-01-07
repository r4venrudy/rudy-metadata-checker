const fs = require("fs")
const path = require("path")

const REQUIRED_FILE = "raven.png"

function ravenGuard() {
  try {
    const stat = fs.statSync(REQUIRED_FILE)
    if (!stat.isFile()) {
      console.error("critical file invalid")
      process.exit(1)
    }
  } catch {
    console.error("critical file missing")
    process.exit(1)
  }
}

ravenGuard()

const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, Routes } = require("discord.js")
const { REST } = require("@discordjs/rest")
const axios = require("axios")
const exif = require("exif-parser")
const pdfParse = require("pdf-parse")
const mammoth = require("mammoth")

const TOKEN = "DISCORD BOT TOKEN HERE"
const CLIENT_ID = "DISCORD BOT CLIENT ID HERE"

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
  const tempPath = `./tmp_${Date.now()}${ext}`

  try {
    const res = await axios.get(attachment.url, { responseType: "arraybuffer", timeout: 15000 })
    const buffer = Buffer.from(res.data)
    fs.writeFileSync(tempPath, buffer)

    let metadata = {}
    let sensitive = []

    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      try {
        const parser = exif.create(buffer)
        const result = parser.parse()

        metadata = {
          Camera: result.tags.Make || "N/A",
          Model: result.tags.Model || "N/A",
          Software: result.tags.Software || "N/A",
          DateTaken: result.tags.DateTimeOriginal || "N/A",
          GPS: result.tags.GPSLatitude
            ? `${result.tags.GPSLatitude}, ${result.tags.GPSLongitude}`
            : "None"
        }

        if (result.tags.GPSLatitude) sensitive.push("GPS Location")
        if (result.tags.Software) sensitive.push("Editing Software")
      } catch {
        metadata = {
          EXIF: "No readable EXIF metadata found"
        }
        sensitive.push("Image Metadata Stripped or Unsupported")
      }
    } else if (ext === ".pdf") {
      const pdf = await pdfParse(buffer)

      metadata = {
        Author: pdf.info?.Author || "N/A",
        Creator: pdf.info?.Creator || "N/A",
        Producer: pdf.info?.Producer || "N/A",
        Created: pdf.info?.CreationDate || "N/A",
        Modified: pdf.info?.ModDate || "N/A"
      }

      if (pdf.info?.Author) sensitive.push("Author Name")
    } else if (ext === ".docx") {
      const stats = fs.statSync(tempPath)

      metadata = {
        FileSize: `${stats.size} bytes`,
        Modified: stats.mtime.toISOString()
      }

      sensitive.push("Document Metadata (Limited)")
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
        {
          name: "Sensitive Findings",
          value: sensitive.length ? sensitive.join(", ") : "None detected"
        }
      )
      .setFooter({ text: "Passive Metadata Extraction | OSINT Use Only" })

    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    await interaction.editReply(`❌ Error: ${err.message}`)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

registerCommands().then(() => client.login(TOKEN))
