// ==UserScript==
// @name         Telegram Chat Exporter
// @namespace    https://github.com/user/ChatUnroll
// @version      2.1.0
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

(function () {
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
        imageQualityFull: 1.0,      // JPEG quality for full resolution mode (0-1)
        imageQualityThumb: 0.8,     // JPEG quality for thumbnail mode (0-1)
        canvasScale: 2,             // Scale factor for html2canvas (higher = better quality)
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
        exportDate: '', // Date when export was created
        imageQuality: 'full', // 'full' or 'thumbnail'
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

        // Get default chat name from DOM
        const defaultChatName = TelegramParser.getChatName();

        overlay.innerHTML = `
            <div id="tce-modal">
                <h2>Export Chat</h2>
                <p class="subtitle">Export from current view to the bottom of chat</p>

                <label for="tce-chat-name">Chat Name</label>
                <input type="text" id="tce-chat-name" value="${defaultChatName}" placeholder="Enter chat name" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; background-color: #ffffff; color: #333333;">

                <label for="tce-format">Export Format</label>
                <select id="tce-format" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; background-color: #ffffff; color: #333333;">
                    <option value="html">HTML (recommended - preserves images)</option>
                    <option value="pdf">PDF (may have image issues)</option>
                </select>

                <label for="tce-image-quality">Image Quality</label>
                <select id="tce-image-quality" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; background-color: #ffffff; color: #333333;">
                    <option value="full">Full Resolution (slower, larger file)</option>
                    <option value="thumbnail">Thumbnail (faster, smaller file)</option>
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
        // Selectors for Telegram Web K - Updated based on actual DOM analysis Jan 2026
        selectors: {
            // Message container (where all bubbles live)
            messagesContainer: '.bubbles-inner',
            // Individual message bubble (exclude date separators and service messages)
            message: '.bubble.channel-post, .bubble:not(.is-date):not(.service)',
            // Message text content - SPECIFICALLY inside .message div, NOT in .reply
            messageText: '.bubble-content > .message .translatable-message',
            // Sender name (for groups - channels usually hide name)
            senderName: '.bubble-content > .name .peer-title',
            // Timestamp - inside .message > .time
            timestamp: '.message .time .i18n, .message .time-inner',
            // Date separator
            dateSeparator: '.bubble.is-date',
            // Media (images) - ONLY in .attachment, NOT in .reply-media
            mediaImage: '.bubble-content > .attachment img.media-photo',
            // Media wrapper that can be clicked to open viewer
            mediaWrapper: '.bubble-content > .attachment.media-container',
            // Reply element
            replyElement: '.bubble-content > .reply',
            replySender: '.reply .reply-title .peer-title',
            replyText: '.reply .reply-subtitle .translatable-message',
            // Full image viewer
            imageViewer: '.media-viewer-whole, .media-viewer-movers',
            imageViewerImg: '.media-viewer-whole img, .media-viewer-movers img, .media-viewer-aspecter img',
            // Scrollable container - the actual bubbles scroll area
            scrollContainer: '.bubbles.scrollable-y, .bubbles',
        },

        getChatName() {
            // Try multiple selectors to find the chat name
            // Priority: specific chat info > header title > peer title
            const selectors = [
                // User specific (robust version without is-pinned-message-shown dependence)
                '#column-center .chat-info-container .chat-info .content .top span',
                '#column-center > div.chats-container.tabs-container > div > div.sidebar-header.topbar > div.chat-info-container > div.chat-info > div > div.content > div.top > div > span',
                '.chat-info .info .title',           // Chat info panel
                '.chat-info .content .title',        // Alternative chat info
                '.top .chat-info .title',            // Top bar chat info
                '.column-center .chat-info .title',  // Center column
                '.sidebar .chat .title.active',      // Active chat in sidebar
                '.peer-title',                       // Peer title (common)
                '.top .title',                       // Top bar title
                '.chat-title',                       // Generic chat title
                '.TopBar .title',                    // React version
                '[class*="ChatTitle"]',              // Any class containing ChatTitle
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim()) {
                    const name = el.textContent.trim();
                    // Avoid picking up navigation or UI elements
                    if (name.length > 0 && name.length < 100 &&
                        !name.toLowerCase().includes('telegram') &&
                        !name.toLowerCase().includes('search')) {
                        console.log(`[TCE] Found chat name using selector: ${selector} -> "${name}"`);
                        return name;
                    }
                }
            }

            return 'Telegram Chat';
        },

        getScrollContainer() {
            // The actual scroll container in Telegram Web K is NOT .bubbles
            // It's a .scrollable.scrollable-y element inside #column-center
            const selectors = [
                '#column-center .scrollable.scrollable-y',  // Main chat scroll container
                '.chat .scrollable.scrollable-y',
                '.bubbles-inner-container',
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const style = getComputedStyle(el);
                    const canScroll = el.scrollHeight > el.clientHeight &&
                                     (style.overflowY === 'auto' || style.overflowY === 'scroll');
                    if (canScroll) {
                        console.log(`[TCE] Found scroll container: ${selector}, scrollHeight: ${el.scrollHeight}, clientHeight: ${el.clientHeight}, scrollTop: ${el.scrollTop}`);
                        return el;
                    }
                }
            }

            // Fallback: find the scrollable-y element that's NOT the chat list
            const allScrollables = document.querySelectorAll('.scrollable.scrollable-y');
            for (const el of allScrollables) {
                // Skip chat list (has chatlist-parts class)
                if (el.classList.contains('chatlist-parts') || el.classList.contains('folders-scrollable')) {
                    continue;
                }
                const style = getComputedStyle(el);
                if (el.scrollHeight > el.clientHeight && style.overflowY === 'auto') {
                    console.log(`[TCE] Using fallback scroll container: scrollHeight: ${el.scrollHeight}, clientHeight: ${el.clientHeight}`);
                    return el;
                }
            }

            console.log('[TCE] WARNING: Could not find scroll container!');
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

            // Get bubble-content element
            const bubbleContent = messageEl.querySelector('.bubble-content');
            if (!bubbleContent) {
                console.log('[TCE] No bubble-content found in message');
                return result;
            }

            // Get sender (for channels, use channel name from chat header)
            // Channels usually have hide-name class, so sender might be empty
            const senderEl = bubbleContent.querySelector('.name .peer-title');
            if (senderEl) {
                result.sender = senderEl.textContent.trim();
            } else if (messageEl.classList.contains('channel-post')) {
                // For channel posts, use channel name
                result.sender = state.chatName || 'Channel';
            }

            // Check if it's outgoing (from me)
            if (messageEl.classList.contains('is-out')) {
                result.sender = result.sender || 'Me';
            }

            // Get timestamp from data-timestamp attribute (most reliable)
            const timestamp = messageEl.dataset.timestamp;
            if (timestamp) {
                const date = new Date(parseInt(timestamp) * 1000);
                result.time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                result.date = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } else {
                // Fallback: try to extract from .time element
                const timeEl = messageEl.querySelector('.message .time .i18n, .message .time-inner');
                if (timeEl) {
                    const timeMatch = timeEl.textContent.match(/(\d{1,2}:\d{2})/);
                    if (timeMatch) {
                        result.time = timeMatch[1];
                    }
                }
            }

            // Get text content - ONLY from .message > .translatable-message (NOT from .reply)
            const messageDiv = bubbleContent.querySelector(':scope > .message');
            if (messageDiv) {
                const textEl = messageDiv.querySelector('.translatable-message');
                if (textEl) {
                    result.content = textEl.textContent.trim();
                }
            }

            // Capture reply info if this is a reply (has .reply element directly in bubble-content)
            const replyEl = bubbleContent.querySelector(':scope > .reply');
            if (replyEl) {
                result.isReply = true;
                result.replyTo = {};

                // Get sender from reply-title
                const replySender = replyEl.querySelector('.reply-title .peer-title');
                if (replySender) {
                    // Remove emoji images from text
                    const cloned = replySender.cloneNode(true);
                    cloned.querySelectorAll('img.emoji').forEach(e => e.remove());
                    result.replyTo.sender = cloned.textContent.trim();
                }

                // Get content from reply-subtitle
                const replySubtitle = replyEl.querySelector('.reply-subtitle');
                if (replySubtitle) {
                    const replyTextEl = replySubtitle.querySelector('.translatable-message');
                    if (replyTextEl) {
                        result.replyTo.content = replyTextEl.textContent.trim();
                    } else {
                        result.replyTo.content = replySubtitle.textContent.trim();
                    }
                }

                // Check if reply has media
                const replyMedia = replyEl.querySelector('.reply-media');
                if (replyMedia) {
                    result.replyTo.hasMedia = true;
                }
            }

            // Check for image - ONLY in .attachment (NOT in .reply-media)
            // Using :scope to ensure we only get direct children of bubble-content
            const attachmentEl = bubbleContent.querySelector(':scope > .attachment');
            if (attachmentEl) {
                const imgEl = attachmentEl.querySelector('img.media-photo');
                if (imgEl) {
                    result.type = 'image';
                    result.imageElement = imgEl;
                    result.imageUrl = imgEl.src || '';
                    result.mediaWrapper = attachmentEl;
                }
            }

            return result;
        },

        getDateFromSeparator(separatorEl) {
            return separatorEl ? separatorEl.textContent.trim() : '';
        },

        // Extract date from message's internal data attributes (more reliable than DOM text)
        getDateFromMessageElement(messageEl) {
            // Try to get timestamp from data attributes
            const timestamp = messageEl.dataset.timestamp || messageEl.dataset.date;
            if (timestamp) {
                const date = new Date(parseInt(timestamp) * 1000);
                if (!isNaN(date.getTime())) {
                    return this.normalizeToLocalStartOfDay(date);
                }
            }

            // Try to extract from time element's title or datetime attribute
            const timeEl = messageEl.querySelector('.time, .time-inner, .message-time');
            if (timeEl) {
                const title = timeEl.getAttribute('title');
                const datetime = timeEl.getAttribute('datetime');
                if (title) {
                    const parsed = new Date(title);
                    if (!isNaN(parsed.getTime())) {
                        return this.normalizeToLocalStartOfDay(parsed);
                    }
                }
                if (datetime) {
                    const parsed = new Date(datetime);
                    if (!isNaN(parsed.getTime())) {
                        return this.normalizeToLocalStartOfDay(parsed);
                    }
                }
            }

            return null;
        },

        // Helper to normalize date to start-of-day in local timezone
        normalizeToLocalStartOfDay(date) {
            if (!date || isNaN(date.getTime())) return null;
            return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        },

        async openFullImage(mediaWrapper) {
            if (!mediaWrapper) return null;

            // SAFETY CHECK: Don't click if it's an external link
            // 1. Find the actual click target (prefer the image itself)
            let clickTarget = mediaWrapper.querySelector('img') || mediaWrapper.querySelector('.canvas') || mediaWrapper;

            // 2. Check if it's inside an anchor tag
            const anchor = clickTarget.closest('a');
            if (anchor) {
                const href = anchor.getAttribute('href');
                // If it has an href that processes logic (like blob:) or is internal (telegram.org), it's usually fine
                // But if it looks like an external website, ABORT
                if (href && !href.startsWith('tg://') && !href.includes('telegram.org') && !href.startsWith('blob:') && href.includes('http')) {
                    console.log(`[TCE] Skipping external link image: ${href}`);
                    return null;
                }
            }

            // Click to open
            clickTarget.click();

            // Wait for viewer to open
            await sleep(CONFIG.imageLoadDelay);

            // Find the full image in viewer
            // Try multiple selectors as Telegram changes classes often
            const viewerSelectors = [
                this.selectors.imageViewer,
                '.MediaViewer',
                '.media-viewer',
                '#media-viewer',
                '.media-viewer-whole'
            ];

            let viewer = null;
            for (const sel of viewerSelectors) {
                viewer = document.querySelector(sel);
                if (viewer) break;
            }

            if (!viewer) {
                // console.log('[TCE] Media viewer did not open');
                return null;
            }

            const imgSelectors = [
                this.selectors.imageViewerImg,
                '.MediaViewer img',
                '.media-viewer img',
                '.media-viewer-aspecter img',
                'img.media-viewer-image' // Hypothesized
            ];

            let fullImg = null;
            for (const sel of imgSelectors) {
                fullImg = document.querySelector(sel);
                if (fullImg) break;
            }

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
            const quality = state.imageQuality === 'full' ? CONFIG.imageQualityFull : CONFIG.imageQualityThumb;
            const scale = state.imageQuality === 'full' ? CONFIG.canvasScale : 1;

            const canvas = await html2canvas(element, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                scale: scale,
            });
            return canvas.toDataURL('image/jpeg', quality);
        } catch (error) {
            console.error('Screenshot failed:', error);
            return null;
        }
    }

    async function captureImageFromSrc(imgElement) {
        if (!imgElement || !imgElement.src) return null;

        const src = imgElement.src;
        const quality = state.imageQuality === 'full' ? CONFIG.imageQualityFull : CONFIG.imageQualityThumb;
        console.log(`[TCE] Attempting to capture image from src (quality: ${quality}):`, src);

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
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            console.log(`[TCE] Direct canvas capture succeeded (${canvas.width}x${canvas.height})`);
            return dataUrl;
        } catch (e) {
            console.log('[TCE] Direct canvas failed (CORS):', e.message);
        }

        // Method 2: Try fetching the image as blob (preserves original quality)
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
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                console.log(`[TCE] CrossOrigin image capture succeeded (${canvas.width}x${canvas.height})`);
                return dataUrl;
            }
        } catch (e) {
            console.log('[TCE] CrossOrigin method failed:', e.message);
        }

        // Method 4: For blob URLs, try direct fetch (preserves original quality)
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
        const quality = state.imageQuality === 'full' ? CONFIG.imageQualityFull : CONFIG.imageQualityThumb;
        console.log(`[TCE] Attempting to capture image from URL (quality: ${quality}):`, url);

        // Method 1: Try fetching as blob with credentials (preserves original quality)
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
                console.log(`[TCE] URL image capture succeeded (${canvas.width}x${canvas.height})`);
                return canvas.toDataURL('image/jpeg', quality);
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

        const customChatName = document.getElementById('tce-chat-name').value.trim();
        const imageQuality = document.getElementById('tce-image-quality').value;

        state.isExporting = true;
        state.messages = [];
        state.currentImages = 0;
        state.currentFileIndex = 1;
        state.chatName = customChatName || TelegramParser.getChatName();
        state.imageQuality = imageQuality; // 'full' or 'thumbnail'
        state.exportDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

        updateProgress(0, 'Starting export from current view...');
        console.log('[TCE] Mode: Capture-All (no date filtering) - collecting everything from current position to bottom');

        await sleep(500);

        // Collect messages while scrolling down
        updateProgress(5, 'Collecting messages...');

        const collectedIds = new Set();

        let scrollAttempts = 0;
        let noNewScrollCount = 0;
        const maxScrollAttempts = 300; // Safety limit to prevent infinite scrolling

        while (scrollAttempts < maxScrollAttempts && state.isExporting) {
            // Find all visible messages
            const messageEls = TelegramParser.getAllMessages();

            for (const msgEl of messageEls) {
                if (!state.isExporting) break;

                // Only process actual message bubbles (not date separators or service messages)
                if (msgEl.classList.contains('is-date') || msgEl.classList.contains('service')) {
                    continue;
                }

                // Generate unique ID for this message using data-mid attribute
                const msgId = msgEl.dataset.mid;
                if (!msgId) {
                    console.log('[TCE] Skipping message without data-mid');
                    continue;
                }
                if (collectedIds.has(msgId)) continue;

                // Check if message is in or below viewport
                const rect = msgEl.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();
                // Skip messages that are completely above the viewport
                if (rect.bottom < containerRect.top) {
                    continue;
                }

                // Parse message content
                const parsed = TelegramParser.parseMessage(msgEl);

                // Mark as collected
                collectedIds.add(msgId);

                // Log for debugging
                console.log(`[TCE] Collected message ${msgId}: ${parsed.content?.slice(0, 50) || '[no text]'} | type: ${parsed.type}`);

                // HANDLE IMAGES - Direct capture only (no clicking to avoid navigation issues)
                if (parsed.type === 'image' && parsed.imageElement) {
                    // Check image limit
                    if (state.currentImages >= CONFIG.maxImagesPerFile) {
                        await saveBatchToPDF();
                    }

                    updateProgress(
                        30 + (state.messages.length % 100) * 0.5,
                        `Capturing image ${state.currentImages + 1}...`,
                        { messages: state.messages.length, images: state.currentImages, files: state.currentFileIndex }
                    );

                    // Direct capture from attachment img element
                    // No clicking - just capture what's visible to avoid navigation issues
                    const imgSrc = parsed.imageElement.src;
                    console.log(`[TCE] Capturing image: ${imgSrc?.slice(0, 80)}... (${parsed.imageElement.naturalWidth}x${parsed.imageElement.naturalHeight})`);

                    parsed.imageData = await captureImageFromSrc(parsed.imageElement);

                    if (parsed.imageData) {
                        state.currentImages++;
                        console.log(`[TCE] Image captured successfully`);
                    } else {
                        // Store URL for HTML fallback
                        console.log(`[TCE] Direct capture failed, storing URL for HTML fallback`);
                        parsed.imageUrl = imgSrc;
                    }
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

            // Scroll down logic
            const prevScrollTop = scrollContainer.scrollTop;
            scrollContainer.scrollTop += scrollContainer.clientHeight * 0.5; // Smaller scroll steps for reliability
            await sleep(CONFIG.scrollDelay);

            if (Math.abs(scrollContainer.scrollTop - prevScrollTop) < 5) {
                noNewScrollCount++;
                // Wait longer and check again to be sure
                await sleep(1000);
                if (noNewScrollCount >= 3) {
                    // Reached bottom definitely
                    console.log('[TCE] Reached bottom of chat');
                    break;
                }
            } else {
                noNewScrollCount = 0;
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

                // Reply preview (if this is a reply)
                if (msg.isReply && msg.replyTo) {
                    pdf.setFontSize(9);
                    pdf.setFont('helvetica', 'italic');
                    pdf.setTextColor(100, 100, 100);

                    const replyHeader = `> Replying to ${sanitizeText(msg.replyTo.sender) || 'someone'}:`;
                    pdf.text(replyHeader, margin + 5, yPos);
                    yPos += 4;

                    const replyText = msg.replyTo.content
                        ? `> "${sanitizeText(msg.replyTo.content).slice(0, 80)}${msg.replyTo.content.length > 80 ? '...' : ''}"`
                        : (msg.replyTo.hasMedia ? '> [Media]' : '> [Message]');
                    const replyLines = pdf.splitTextToSize(replyText, contentWidth - 10);
                    for (const line of replyLines.slice(0, 2)) { // Max 2 lines for reply preview
                        pdf.text(line, margin + 5, yPos);
                        yPos += 4;
                    }

                    pdf.setTextColor(0, 0, 0);
                    yPos += 2;
                }

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
                ? `${sanitizeFilename(state.chatName)}_${state.exportDate}_part${i + 1}.pdf`
                : `${sanitizeFilename(state.chatName)}_${state.exportDate}.pdf`;

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

            // Show reply preview if this is a reply
            if (msg.isReply && msg.replyTo) {
                messagesHtml += `
                    <div class="reply-preview">
                        <div class="reply-indicator">Replying to ${escapeHtml(msg.replyTo.sender) || 'someone'}:</div>
                        <div class="reply-content">${escapeHtml(msg.replyTo.content) || (msg.replyTo.hasMedia ? '[Media]' : '[Message]')}</div>
                    </div>
                `;
            }

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
        .reply-preview {
            background: #f0f4f8;
            border-left: 3px solid #0088cc;
            padding: 8px 12px;
            margin-bottom: 8px;
            border-radius: 0 8px 8px 0;
            font-size: 13px;
        }
        .reply-indicator {
            color: #0088cc;
            font-weight: 600;
            font-size: 11px;
            margin-bottom: 4px;
        }
        .reply-content {
            color: #666;
            font-style: italic;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }
        .message.outgoing .reply-preview {
            background: #d4e8f8;
            border-left-color: #0066aa;
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
            <div>Messages: ${state.messages.length}</div>
        </div>
    </div>
    <hr>
    ${messagesHtml}
</body>
</html>`;

        updateProgress(95, 'Preparing download...');

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const filename = `${sanitizeFilename(state.chatName)}_${state.exportDate}.html`;
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
