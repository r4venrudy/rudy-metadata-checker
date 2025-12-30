##################################################
#        Rudy Metadata Intelligence Discord Bot  #
##################################################

Description:
-------------
Rudy Metadata Intelligence is a Discord-based OSINT tool designed to extract
passive metadata from uploaded files. The bot analyzes images, PDF documents,
and DOCX files to identify potentially sensitive information such as EXIF data,
author fields, software traces, timestamps, and GPS coordinates.

This tool is intended for digital forensics, OSINT research, and cybersecurity
awareness. It performs no active scanning and does not modify uploaded files.

--------------------------------------------------

Features:
---------
1. Image Metadata Extraction
   - EXIF camera manufacturer and model
   - Software used to create or edit the image
   - Date and time the image was taken
   - GPS coordinates (if present)
   - Automatic handling of stripped or malformed EXIF data

2. PDF Metadata Analysis
   - Author name
   - Document creator
   - Producer software
   - Creation and modification timestamps

3. DOCX Metadata Inspection
   - File size analysis
   - Last modification timestamp
   - Lightweight document metadata review

4. Discord Slash Command Interface
   - /metadata command
   - File upload support
   - Clean, structured embed output
   - Visual alerting for sensitive findings

5. Error Tolerant Design
   - Handles corrupted or compressed images
   - Safe parsing of unsupported metadata formats
   - Bot never crashes on malformed files

--------------------------------------------------

Requirements:
-------------
- Node.js v18 or newer
- Discord Bot Token
- Discord Application Client ID
- Internet access

Required NPM Packages:
----------------------
- discord.js
- @discordjs/rest
- axios
- exif-parser
- pdf-parse
- mammoth

--------------------------------------------------

Installation:
-------------
1. Clone or download the repository.

2. Install dependencies:
   npm install discord.js @discordjs/rest axios exif-parser pdf-parse mammoth

3. Configure credentials directly in index.js:
   - Discord bot token
   - Discord client ID

4. Start the bot:
   node index.js

--------------------------------------------------

Usage:
------
1. Invite the bot to your Discord server with application command permissions.

2. Use the slash command:
   /metadata

3. Upload one of the supported file types:
   - JPG / JPEG
   - PNG
   - PDF
   - DOCX

4. The bot will respond with:
   - Extracted metadata fields
   - File type and name
   - Indicators of sensitive information

--------------------------------------------------

Output Format:
--------------
- Results are displayed in a Discord embed.
- Metadata fields are formatted for readability.
- Sensitive findings are highlighted with color changes.
- GPS, author names, and software traces are flagged when detected.

--------------------------------------------------

Security Notes:
---------------
- This tool performs passive metadata extraction only.
- No brute force, scanning, or intrusive behavior is used.
- Uploaded files are processed temporarily and deleted immediately.
- Use only on files you own or have permission to analyze.

--------------------------------------------------

Customization:
--------------
The bot can be extended by:
- Adding more file types (MP4, XLSX, PPTX)
- Exporting metadata to JSON logs
- Adding permission or role-based restrictions
- Integrating EXIF stripping or redaction features

--------------------------------------------------

Use Cases:
----------
- OSINT investigations
- Digital forensics training
- Metadata awareness demonstrations
- Privacy audits on shared documents

--------------------------------------------------

License:
--------
Provided as-is for educational and research purposes.
The author is not responsible for misuse.

--------------------------------------------------
