# ChatUnroll - Telegram Chat Exporter

Export Telegram Web chat conversations to PDF files optimized for LLM (Large Language Model) analysis. This Tampermonkey script captures both text messages and images, creating comprehensive documents that can be directly uploaded to AI assistants like Claude or GPT-4.

## Features

- **Full Image Capture**: Opens and screenshots images at full resolution
- **Date Range Selection**: Export only messages within a specific date range
- **Auto-Split**: Automatically splits large exports into multiple PDFs
- **ZIP Bundling**: Multiple PDFs are bundled into a single ZIP download
- **Progress Tracking**: Real-time progress bar with message/image counts
- **LLM-Optimized Format**: Clean, structured PDF layout for AI readability

## Installation

### Prerequisites

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension:
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### Install Script

1. Click on the Tampermonkey icon in your browser
2. Select "Create a new script..."
3. Delete the default content
4. Copy and paste the contents of `telegram-chat-exporter.user.js`
5. Press `Ctrl+S` to save

Or install directly from file:
1. Open Tampermonkey Dashboard
2. Go to "Utilities" tab
3. Under "Import from file", select `telegram-chat-exporter.user.js`

## Usage

1. Open [Telegram Web](https://web.telegram.org/) in your browser
2. Open the chat you want to export
3. Click the **floating blue button** (bottom-right corner)
4. Select the date range for export
5. Click **"Start Export"**
6. Wait for the process to complete
7. PDF(s) will be downloaded automatically

## Export Limits

To ensure stability and optimal file sizes:

| Limit | Value |
|-------|-------|
| Messages per file | 100 |
| Images per file | 40 |
| Max file size | ~20MB |

When limits are reached, the export automatically splits into multiple files bundled as a ZIP.

## Output Format

The exported PDF includes:

```
┌─────────────────────────────────────┐
│  Chat Name                          │
│  Exported: 2024-01-12 10:30:00      │
│  Date Range: 2024-01-01 to 2024-01-12│
│  Part 1 of 2 | Messages: 100        │
├─────────────────────────────────────┤
│                                     │
│  --- January 10, 2024 ---           │
│                                     │
│  [10:30] John:                      │
│  Hello everyone!                    │
│                                     │
│  [10:32] Sarah:                     │
│  Here's the document                │
│  ┌─────────────────────┐            │
│  │   [Full Image]      │            │
│  └─────────────────────┘            │
│                                     │
└─────────────────────────────────────┘
```

## Configuration

You can adjust settings by modifying the `CONFIG` object in the script:

```javascript
const CONFIG = {
    maxMessagesPerFile: 100,    // Messages before splitting
    maxImagesPerFile: 40,       // Images before splitting
    maxFileSizeMB: 20,          // Target max file size
    scrollDelay: 300,           // Delay between scroll steps (ms)
    imageLoadDelay: 500,        // Wait time for image loading (ms)
    screenshotDelay: 200,       // Delay before screenshot (ms)
};
```

## Troubleshooting

### Button not appearing
- Make sure you're on `web.telegram.org`
- Try refreshing the page
- Check if Tampermonkey is enabled

### Images not capturing
- Some images may require longer load times
- Try increasing `imageLoadDelay` in CONFIG
- Ensure images are not DRM-protected

### Export stops unexpectedly
- Large exports may hit browser memory limits
- Try reducing `maxMessagesPerFile` and `maxImagesPerFile`
- Export smaller date ranges

### Date range not working correctly
- Telegram displays dates in various formats
- The script attempts to parse common formats
- Manual scrolling to the desired range before export may help

## Technical Details

### Dependencies (loaded via CDN)
- [jsPDF](https://github.com/parallax/jsPDF) - PDF generation
- [html2canvas](https://html2canvas.hertzen.com/) - Screenshot capture
- [JSZip](https://stuk.github.io/jszip/) - ZIP file creation
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - File download

### Browser Support
- Chrome 80+
- Firefox 75+
- Edge 80+

## License

MIT License - Feel free to modify and distribute.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Roadmap

- [ ] WhatsApp Web support
- [ ] Export to other formats (HTML, Markdown)
- [ ] Reply/quote thread visualization
- [ ] Media type filtering
- [ ] Batch export multiple chats
