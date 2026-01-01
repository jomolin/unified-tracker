// Content script - displays student name overlay with action buttons

// ======================
// MESSAGE HANDLERS
// ======================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handlers = {
        'showStudent': () => { showStudentOverlay(request.name); return { success: true }; },
                                     'hideOverlay': () => { hideOverlay(); return { success: true }; },
                                     'showFilterChange': () => { showFilterNotification(request.filter); return { success: true }; }
    };

    const handler = handlers[request.action];
    if (handler) {
        sendResponse(handler());
    }
    return true;
});

// Listen for Escape key to close overlay
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideOverlay();
    }
});

// ======================
// STUDENT OVERLAY
// ======================

function showStudentOverlay(name) {
    hideOverlay();

    // Prevent overlay from appearing in tiny hidden iframes (like ads or tracking pixels)
    if (window.innerWidth < 300 || window.innerHeight < 300) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'student-tracker-overlay';
    overlay.className = 'student-tracker-overlay';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'student-tracker-name';
    nameDiv.textContent = name;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'student-tracker-buttons';

    const correctBtn = document.createElement('button');
    correctBtn.className = 'student-tracker-btn student-tracker-btn-correct';
    correctBtn.textContent = '✓ Correct';
    correctBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'markCorrect' });
        hideOverlay();
    };

    const incorrectBtn = document.createElement('button');
    incorrectBtn.className = 'student-tracker-btn student-tracker-btn-incorrect';
    incorrectBtn.textContent = '✗ Incorrect';
    incorrectBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'markIncorrect' });
        hideOverlay();
    };

    const absentBtn = document.createElement('button');
    absentBtn.className = 'student-tracker-btn student-tracker-btn-absent';
    absentBtn.textContent = '🚫 Absent';
    absentBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'markAbsent' });
        hideOverlay();
    };

    const hintDiv = document.createElement('div');
    hintDiv.className = 'student-tracker-hint';
    hintDiv.textContent = 'Alt+Shift+C (correct) / Alt+Shift+X (incorrect) / Esc (close)';

    buttonContainer.appendChild(correctBtn);
    buttonContainer.appendChild(incorrectBtn);
    overlay.appendChild(nameDiv);
    overlay.appendChild(buttonContainer);
    overlay.appendChild(absentBtn);
    overlay.appendChild(hintDiv);

    document.body.appendChild(overlay);
    ensureStylesInjected();
}

function hideOverlay() {
    const existing = document.getElementById('student-tracker-overlay');
    if (existing) {
        existing.classList.add('student-tracker-overlay-hiding');
        setTimeout(() => existing.remove(), 300);
    }
}

function ensureStylesInjected() {
    if (!document.getElementById('student-tracker-styles')) {
        const style = document.createElement('style');
        style.id = 'student-tracker-styles';
        style.textContent = `
        .student-tracker-overlay {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.95);
            color: white;
            padding: 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            min-width: 300px;
            animation: studentTrackerSlideIn 0.3s ease-out;
        }

        .student-tracker-overlay-hiding {
            animation: studentTrackerSlideOut 0.3s ease-out;
        }

        .student-tracker-name {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 15px;
            text-align: center;
            padding-bottom: 15px;
            border-bottom: 2px solid rgba(255,255,255,0.2);
        }

        .student-tracker-buttons {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }

        .student-tracker-btn {
            flex: 1;
            padding: 12px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            transition: background 0.2s;
        }

        .student-tracker-btn-correct {
            background: #34a853;
        }

        .student-tracker-btn-correct:hover {
            background: #2d8e47;
        }

        .student-tracker-btn-incorrect {
            background: #ea4335;
        }

        .student-tracker-btn-incorrect:hover {
            background: #d33426;
        }

        .student-tracker-btn-absent {
            width: 100%;
            padding: 10px;
            font-size: 14px;
            font-weight: bold;
            border: none;
            border-radius: 6px;
            background: #5f6368;
            color: white;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 10px;
        }

        .student-tracker-btn-absent:hover {
            background: #4a4d50;
        }

        .student-tracker-hint {
            font-size: 11px;
            color: rgba(255,255,255,0.6);
            text-align: center;
            margin-top: 10px;
        }

        @keyframes studentTrackerSlideIn {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        @keyframes studentTrackerSlideOut {
            from {
                transform: translateY(0);
                opacity: 1;
            }
            to {
                transform: translateY(100%);
                opacity: 0;
            }
        }
        `;
        document.head.appendChild(style);
    }
}

// ======================
// FILTER NOTIFICATION
// ======================

function showFilterNotification(filterText) {
    // Remove existing notification
    const existing = document.getElementById('student-tracker-filter-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'student-tracker-filter-notification';
    notification.className = 'student-tracker-filter-notification';
    notification.textContent = `🎯 ${filterText}`;

    document.body.appendChild(notification);
    ensureFilterStylesInjected();

    // Auto-remove after animation
    setTimeout(() => notification.remove(), 2000);
}

function ensureFilterStylesInjected() {
    if (!document.getElementById('student-tracker-filter-styles')) {
        const style = document.createElement('style');
        style.id = 'student-tracker-filter-styles';
        style.textContent = `
        .student-tracker-filter-notification {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 16px;
            font-weight: bold;
            animation: studentTrackerFadeInOut 2s ease-in-out;
        }

        @keyframes studentTrackerFadeInOut {
            0% {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
            15% {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            85% {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            100% {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
        }
        `;
        document.head.appendChild(style);
    }
}
