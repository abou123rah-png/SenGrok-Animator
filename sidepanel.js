let queue = [];
let isRunning = false;
let currentBatchIndex = 0;
let activeMode = 'text-to-video';

// Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const modeBtns = document.querySelectorAll('.mode-btn');
const promptInput = document.getElementById('prompt-input');
const imageRefInput = document.getElementById('image-ref');
const dialogueInput = document.getElementById('dialogue-input');
const addBtn = document.getElementById('add-to-queue');
const queueList = document.getElementById('queue-list');
const clearBtn = document.getElementById('clear-queue');
const startBtn = document.getElementById('start-batch');
const stopBtn = document.getElementById('stop-batch');
const delayInput = document.getElementById('prompt-delay');
const delayUp = document.getElementById('delay-up');
const delayDown = document.getElementById('delay-down');
const progressBar = document.getElementById('progress-bar');

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Mode Selection
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.add('active');
        activeMode = btn.dataset.mode;

        // Show/hide advanced fields based on mode
        const advanced = document.getElementById('advanced-fields');
        if (activeMode.includes('image') || activeMode.includes('frame')) {
            advanced.style.display = 'flex';
        } else {
            advanced.style.display = 'flex'; // Keep visible for dialogues as requested
        }
    });
});

// Guide Modal
const guideOpen = document.getElementById('guide-open');
const guideClose = document.getElementById('guide-close');
const guideModal = document.getElementById('guide-modal');

guideOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    guideModal?.classList.add('active');
});

guideClose?.addEventListener('click', () => {
    guideModal?.classList.remove('active');
});

// Close modal when clicking outside
guideModal?.addEventListener('click', (e) => {
    if (e.target === guideModal) {
        guideModal?.classList.remove('active');
    }
});

// Delay Spinner
delayUp.addEventListener('click', () => delayInput.value = parseInt(delayInput.value) + 1);
delayDown.addEventListener('click', () => delayInput.value = Math.max(1, parseInt(delayInput.value) - 1));

// Storage Keys: grokQueue, grokSettings
chrome.storage.local.get(['grokQueue', 'grokSettings'], (result) => {
    if (result.grokQueue) {
        queue = result.grokQueue;
        renderQueue();
    }
    if (result.grokSettings) {
        loadSettings(result.grokSettings);
    }
});

function loadSettings(s) {
    if (s.delay) delayInput.value = s.delay;
    if (s.concurrent) document.getElementById('concurrent-prompts').value = s.concurrent;
    if (s.defaultMode) document.getElementById('default-mode').value = s.defaultMode;
    if (s.model) document.getElementById('gen-model').value = s.model;
    if (s.aspectRatio) document.getElementById('aspect-ratio').value = s.aspectRatio;
    if (s.outputsPerPrompt) document.getElementById('outputs-per-prompt').value = s.outputsPerPrompt;
    if (s.videoDuration) document.getElementById('video-duration').value = s.videoDuration;
    if (s.downloadQuality) document.getElementById('download-quality').value = s.downloadQuality;
    if (s.lang) document.getElementById('lang-pref').value = s.lang;
}

function saveSettings() {
    const s = {
        delay: parseInt(delayInput.value),
        concurrent: parseInt(document.getElementById('concurrent-prompts').value),
        defaultMode: document.getElementById('default-mode').value,
        model: document.getElementById('gen-model').value,
        aspectRatio: document.getElementById('aspect-ratio').value,
        outputsPerPrompt: parseInt(document.getElementById('outputs-per-prompt').value),
        videoDuration: document.getElementById('video-duration').value,
        downloadQuality: document.getElementById('download-quality').value,
        lang: document.getElementById('lang-pref').value
    };
    chrome.storage.local.set({ grokSettings: s });
}

document.getElementById('save-settings')?.addEventListener('click', saveSettings);

// Queue Logic
addBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    const item = {
        mode: activeMode,
        prompt: prompt,
        imageRef: imageRefInput.value.trim(),
        dialogue: dialogueInput.value.trim(),
        timestamp: Date.now()
    };

    queue.push(item);
    promptInput.value = '';
    imageRefInput.value = '';
    dialogueInput.value = '';
    renderQueue();
    saveQueue();
});

function saveQueue() {
    chrome.storage.local.set({ grokQueue: queue });
}

function renderQueue() {
    if (queue.length === 0) {
        queueList.innerHTML = '<div class="empty-state">Queue is currently empty.</div>';
        return;
    }

    queueList.innerHTML = '';
    queue.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
      <div class="queue-item-content">
        <div class="queue-item-prompt truncate">${item.prompt}</div>
        <div class="queue-item-meta">
          [${item.mode.toUpperCase()}] 
          ${item.imageRef ? '• Image Attached' : ''} 
          ${item.dialogue ? '• Dialogue Incl.' : ''}
        </div>
      </div>
      <button class="btn-text" style="color: var(--danger); font-size: 1rem; padding: 4px;" onclick="removeQueueItem(${index})">✕</button>
    `;
        queueList.appendChild(div);
    });
}

window.removeQueueItem = (index) => {
    queue.splice(index, 1);
    renderQueue();
    saveQueue();
};

clearBtn.addEventListener('click', () => {
    queue = [];
    renderQueue();
    saveQueue();
});

// Execution
startBtn.addEventListener('click', () => {
    if (queue.length === 0) return;
    isRunning = true;
    currentBatchIndex = 0;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    processNext();
});

stopBtn.addEventListener('click', () => {
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

// Grok Presence Detection
const presenceOverlay = document.getElementById('presence-overlay');
const openGrokBtn = document.getElementById('open-grok-btn');

async function checkGrokPresence() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('grok.com/imagine')) {
        presenceOverlay?.classList.add('hidden');
    } else {
        presenceOverlay?.classList.remove('hidden');
    }
}

openGrokBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://grok.com/imagine' });
});

// Watch for tab changes
chrome.tabs.onActivated.addListener(checkGrokPresence);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') checkGrokPresence();
});

// Initial check
checkGrokPresence();

async function processNext() {
    if (!isRunning || currentBatchIndex >= queue.length) {
        isRunning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        progressBar.style.width = '0%';
        return;
    }

    const item = queue[currentBatchIndex];
    const delay = parseInt(delayInput.value) * 1000;

    // Update progress
    progressBar.style.width = `${((currentBatchIndex + 1) / queue.length) * 100}%`;

    try {
        const s = await getSettings();
        const response = await chrome.runtime.sendMessage({
            target: 'content',
            action: 'processPrompt',
            data: { ...item, settings: s }
        });

        if (response && response.status === 'success') {
            currentBatchIndex++;
            setTimeout(processNext, delay);
        } else {
            console.error('Automation failed:', response?.message);
            isRunning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    } catch (err) {
        console.error('Messaging error:', err);
        isRunning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get('grokSettings', res => resolve(res.grokSettings || {}));
    });
}
