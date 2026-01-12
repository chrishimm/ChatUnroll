// ==UserScript==
// @name         Telegram Chat Exporter
// @namespace    https://github.com/user/ChatUnroll
// @version      1.1.0
// @description  Export Telegram Web chat to PDF with images for LLM consumption
// @author       ChatUnroll
// @match        https://web.telegram.org/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        maxMessagesPerFile: 100,
        maxImagesPerFile: 40,
        maxFileSizeMB: 20,
        scrollDelay: 300,           // ms between scroll steps
        imageLoadDelay: 500,        // ms to wait for image to load
        screenshotDelay: 200,       // ms before taking screenshot
    };

    // ============================================
    // STATE
    // ============================================
    let state = {
        isExporting: false,
        messages: [],
        currentImages: 0,
        currentFileIndex: 1,
        chatName: '',
        dateRange: { from: null, to: null },
    };

    // ============================================
    // STYLES
    // ============================================
    GM_addStyle(`
        /* Floating Button */
        #tce-floating-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0088cc 0%, #0066aa 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0, 136, 204, 0.4);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        #tce-floating-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(0, 136, 204, 0.6);
        }

        #tce-floating-btn svg {
            width: 28px;
            height: 28px;
            fill: white;
        }

        #tce-floating-btn.exporting {
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        /* Modal Overlay */
        #tce-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }

        #tce-modal-overlay.visible {
            opacity: 1;
            visibility: visible;
        }

        /* Modal */
        #tce-modal {
            background: #ffffff;
            border-radius: 16px;
            padding: 32px;
            width: 420px;
            max-width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            transform: translateY(-20px);
            transition: transform 0.3s;
        }

        #tce-modal-overlay.visible #tce-modal {
            transform: translateY(0);
        }

        #tce-modal h2 {
            margin: 0 0 8px 0;
            color: #1a1a1a;
            font-size: 24px;
            font-weight: 600;
        }

        #tce-modal .subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 24px;
        }

        #tce-modal label {
            display: block;
            color: #333;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
        }

        #tce-modal input[type="date"] {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 20px;
            box-sizing: border-box;
            transition: border-color 0.2s;
            background-color: #ffffff;
            color: #333333;
            color-scheme: light;
        }

        #tce-modal input[type="date"]:focus {
            outline: none;
            border-color: #0088cc;
        }

        #tce-modal .btn-group {
            display: flex;
            gap: 12px;
            margin-top: 28px;
        }

        #tce-modal button {
            flex: 1;
            padding: 14px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        #tce-modal .btn-cancel {
            background: #f5f5f5;
            border: none;
            color: #666;
        }

        #tce-modal .btn-cancel:hover {
            background: #e8e8e8;
        }

        #tce-modal .btn-export {
            background: linear-gradient(135deg, #0088cc 0%, #0066aa 100%);
            border: none;
            color: white;
        }

        #tce-modal .btn-export:hover {
            box-shadow: 0 4px 15px rgba(0, 136, 204, 0.4);
        }

        #tce-modal .btn-export:disabled {
            background: #ccc;
            cursor: not-allowed;
            box-shadow: none;
        }

        /* Progress Section */
        #tce-progress {
            display: none;
            margin-top: 24px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
        }

        #tce-progress.visible {
            display: block;
        }

        #tce-progress-text {
            font-size: 14px;
            color: #333;
            margin-bottom: 12px;
        }

        #tce-progress-bar-container {
            width: 100%;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }

        #tce-progress-bar {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #0088cc 0%, #00aaff 100%);
            border-radius: 4px;
            transition: width 0.3s;
        }

        #tce-progress-stats {
            display: flex;
            justify-content: space-between;
            margin-top: 12px;
            font-size: 12px;
            color: #666;
        }

        /* Toast Notification */
        #tce-toast {
            position: fixed;
            bottom: 100px;
            right: 30px;
            background: #333;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 99999999;
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.3s, transform 0.3s;
        }

        #tce-toast.visible {
            opacity: 1;
            transform: translateY(0);
        }

        #tce-toast.success {
            background: #4caf50;
        }

        #tce-toast.error {
            background: #f44336;
        }
    `);

    // ============================================
    // UI COMPONENTS
    // ============================================

    function createFloatingButton() {
        const btn = document.createElement('button');
        btn.id = 'tce-floating-btn';
        btn.title = 'Export Chat to PDF';
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z"/>
            </svg>
        `;
        btn.addEventListener('click', showModal);
        document.body.appendChild(btn);
        return btn;
    }

    function createModal() {
        const overlay = document.createElement('div');
        overlay.id = 'tce-modal-overlay';

        // Use local timezone for date calculation (not UTC via toISOString)
        const todayDate = new Date();
        const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
        const weekAgoDate = new Date(todayDate);
        weekAgoDate.setDate(weekAgoDate.getDate() - 7);
        const weekAgo = `${weekAgoDate.getFullYear()}-${String(weekAgoDate.getMonth() + 1).padStart(2, '0')}-${String(weekAgoDate.getDate()).padStart(2, '0')}`;

        overlay.innerHTML = `
            <div id="tce-modal">
                <h2>Export Chat</h2>
                <p class="subtitle">Export messages with images to PDF for LLM analysis</p>

                <label for="tce-date-from">From Date</label>
                <input type="date" id="tce-date-from" value="${weekAgo}">

                <label for="tce-date-to">To Date</label>
                <input type="date" id="tce-date-to" value="${today}">

                <label for="tce-format">Export Format</label>
                <select id="tce-format" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; background-color: #ffffff; color: #333333;">
                    <option value="html">HTML (recommended - preserves images)</option>
                    <option value="pdf">PDF (may have image issues)</option>
                </select>

                <div id="tce-progress">
                    <div id="tce-progress-text">Preparing export...</div>
                    <div id="tce-progress-bar-container">
                        <div id="tce-progress-bar"></div>
                    </div>
                    <div id="tce-progress-stats">
                        <span id="tce-stats-messages">Messages: 0</span>
                        <span id="tce-stats-images">Images: 0</span>
                        <span id="tce-stats-files">Files: 1</span>
                    </div>
                </div>

                <div class="btn-group">
                    <button class="btn-cancel" id="tce-btn-cancel">Cancel</button>
                    <button class="btn-export" id="tce-btn-export">Start Export</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Event listeners
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && !state.isExporting) {
                hideModal();
            }
        });

        document.getElementById('tce-btn-cancel').addEventListener('click', () => {
            if (state.isExporting) {
                state.isExporting = false;
            }
            hideModal();
        });

        document.getElementById('tce-btn-export').addEventListener('click', startExport);

        return overlay;
    }

    function createToast() {
        const toast = document.createElement('div');
        toast.id = 'tce-toast';
        document.body.appendChild(toast);
        return toast;
    }

    function showModal() {
        if (state.isExporting) return;
        document.getElementById('tce-modal-overlay').classList.add('visible');
    }

    function hideModal() {
        document.getElementById('tce-modal-overlay').classList.remove('visible');
        document.getElementById('tce-progress').classList.remove('visible');
        updateProgress(0, 'Preparing export...');
    }

    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('tce-toast');
        toast.textContent = message;
        toast.className = 'visible ' + type;
        setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }

    function updateProgress(percent, text, stats = {}) {
        document.getElementById('tce-progress-bar').style.width = `${percent}%`;
        if (text) {
            document.getElementById('tce-progress-text').textContent = text;
        }
        if (stats.messages !== undefined) {
            document.getElementById('tce-stats-messages').textContent = `Messages: ${stats.messages}`;
        }
        if (stats.images !== undefined) {
            document.getElementById('tce-stats-images').textContent = `Images: ${stats.images}`;
        }
        if (stats.files !== undefined) {
            document.getElementById('tce-stats-files').textContent = `Files: ${stats.files}`;
        }
    }

    // ============================================
    // TELEGRAM DOM PARSER
    // ============================================

    const TelegramParser = {
        // Selectors for Telegram Web K (newer version) - Updated Jan 2026
        selectors: {
            // Message container
            messagesContainer: '.bubbles-inner, .messages-container, #column-center .scrollable-content, .chatlist',
            // Individual message
            message: '.bubble:not(.is-date):not(.is-service), .message:not(.service), .Message',
            // Message text content
            messageText: '.message, .text-content, .message-content, .text, .translatable-message',
            // Sender name
            senderName: '.name, .peer-title, .title, .message-title, .sender-title',
            // Timestamp
            timestamp: '.time, .time-inner, .message-time, .MessageMeta time, .meta time',
            // Date separator
            dateSeparator: '.bubble.is-date, .service-msg, .date-group, .bubble.is-service',
            // Media (images) - more comprehensive selectors
            mediaImage: '.attachment img, .media-photo img, img.media-photo, .media-container img, .media-inner img, canvas.thumbnail, .photo img, .media-photo-container img, img[src*="telegram"]',
            // Media wrapper that can be clicked
            mediaWrapper: '.attachment, .media-photo, .media-container, .media-inner, .photo, .media-photo-container',
            // Full image viewer
            imageViewer: '.media-viewer-movers, .media-viewer-whole, #media-viewer, .MediaViewer, .media-viewer',
            imageViewerImg: '.media-viewer-movers img, .media-viewer-whole img, #media-viewer img, .MediaViewer img, .media-viewer img, .media-viewer-aspecter img',
            // Scrollable container
            scrollContainer: '.bubbles, .scrollable, #column-center .scrollable, .Transition__slide--active .scrollable',
        },

        getChatName() {
            const titleEl = document.querySelector('.chat-info .title, .peer-title, .top .title, .chat-title');
            return titleEl ? titleEl.textContent.trim() : 'Telegram Chat';
        },

        getScrollContainer() {
            for (const selector of this.selectors.scrollContainer.split(', ')) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        },

        getMessagesContainer() {
            for (const selector of this.selectors.messagesContainer.split(', ')) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        },

        getAllMessages() {
            return document.querySelectorAll(this.selectors.message);
        },

        parseMessage(messageEl) {
            const result = {
                type: 'text',
                sender: '',
                time: '',
                date: '',
                content: '',
                imageData: null,
                element: messageEl,
            };

            // Get sender
            const senderEl = messageEl.querySelector(this.selectors.senderName);
            if (senderEl) {
                result.sender = senderEl.textContent.trim();
            }

            // Check if it's outgoing (from me)
            if (messageEl.classList.contains('is-out') || messageEl.classList.contains('outgoing')) {
                result.sender = result.sender || 'Me';
            }

            // Get timestamp - extract only the time portion
            const timeEl = messageEl.querySelector(this.selectors.timestamp);
            if (timeEl) {
                let timeText = timeEl.textContent.trim();
                // Extract time pattern (HH:MM or H:MM) from potentially messy text
                const timeMatch = timeText.match(/(\d{1,2}:\d{2})/);
                if (timeMatch) {
                    result.time = timeMatch[1];
                } else {
                    // Clean up the text - remove non-printable chars and extra content
                    result.time = timeText.replace(/[^\d:APMapm\s]/g, '').trim().slice(0, 10);
                }
            }

            // Get text content
            const textEl = messageEl.querySelector(this.selectors.messageText);
            if (textEl) {
                result.content = textEl.textContent.trim();
            }

            // Check for image - including background images
            let imgEl = messageEl.querySelector(this.selectors.mediaImage);
            const mediaWrapper = messageEl.querySelector(this.selectors.mediaWrapper);

            // If no img tag found, check for background-image in media wrapper
            if (!imgEl && mediaWrapper) {
                const bgStyle = window.getComputedStyle(mediaWrapper).backgroundImage;
                if (bgStyle && bgStyle !== 'none') {
                    // Extract URL from background-image
                    const urlMatch = bgStyle.match(/url\(["']?([^"')]+)["']?\)/);
                    if (urlMatch) {
                        result.type = 'image';
                        result.backgroundImageUrl = urlMatch[1];
                        result.mediaWrapper = mediaWrapper;
                    }
                }

                // Also check child elements for background images
                const childWithBg = mediaWrapper.querySelector('[style*="background-image"]');
                if (childWithBg) {
                    const childBgStyle = childWithBg.style.backgroundImage;
                    const urlMatch = childBgStyle.match(/url\(["']?([^"')]+)["']?\)/);
                    if (urlMatch) {
                        result.type = 'image';
                        result.backgroundImageUrl = urlMatch[1];
                        result.mediaWrapper = mediaWrapper;
                    }
                }

                // Check for canvas (Telegram sometimes uses canvas for thumbnails)
                const canvas = mediaWrapper.querySelector('canvas');
                if (canvas) {
                    result.type = 'image';
                    result.canvasElement = canvas;
                    result.mediaWrapper = mediaWrapper;
                }
            }

            if (imgEl) {
                result.type = 'image';
                result.imageElement = imgEl;
                result.imageUrl = imgEl.src || imgEl.dataset.src || '';
                result.mediaWrapper = mediaWrapper || messageEl.querySelector(this.selectors.mediaWrapper);
            }

            return result;
        },

        getDateFromSeparator(separatorEl) {
            return separatorEl ? separatorEl.textContent.trim() : '';
        },

        // Helper to normalize date to start-of-day in local timezone
        normalizeToLocalStartOfDay(date) {
            if (!date || isNaN(date.getTime())) return null;
            return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        },

        parseDateText(dateText) {
            // Try to parse various date formats from Telegram
            // Format: "January 10", "10 January 2024", "Today", "Yesterday", etc.
            // IMPORTANT: All returned dates are normalized to start-of-day in LOCAL timezone
            const today = new Date();
            const lowerText = dateText.toLowerCase().trim();

            if (lowerText === 'today') {
                return this.normalizeToLocalStartOfDay(today);
            }
            if (lowerText === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                return this.normalizeToLocalStartOfDay(yesterday);
            }

            // Try parsing as full date string (e.g., "10 January 2024" or "January 10, 2024")
            let parsed = new Date(dateText);
            if (!isNaN(parsed.getTime())) {
                // Check if the parsed date is reasonable (has correct year info)
                // If year is 2001 (JavaScript default for "January 10"), it means no year was provided
                if (parsed.getFullYear() !== 2001) {
                    return this.normalizeToLocalStartOfDay(parsed);
                }
            }

            // Try adding current year first
            let withYear = new Date(`${dateText} ${today.getFullYear()}`);
            if (!isNaN(withYear.getTime())) {
                // If the resulting date is in the future (more than 1 day ahead),
                // it's likely from the previous year
                const normalized = this.normalizeToLocalStartOfDay(withYear);
                const todayNormalized = this.normalizeToLocalStartOfDay(today);
                const oneDayInMs = 24 * 60 * 60 * 1000;

                if (normalized.getTime() > todayNormalized.getTime() + oneDayInMs) {
                    // Try previous year
                    withYear = new Date(`${dateText} ${today.getFullYear() - 1}`);
                    if (!isNaN(withYear.getTime())) {
                        return this.normalizeToLocalStartOfDay(withYear);
                    }
                }
                return normalized;
            }

            // Fallback: Try to parse the original date string and normalize
            if (!isNaN(parsed.getTime())) {
                return this.normalizeToLocalStartOfDay(parsed);
            }

            return null;
        },

        // Helper to parse YYYY-MM-DD string as local timezone date
        parseLocalDate(dateStr, endOfDay = false) {
            if (!dateStr) return null;
            const parts = dateStr.split('-');
            if (parts.length !== 3) return null;
            if (endOfDay) {
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999);
            }
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
        },

        isDateInRange(dateEl, fromDate, toDate) {
            const dateText = this.getDateFromSeparator(dateEl);
            const date = this.parseDateText(dateText);

            if (!date) return true; // If we can't parse, include it

            // Parse as LOCAL timezone dates (not UTC)
            const from = this.parseLocalDate(fromDate, false);
            const to = this.parseLocalDate(toDate, true);

            if (!from || !to) return true; // If we can't parse range, include it

            return date >= from && date <= to;
        },

        async openFullImage(mediaWrapper) {
            if (!mediaWrapper) return null;

            // Click to open
            mediaWrapper.click();

            // Wait for viewer to open
            await sleep(CONFIG.imageLoadDelay);

            // Find the full image in viewer
            const viewer = document.querySelector(this.selectors.imageViewer);
            if (!viewer) return null;

            const fullImg = document.querySelector(this.selectors.imageViewerImg);
            if (!fullImg) return null;

            // Wait for image to load
            await waitForImageLoad(fullImg);
            await sleep(CONFIG.screenshotDelay);

            return fullImg;
        },

        closeImageViewer() {
            const closeBtn = document.querySelector('.media-viewer-close, .btn-icon.media-viewer-close, .media-viewer .close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                // Press escape
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
            }
        }
    };

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function waitForImageLoad(img) {
        return new Promise((resolve) => {
            if (img.complete) {
                resolve();
            } else {
                img.onload = resolve;
                img.onerror = resolve;
                // Timeout fallback
                setTimeout(resolve, 3000);
            }
        });
    }

    // ============================================
    // TELEGRAM INTERNAL API HELPERS
    // ============================================

    // Check if Telegram internal APIs are available
    function hasTelegramAPI() {
        return !!(unsafeWindow.appDownloadManager && unsafeWindow.mtprotoMessagePort);
    }

    // Get message object from Telegram's internal store
    async function getMessageFromTelegram(peerId, messageId) {
        try {
            if (!unsafeWindow.mtprotoMessagePort) {
                console.log('[TCE] mtprotoMessagePort not available');
                return null;
            }
            const msg = await unsafeWindow.mtprotoMessagePort.getMessageByPeer(peerId, messageId);
            return msg;
        } catch (e) {
            console.log('[TCE] Failed to get message from Telegram API:', e.message);
            return null;
        }
    }

    // Get media object from message
    function getMediaFromMessage(msg) {
        if (!msg || !msg.media) return null;
        return msg.media.document || msg.media.photo || null;
    }

    // Download media using Telegram's internal download manager and convert to base64
    async function downloadMediaAsBase64(media) {
        if (!media) return null;

        try {
            // Try to get the download URL from Telegram's managers
            if (unsafeWindow.appDownloadManager) {
                // Get the blob/file from Telegram's cache or download it
                const download = await unsafeWindow.appDownloadManager.download({
                    media: media,
                    queueId: 0,
                    onlyCache: false
                });

                if (download) {
                    // Convert blob to base64
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        if (download instanceof Blob) {
                            reader.readAsDataURL(download);
                        } else if (download.url) {
                            // If it's a URL, fetch it
                            fetch(download.url)
                                .then(r => r.blob())
                                .then(blob => reader.readAsDataURL(blob))
                                .catch(() => resolve(null));
                        } else {
                            resolve(null);
                        }
                    });
                }
            }
        } catch (e) {
            console.log('[TCE] downloadMediaAsBase64 failed:', e.message);
        }

        return null;
    }

    // Alternative: Get photo/document URL from Telegram's internal methods
    async function getMediaUrl(media, peerId) {
        if (!media) return null;

        try {
            // Try appPhotosManager for photos
            if (media._ === 'photo' && unsafeWindow.appPhotosManager) {
                const sizes = media.sizes || [];
                const largestSize = sizes[sizes.length - 1];
                if (largestSize) {
                    const url = await unsafeWindow.appPhotosManager.getPhotoURL(media, largestSize);
                    if (url) return url;
                }
            }

            // Try appDocsManager for documents
            if (media._ === 'document' && unsafeWindow.appDocsManager) {
                const url = await unsafeWindow.appDocsManager.getFileURL(media);
                if (url) return url;
            }

            // Try webpDocumentsManager
            if (unsafeWindow.webpDocumentsManager) {
                const url = await unsafeWindow.webpDocumentsManager.getURL(media);
                if (url) return url;
            }
        } catch (e) {
            console.log('[TCE] getMediaUrl failed:', e.message);
        }

        return null;
    }

    // Capture media using Telegram's internal API (most robust method)
    async function captureMediaViaTelegramAPI(messageEl) {
        const mid = messageEl.dataset.mid || messageEl.dataset.messageId;
        const pid = messageEl.dataset.peerId || messageEl.closest('[data-peer-id]')?.dataset.peerId;

        if (!mid || !pid) {
            console.log('[TCE] Missing message ID or peer ID');
            return null;
        }

        console.log('[TCE] Trying Telegram API for message:', mid, 'peer:', pid);

        try {
            const msg = await getMessageFromTelegram(pid, mid);
            if (!msg) return null;

            const media = getMediaFromMessage(msg);
            if (!media) return null;

            // Try to get URL first (faster)
            const mediaUrl = await getMediaUrl(media, pid);
            if (mediaUrl) {
                console.log('[TCE] Got media URL from Telegram API:', mediaUrl);
                const base64 = await captureImageFromUrl(mediaUrl);
                if (base64) return base64;
            }

            // Fallback: download the media
            const base64 = await downloadMediaAsBase64(media);
            if (base64) {
                console.log('[TCE] Got media via Telegram download manager');
                return base64;
            }
        } catch (e) {
            console.log('[TCE] Telegram API capture failed:', e.message);
        }

        return null;
    }

    async function captureElement(element) {
        try {
            const canvas = await html2canvas(element, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                scale: 1,
            });
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (error) {
            console.error('Screenshot failed:', error);
            return null;
        }
    }

    async function captureImageFromSrc(imgElement) {
        if (!imgElement || !imgElement.src) return null;

        const src = imgElement.src;
        console.log('[TCE] Attempting to capture image from src:', src);

        // Method 1: Try direct canvas drawing (works if same-origin or CORS allowed)
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Wait for image to be fully loaded
            if (!imgElement.complete) {
                await new Promise((resolve, reject) => {
                    imgElement.onload = resolve;
                    imgElement.onerror = reject;
                    setTimeout(resolve, 3000);
                });
            }

            canvas.width = imgElement.naturalWidth || imgElement.width;
            canvas.height = imgElement.naturalHeight || imgElement.height;

            ctx.drawImage(imgElement, 0, 0);

            // This will throw if tainted by cross-origin data
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            console.log('[TCE] Direct canvas capture succeeded');
            return dataUrl;
        } catch (e) {
            console.log('[TCE] Direct canvas failed (CORS):', e.message);
        }

        // Method 2: Try fetching the image as blob
        try {
            const response = await fetch(src, {
                mode: 'cors',
                credentials: 'include'
            });

            if (response.ok) {
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            console.log('[TCE] Fetch with CORS failed:', e.message);
        }

        // Method 3: Try using a fresh image with crossOrigin attribute
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const loaded = await new Promise((resolve) => {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 5000);
                img.src = src;
            });

            if (loaded) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                console.log('[TCE] CrossOrigin image capture succeeded');
                return dataUrl;
            }
        } catch (e) {
            console.log('[TCE] CrossOrigin method failed:', e.message);
        }

        // Method 4: For blob URLs, try direct fetch
        if (src.startsWith('blob:')) {
            try {
                const response = await fetch(src);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.log('[TCE] Blob fetch failed:', e.message);
            }
        }

        console.log('[TCE] All image capture methods failed');
        return null;
    }

    async function captureImageFromUrl(url) {
        if (!url) return null;
        console.log('[TCE] Attempting to capture image from URL:', url);

        // Method 1: Try fetching as blob with credentials
        try {
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'include'
            });
            if (response.ok) {
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            console.log('[TCE] Fetch URL failed:', e.message);
        }

        // Method 2: Create image element and try to draw to canvas
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const loaded = await new Promise((resolve) => {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 5000);
                img.src = url;
            });

            if (loaded && img.naturalWidth > 0) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/jpeg', 0.8);
            }
        } catch (e) {
            console.log('[TCE] Image from URL canvas failed:', e.message);
        }

        return null;
    }

    async function captureImageWithFallback(imgElement, thumbnailElement) {
        // Try to capture the main image first
        let imageData = await captureImageFromSrc(imgElement);

        // If failed, try the thumbnail as fallback
        if (!imageData && thumbnailElement && thumbnailElement !== imgElement) {
            console.log('[TCE] Trying thumbnail as fallback');
            imageData = await captureImageFromSrc(thumbnailElement);
        }

        // Last resort: try html2canvas on the element
        if (!imageData && imgElement) {
            console.log('[TCE] Trying html2canvas as last resort');
            imageData = await captureElement(imgElement);
        }

        return imageData;
    }

    // ============================================
    // EXPORT ENGINE
    // ============================================

    async function startExport() {
        if (state.isExporting) return;

        const fromDate = document.getElementById('tce-date-from').value;
        const toDate = document.getElementById('tce-date-to').value;

        if (!fromDate || !toDate) {
            showToast('Please select both dates', 'error');
            return;
        }

        if (new Date(fromDate) > new Date(toDate)) {
            showToast('From date must be before To date', 'error');
            return;
        }

        state.isExporting = true;
        state.messages = [];
        state.currentImages = 0;
        state.currentFileIndex = 1;
        state.dateRange = { from: fromDate, to: toDate };
        state.chatName = TelegramParser.getChatName();

        // Update UI
        document.getElementById('tce-floating-btn').classList.add('exporting');
        document.getElementById('tce-btn-export').disabled = true;
        document.getElementById('tce-progress').classList.add('visible');

        const exportFormat = document.getElementById('tce-format').value;

        try {
            await collectMessages();

            if (state.messages.length === 0) {
                showToast('No messages found in the selected date range', 'error');
            } else {
                if (exportFormat === 'html') {
                    await generateHTML();
                } else {
                    await generatePDFs();
                }
                showToast(`Export complete! ${state.messages.length} messages exported.`, 'success');
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast('Export failed: ' + error.message, 'error');
        } finally {
            state.isExporting = false;
            document.getElementById('tce-floating-btn').classList.remove('exporting');
            document.getElementById('tce-btn-export').disabled = false;
            hideModal();
        }
    }

    async function collectMessages() {
        const scrollContainer = TelegramParser.getScrollContainer();
        if (!scrollContainer) {
            throw new Error('Cannot find chat scroll container. Make sure a chat is open.');
        }

        updateProgress(0, 'Scrolling to find messages...');

        // First, scroll to top to load older messages
        let lastScrollTop = -1;
        let scrollAttempts = 0;
        const maxScrollAttempts = 100;

        // Scroll to top first
        while (scrollAttempts < maxScrollAttempts && state.isExporting) {
            scrollContainer.scrollTop = 0;
            await sleep(CONFIG.scrollDelay);

            if (scrollContainer.scrollTop === lastScrollTop) {
                break;
            }
            lastScrollTop = scrollContainer.scrollTop;
            scrollAttempts++;
            updateProgress(Math.min(scrollAttempts, 30), `Loading older messages... (scroll ${scrollAttempts})`);
        }

        await sleep(500);

        // Now collect messages while scrolling down
        updateProgress(30, 'Collecting messages...');

        const collectedIds = new Set();
        let currentDate = '';
        let inDateRange = false;
        let passedDateRange = false;

        lastScrollTop = -1;
        scrollAttempts = 0;

        while (!passedDateRange && scrollAttempts < maxScrollAttempts * 2 && state.isExporting) {
            // Find all visible messages
            const messageEls = TelegramParser.getAllMessages();

            for (const msgEl of messageEls) {
                if (!state.isExporting) break;

                // Generate unique ID for this message
                const msgId = msgEl.dataset.mid || msgEl.dataset.messageId || msgEl.textContent.slice(0, 50);
                if (collectedIds.has(msgId)) continue;

                // Check for date separator before this message
                const dateSeparator = msgEl.previousElementSibling;
                if (dateSeparator && (
                    dateSeparator.classList.contains('is-date') ||
                    dateSeparator.classList.contains('service-msg')
                )) {
                    currentDate = TelegramParser.getDateFromSeparator(dateSeparator);
                    const msgDate = TelegramParser.parseDateText(currentDate);

                    if (msgDate) {
                        // Parse date strings as LOCAL timezone (not UTC)
                        const fromDate = TelegramParser.parseLocalDate(state.dateRange.from, false);
                        const toDate = TelegramParser.parseLocalDate(state.dateRange.to, true);

                        if (msgDate < fromDate) {
                            inDateRange = false;
                            continue;
                        } else if (msgDate > toDate) {
                            passedDateRange = true;
                            break;
                        } else {
                            inDateRange = true;
                        }
                    }
                }

                // If we haven't found the start date yet, skip
                if (!inDateRange && currentDate) continue;

                // Parse the message
                const parsed = TelegramParser.parseMessage(msgEl);
                parsed.date = currentDate;
                collectedIds.add(msgId);

                // If it has an image, capture it
                if (parsed.type === 'image' && (parsed.mediaWrapper || parsed.imageElement || parsed.backgroundImageUrl || parsed.canvasElement)) {
                    // Check image limit
                    if (state.currentImages >= CONFIG.maxImagesPerFile) {
                        // Save current batch and start new file
                        await saveBatchToPDF();
                    }

                    updateProgress(
                        30 + (state.messages.length % 100) * 0.5,
                        `Capturing image ${state.currentImages + 1}...`,
                        { messages: state.messages.length, images: state.currentImages, files: state.currentFileIndex }
                    );

                    // Store the thumbnail for fallback
                    const thumbnailImg = parsed.imageElement;

                    // *** MOST ROBUST METHOD: Use Telegram's internal API ***
                    // This bypasses CORS issues by using Telegram's own download manager
                    if (!parsed.imageData && hasTelegramAPI()) {
                        console.log('[TCE] Trying Telegram internal API (most robust)');
                        parsed.imageData = await captureMediaViaTelegramAPI(msgEl);
                    }

                    // Try Method 0: If there's a canvas element, capture it directly
                    if (!parsed.imageData && parsed.canvasElement) {
                        console.log('[TCE] Trying to capture from canvas');
                        try {
                            parsed.imageData = parsed.canvasElement.toDataURL('image/jpeg', 0.8);
                        } catch (e) {
                            console.log('[TCE] Canvas capture failed:', e.message);
                        }
                    }

                    // Try Method 0b: If there's a background image URL, try to fetch it
                    if (!parsed.imageData && parsed.backgroundImageUrl) {
                        console.log('[TCE] Trying to capture from background image URL:', parsed.backgroundImageUrl);
                        parsed.imageData = await captureImageFromUrl(parsed.backgroundImageUrl);
                    }

                    // Try Method 1: Capture directly from thumbnail/preview (avoids opening viewer)
                    if (!parsed.imageData && thumbnailImg) {
                        console.log('[TCE] Trying to capture from thumbnail directly');
                        parsed.imageData = await captureImageFromSrc(thumbnailImg);
                    }

                    // Try Method 2: Open full image viewer and capture
                    if (!parsed.imageData && parsed.mediaWrapper) {
                        console.log('[TCE] Opening full image viewer');
                        const fullImg = await TelegramParser.openFullImage(parsed.mediaWrapper);
                        if (fullImg) {
                            // Save the full image URL for fallback
                            if (fullImg.src && !parsed.imageUrl) {
                                parsed.imageUrl = fullImg.src;
                            }
                            parsed.imageData = await captureImageWithFallback(fullImg, thumbnailImg);
                            TelegramParser.closeImageViewer();
                            await sleep(200);
                        }
                    }

                    // Try Method 3: If still no data, try html2canvas on the thumbnail
                    if (!parsed.imageData && thumbnailImg) {
                        console.log('[TCE] Last resort: html2canvas on thumbnail');
                        parsed.imageData = await captureElement(thumbnailImg);
                    }

                    // Try Method 4: html2canvas on the media wrapper
                    if (!parsed.imageData && parsed.mediaWrapper) {
                        console.log('[TCE] Last resort: html2canvas on media wrapper');
                        parsed.imageData = await captureElement(parsed.mediaWrapper);
                    }

                    state.currentImages++;
                }

                state.messages.push(parsed);

                // Update progress
                updateProgress(
                    30 + (state.messages.length % 100) * 0.5,
                    `Collected ${state.messages.length} messages...`,
                    { messages: state.messages.length, images: state.currentImages, files: state.currentFileIndex }
                );

                // Check message limit for current batch
                if (state.messages.length >= CONFIG.maxMessagesPerFile) {
                    await saveBatchToPDF();
                }
            }

            // Scroll down
            const prevScrollTop = scrollContainer.scrollTop;
            scrollContainer.scrollTop += scrollContainer.clientHeight * 0.8;
            await sleep(CONFIG.scrollDelay);

            if (scrollContainer.scrollTop === prevScrollTop) {
                // Reached bottom
                break;
            }
            scrollAttempts++;
        }
    }

    async function saveBatchToPDF() {
        if (state.messages.length === 0) return;

        // This will be called when we need to split
        // For now, we'll handle it in generatePDFs
    }

    async function generatePDFs() {
        const { jsPDF } = window.jspdf;

        // Split messages into chunks
        const chunks = [];
        let currentChunk = [];
        let currentImageCount = 0;

        for (const msg of state.messages) {
            currentChunk.push(msg);

            if (msg.type === 'image') {
                currentImageCount++;
            }

            // Check if we need to start a new chunk
            if (currentChunk.length >= CONFIG.maxMessagesPerFile ||
                currentImageCount >= CONFIG.maxImagesPerFile) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentImageCount = 0;
            }
        }

        // Don't forget the last chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        updateProgress(80, `Generating ${chunks.length} PDF file(s)...`);

        const pdfFiles = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            updateProgress(
                80 + (i / chunks.length) * 15,
                `Generating PDF ${i + 1} of ${chunks.length}...`
            );

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            let yPos = margin;

            // Header
            pdf.setFontSize(18);
            pdf.setFont('helvetica', 'bold');
            pdf.text(sanitizeText(state.chatName), margin, yPos);
            yPos += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Exported: ${new Date().toLocaleString()}`, margin, yPos);
            yPos += 5;
            pdf.text(`Date Range: ${state.dateRange.from} to ${state.dateRange.to}`, margin, yPos);
            yPos += 5;
            pdf.text(`Part ${i + 1} of ${chunks.length} | Messages: ${chunk.length}`, margin, yPos);
            yPos += 10;

            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 10;

            pdf.setTextColor(0, 0, 0);

            let currentDate = '';

            for (const msg of chunk) {
                // Check if we need a new page
                if (yPos > pageHeight - 40) {
                    pdf.addPage();
                    yPos = margin;
                }

                // Date separator
                if (msg.date && msg.date !== currentDate) {
                    currentDate = msg.date;
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text(`--- ${sanitizeText(currentDate)} ---`, pageWidth / 2, yPos, { align: 'center' });
                    yPos += 8;
                    pdf.setTextColor(0, 0, 0);
                }

                // Sender and time
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                const senderLine = `[${msg.time || '??:??'}] ${sanitizeText(msg.sender) || 'Unknown'}:`;
                pdf.text(senderLine, margin, yPos);
                yPos += 5;

                // Message content
                if (msg.content) {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);
                    const lines = pdf.splitTextToSize(sanitizeText(msg.content), contentWidth);
                    for (const line of lines) {
                        if (yPos > pageHeight - 20) {
                            pdf.addPage();
                            yPos = margin;
                        }
                        pdf.text(line, margin, yPos);
                        yPos += 5;
                    }
                }

                // Image
                if (msg.type === 'image' && msg.imageData) {
                    // Check if image fits on current page
                    const imgHeight = 60; // Fixed height for images in PDF
                    if (yPos + imgHeight > pageHeight - 20) {
                        pdf.addPage();
                        yPos = margin;
                    }

                    try {
                        pdf.addImage(msg.imageData, 'JPEG', margin, yPos, contentWidth * 0.8, imgHeight, undefined, 'MEDIUM');
                        yPos += imgHeight + 5;
                    } catch (e) {
                        pdf.setTextColor(150, 150, 150);
                        pdf.text('[Image could not be embedded]', margin, yPos);
                        pdf.setTextColor(0, 0, 0);
                        yPos += 5;
                    }
                } else if (msg.type === 'image') {
                    pdf.setTextColor(150, 150, 150);
                    pdf.text('[Image - capture failed]', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                }

                yPos += 5; // Space between messages
            }

            // Generate filename
            const filename = chunks.length > 1
                ? `${sanitizeFilename(state.chatName)}_${state.dateRange.from}_part${i + 1}.pdf`
                : `${sanitizeFilename(state.chatName)}_${state.dateRange.from}_to_${state.dateRange.to}.pdf`;

            pdfFiles.push({
                filename,
                blob: pdf.output('blob'),
            });
        }

        // Download
        updateProgress(95, 'Preparing download...');

        if (pdfFiles.length === 1) {
            // Single file - download directly
            saveAs(pdfFiles[0].blob, pdfFiles[0].filename);
        } else {
            // Multiple files - create ZIP
            const zip = new JSZip();
            for (const file of pdfFiles) {
                zip.file(file.filename, file.blob);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${sanitizeFilename(state.chatName)}_export.zip`);
        }

        updateProgress(100, 'Complete!');
    }

    async function generateHTML() {
        updateProgress(80, 'Generating HTML file...');

        let currentDate = '';
        let messagesHtml = '';

        for (const msg of state.messages) {
            // Date separator
            if (msg.date && msg.date !== currentDate) {
                currentDate = msg.date;
                messagesHtml += `
                    <div class="date-separator">--- ${escapeHtml(currentDate)} ---</div>
                `;
            }

            // Message
            messagesHtml += `
                <div class="message ${msg.sender === 'Me' ? 'outgoing' : 'incoming'}">
                    <div class="message-header">
                        <span class="timestamp">[${msg.time || '??:??'}]</span>
                        <span class="sender">${escapeHtml(msg.sender) || 'Unknown'}:</span>
                    </div>
            `;

            if (msg.content) {
                messagesHtml += `<div class="message-text">${escapeHtml(msg.content)}</div>`;
            }

            // Handle image
            if (msg.type === 'image') {
                if (msg.imageData) {
                    messagesHtml += `
                        <div class="message-image">
                            <img src="${msg.imageData}" alt="Image" style="max-width: 100%; max-height: 400px;">
                        </div>
                    `;
                } else if (msg.imageUrl || msg.backgroundImageUrl) {
                    const imgUrl = msg.imageUrl || msg.backgroundImageUrl;
                    messagesHtml += `
                        <div class="message-image">
                            <a href="${escapeHtml(imgUrl)}" target="_blank">
                                <img src="${escapeHtml(imgUrl)}" alt="Image" style="max-width: 100%; max-height: 400px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                                <span style="display:none; color: #999;">[Image - click to view: ${escapeHtml(imgUrl)}]</span>
                            </a>
                        </div>
                    `;
                } else {
                    messagesHtml += `<div class="message-image failed">[Image - capture failed]</div>`;
                }
            }

            messagesHtml += `</div>`;
        }

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(state.chatName)} - Chat Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .header {
            background: #fff;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #0088cc;
        }
        .header .meta {
            color: #666;
            font-size: 14px;
        }
        .date-separator {
            text-align: center;
            color: #888;
            font-size: 12px;
            margin: 20px 0;
            font-weight: bold;
        }
        .message {
            background: #fff;
            padding: 12px 16px;
            margin: 8px 0;
            border-radius: 12px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }
        .message.outgoing {
            background: #e3f2fd;
            margin-left: 40px;
        }
        .message.incoming {
            margin-right: 40px;
        }
        .message-header {
            margin-bottom: 6px;
        }
        .timestamp {
            color: #999;
            font-size: 12px;
        }
        .sender {
            font-weight: 600;
            color: #0088cc;
            margin-left: 8px;
        }
        .message-text {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        .message-image {
            margin-top: 10px;
        }
        .message-image img {
            border-radius: 8px;
            cursor: pointer;
        }
        .message-image.failed {
            color: #999;
            font-style: italic;
        }
        @media print {
            body { background: #fff; }
            .message { box-shadow: none; border: 1px solid #eee; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHtml(state.chatName)}</h1>
        <div class="meta">
            <div>Exported: ${new Date().toLocaleString()}</div>
            <div>Date Range: ${state.dateRange.from} to ${state.dateRange.to}</div>
            <div>Part 1 of 1 | Messages: ${state.messages.length}</div>
        </div>
    </div>
    <hr>
    ${messagesHtml}
</body>
</html>`;

        updateProgress(95, 'Preparing download...');

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const filename = `${sanitizeFilename(state.chatName)}_${state.dateRange.from}_to_${state.dateRange.to}.html`;
        saveAs(blob, filename);

        updateProgress(100, 'Complete!');
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function sanitizeText(text) {
        if (!text) return '';
        // Remove or replace problematic characters for PDF
        return text
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
            .replace(/\uFFFD/g, ''); // Replacement character
    }

    function sanitizeFilename(name) {
        return name
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 50);
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        console.log('[Telegram Chat Exporter] Initializing...');

        // Wait for Telegram to load
        const checkTelegram = setInterval(() => {
            const chatContainer = document.querySelector('.bubbles, .messages-container, #column-center');
            if (chatContainer) {
                clearInterval(checkTelegram);
                console.log('[Telegram Chat Exporter] Telegram detected, injecting UI...');

                createFloatingButton();
                createModal();
                createToast();

                console.log('[Telegram Chat Exporter] Ready!');
            }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
            clearInterval(checkTelegram);
        }, 30000);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
