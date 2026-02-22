/**
 * Grok Automation Content Script
 * Optimized for Grok.com's multi-mode generation
 */

const SELECTORS = {
    input: 'textarea, [contenteditable="true"]',
    sendButton: 'button[aria-label*="Send"], button:has(svg[viewBox*="0 0 24 24"])',
    uploadButton: 'button[aria-label*="Upload"], button[aria-label*="Attach"], input[type="file"]',
    messageContainer: 'div[data-testid="message-container"], div.msg-content',
    upscaleButton: 'button:contains("Upscale"), button[aria-label*="Upscale"]',
    downloadButton: 'button:contains("Download"), button[aria-label*="Download"]',
    stopButton: 'button[aria-label*="Stop"]'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processPrompt') {
        handlePromptSubmission(message.data)
            .then(() => sendResponse({ status: 'success' }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }
});

async function handlePromptSubmission(item) {
    const { mode, prompt, imageRef, dialogue, settings } = item;
    console.log(`[GrokAuto] Processing ${mode}:`, prompt);

    // 1. Setup Mode & Settings (Heuristics)
    // Note: Most settings on Grok are accessible via dropdowns or specific slash commands.
    // We'll prepend instructions to the prompt if we can't find specific UI toggles.
    let finalPrompt = prompt;
    if (dialogue) finalPrompt += `\n\n[Script/Dialogue]: ${dialogue}`;
    if (settings.aspectRatio) finalPrompt = `[Aspect Ratio: ${settings.aspectRatio}] ${finalPrompt}`;
    if (settings.videoDuration) finalPrompt = `[Duration: ${settings.videoDuration}s] ${finalPrompt}`;

    // 2. Handle Image/Frame Reference
    if (imageRef && (mode.includes('image') || mode.includes('frame'))) {
        await handleFileUpload(imageRef);
    }

    // 3. Find and fill input
    const input = await waitForElement(SELECTORS.input);
    if (!input) throw new Error('Input field not found');

    // Clear and set value
    if (input.tagName === 'TEXTAREA') {
        input.value = finalPrompt;
    } else {
        input.innerText = finalPrompt;
        // For ContentEditable, we sometimes need to focus and execCommand
        input.focus();
        document.execCommand('insertText', false, finalPrompt);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // 4. Click Send
    await sleep(1000);
    let sendBtn = document.querySelector(SELECTORS.sendButton);
    if (!sendBtn) {
        // Fallback: search all buttons
        const buttons = Array.from(document.querySelectorAll('button'));
        sendBtn = buttons.find(b =>
            b.getAttribute('aria-label')?.toLowerCase().includes('send') ||
            b.querySelector('svg[viewBox*="0 0 24 24"]')
        );
    }

    if (!sendBtn) throw new Error('Send button not found');
    sendBtn.click();

    // 5. Wait for Generation & Post-Actions
    await waitForGeneration(settings);
}

async function handleFileUpload(imageRef) {
    console.log('[GrokAuto] Attempting upload/reference for:', imageRef);

    // If it's a URL, we might just paste it. 
    // If it's a local path (from a future upload feature), we'd need to trigger the file input.
    // For now, if it starts with http, we'll assume it's a reference URL.
    if (imageRef.startsWith('http')) {
        // Try to find the upload button to see if we can paste a URL
        const uploadBtn = document.querySelector(SELECTORS.uploadButton);
        if (uploadBtn) {
            console.log('[GrokAuto] Found upload button, but URL pasting is site-dependent.');
        }
    }
}

async function waitForGeneration(settings) {
    return new Promise((resolve) => {
        let checkInterval = setInterval(() => {
            const messages = document.querySelectorAll(SELECTORS.messageContainer);
            const lastMessage = messages[messages.length - 1];

            if (lastMessage) {
                const hasDownload = lastMessage.querySelector(SELECTORS.downloadButton) || lastMessage.querySelector('a[download]');
                const hasUpscale = lastMessage.querySelector(SELECTORS.upscaleButton);
                const isStopped = !document.querySelector(SELECTORS.stopButton);

                // Simple completion check: Download button appeared OR stop button disappeared after some content
                if (hasDownload || (lastMessage.innerText.length > 50 && isStopped)) {
                    clearInterval(checkInterval);

                    // Auto-Upscale
                    if (hasUpscale) {
                        hasUpscale.click();
                        setTimeout(() => {
                            if (settings.autoDownload !== false) {
                                const newDownload = lastMessage.querySelector(SELECTORS.downloadButton);
                                if (newDownload) newDownload.click();
                            }
                            resolve();
                        }, 5000); // Wait longer for upscale
                    } else {
                        if (settings.autoDownload !== false && hasDownload) {
                            const downloadBtn = lastMessage.querySelector(SELECTORS.downloadButton);
                            if (downloadBtn) downloadBtn.click();
                        }
                        resolve();
                    }
                }
            }
        }, 3000);

        // Timeout (3 mins for video)
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 180000);
    });
}

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
