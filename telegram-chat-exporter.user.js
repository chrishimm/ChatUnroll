// ==UserScript==
// @name         Telegram Chat Exporter
// @namespace    https://github.com/user/ChatUnroll
// @version      1.0.0
// @description  Export Telegram Web chat to PDF with images for LLM consumption
// @author       ChatUnroll
// @match        https://web.telegram.org/*
// @grant        GM_addStyle
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

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        overlay.innerHTML = `
            <div id="tce-modal">
                <h2>Export Chat</h2>
                <p class="subtitle">Export messages with images to PDF for LLM analysis</p>

                <label for="tce-date-from">From Date</label>
                <input type="date" id="tce-date-from" value="${weekAgo}">

                <label for="tce-date-to">To Date</label>
                <input type="date" id="tce-date-to" value="${today}">

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
        // Selectors for Telegram Web K (newer version)
        selectors: {
            // Message container
            messagesContainer: '.bubbles-inner, .messages-container, #column-center .scrollable-content',
            // Individual message
            message: '.bubble:not(.is-date), .message',
            // Message text content
            messageText: '.message, .text-content, .message-content',
            // Sender name
            senderName: '.name, .peer-title, .title',
            // Timestamp
            timestamp: '.time, .time-inner, .message-time',
            // Date separator
            dateSeparator: '.bubble.is-date, .service-msg, .date-group',
            // Media (images)
            mediaImage: '.attachment img, .media-photo img, img.media-photo, .media-container img',
            // Media wrapper that can be clicked
            mediaWrapper: '.attachment, .media-photo, .media-container, .media-inner',
            // Full image viewer
            imageViewer: '.media-viewer-movers, .media-viewer-whole, #media-viewer',
            imageViewerImg: '.media-viewer-movers img, .media-viewer-whole img, #media-viewer img',
            // Scrollable container
            scrollContainer: '.bubbles, .scrollable, #column-center .scrollable',
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

            // Get timestamp
            const timeEl = messageEl.querySelector(this.selectors.timestamp);
            if (timeEl) {
                result.time = timeEl.textContent.trim();
            }

            // Get text content
            const textEl = messageEl.querySelector(this.selectors.messageText);
            if (textEl) {
                result.content = textEl.textContent.trim();
            }

            // Check for image
            const imgEl = messageEl.querySelector(this.selectors.mediaImage);
            if (imgEl) {
                result.type = 'image';
                result.imageElement = imgEl;
                result.mediaWrapper = messageEl.querySelector(this.selectors.mediaWrapper);
            }

            return result;
        },

        getDateFromSeparator(separatorEl) {
            return separatorEl ? separatorEl.textContent.trim() : '';
        },

        parseDateText(dateText) {
            // Try to parse various date formats from Telegram
            // Format: "January 10", "10 January 2024", "Today", "Yesterday", etc.
            const today = new Date();
            const lowerText = dateText.toLowerCase();

            if (lowerText === 'today') {
                return today;
            }
            if (lowerText === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                return yesterday;
            }

            // Try parsing as date
            const parsed = new Date(dateText);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }

            // Try adding current year
            const withYear = new Date(`${dateText} ${today.getFullYear()}`);
            if (!isNaN(withYear.getTime())) {
                return withYear;
            }

            return null;
        },

        isDateInRange(dateEl, fromDate, toDate) {
            const dateText = this.getDateFromSeparator(dateEl);
            const date = this.parseDateText(dateText);

            if (!date) return true; // If we can't parse, include it

            const from = new Date(fromDate);
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);

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

        try {
            await collectMessages();

            if (state.messages.length === 0) {
                showToast('No messages found in the selected date range', 'error');
            } else {
                await generatePDFs();
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
                        const fromDate = new Date(state.dateRange.from);
                        const toDate = new Date(state.dateRange.to);
                        toDate.setHours(23, 59, 59, 999);

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
                if (parsed.type === 'image' && parsed.mediaWrapper) {
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

                    // Open full image and capture
                    const fullImg = await TelegramParser.openFullImage(parsed.mediaWrapper);
                    if (fullImg) {
                        parsed.imageData = await captureElement(fullImg);
                        TelegramParser.closeImageViewer();
                        await sleep(200);
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
