// ======================
// UNIFIED DATA MODEL
// ======================
// Student structure combines popup (quick tracking) with sidebar (detailed tracking):
// {
//   id, name, grade, goal,
//   participation: { totalCalls, correctAnswers, incorrectAnswers, callsThisSession, subjectBreakdown },
//   connections: { totalMGCs, lastConnection, daysSinceLastMGC, history },
//   interests: { extracurriculars, hobbies, strengths, notes }
// }

// ======================
// UTILITY FUNCTIONS
// ======================

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

function isRestrictedPage(url) {
    return url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:');
}

// ======================
// CHROME TAB UTILITIES
// ======================

function withActiveContentTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error('Error querying tabs:', chrome.runtime.lastError);
            return;
        }
        if (!tabs[0] || isRestrictedPage(tabs[0].url)) {
            console.log('Cannot inject into restricted page:', tabs[0]?.url);
            return;
        }
        callback(tabs[0].id);
    });
}

function sendMessageToContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not ready:', chrome.runtime.lastError.message);
        }
    });
}

// ======================
// SUBJECT TRACKING
// ======================

function getCurrentSubjectFromSchedule(callback) {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    chrome.storage.local.get(['schedules'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting schedules:', chrome.runtime.lastError);
            callback(null);
            return;
        }

        const schedules = result.schedules || {};
        const todaySchedule = schedules[currentDay] || [];

        for (const period of todaySchedule) {
            const startMinutes = timeToMinutes(period.start_time);
            const endMinutes = timeToMinutes(period.end_time);

            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                callback(period.subject);
                return;
            }
        }

        callback(null);
    });
}

function checkAndResetOnSubjectChange(callback) {
    getCurrentSubjectFromSchedule((currentSubject) => {
        chrome.storage.local.get(['lastSubject', 'students'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error checking subject:', chrome.runtime.lastError);
                callback();
                return;
            }

            const lastSubject = result.lastSubject || '';

            if (currentSubject && currentSubject !== lastSubject) {
                console.log(`Subject changed from "${lastSubject}" to "${currentSubject}" - resetting session`);

                const students = result.students || [];
                students.forEach(s => {
                    if (s.participation) {
                        s.participation.callsThisSession = 0;
                    }
                });

                chrome.storage.local.set({
                    students: students,
                    sessionPool: [],
                    currentStudent: null,
                    lastSubject: currentSubject
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving subject reset:', chrome.runtime.lastError);
                    } else {
                        console.log('Session reset due to subject change');
                    }
                    callback();
                });
            } else {
                if (currentSubject && !lastSubject) {
                    chrome.storage.local.set({ lastSubject: currentSubject }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('Error setting initial subject:', chrome.runtime.lastError);
                        }
                    });
                }
                callback();
            }
        });
    });
}

// ======================
// DAILY RESET
// ======================

function checkAndResetDaily() {
    chrome.storage.local.get(['lastResetDate', 'students'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error checking daily reset:', chrome.runtime.lastError);
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const lastReset = result.lastResetDate || '';

        if (today !== lastReset) {
            console.log('Performing daily reset for date:', today);

            const students = result.students || [];
            students.forEach(s => {
                if (s.participation) {
                    s.participation.callsThisSession = 0;
                }
            });

            chrome.storage.local.set({
                absentToday: [],
                lastResetDate: today,
                students: students,
                sessionPool: [],
                currentStudent: null,
                lastSubject: null,
                callsToday: 0
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving daily reset:', chrome.runtime.lastError);
                } else {
                    console.log('Daily reset complete');
                }
            });
        }
    });
}

// ======================
// STUDENT SELECTION (SHUFFLE ROUND-ROBIN)
// ======================

/**
 * Fisher-Yates shuffle — produces a fair random ordering.
 * Returns a new shuffled array of student IDs.
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function selectStudentDirectly() {
    checkAndResetOnSubjectChange(() => {
        chrome.storage.local.get(['students', 'sessionPool', 'absentToday', 'gradeFilter'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error loading data:', chrome.runtime.lastError);
                return;
            }

            let allStudents = result.students || [];
            let sessionPool = result.sessionPool || [];
            const absentToday = result.absentToday || [];
            const gradeFilter = result.gradeFilter || 'all';

            if (allStudents.length === 0) {
                console.log('No students available');
                return;
            }

            // Build eligible list: filter by grade and remove absent
            let eligible = allStudents;
            if (gradeFilter !== 'all') {
                eligible = eligible.filter(s => s.grade === parseInt(gradeFilter));
            }
            eligible = eligible.filter(s => !absentToday.includes(s.id));

            if (eligible.length === 0) {
                console.log('No students match filter criteria');
                return;
            }

            // Clean the pool: only keep IDs that are in the eligible list
            const eligibleIds = new Set(eligible.map(s => s.id));
            sessionPool = sessionPool.filter(id => eligibleIds.has(id));

            // If pool is empty, reshuffle all eligible students
            if (sessionPool.length === 0) {
                sessionPool = shuffleArray(eligible.map(s => s.id));
                console.log('Session pool reshuffled with', sessionPool.length, 'students');
            }

            // Take the next student from the front of the pool
            const selectedId = sessionPool.shift();
            const selected = eligible.find(s => s.id === selectedId);

            if (!selected) {
                // Safety net — shouldn't happen
                console.error('Selected ID not found in eligible list, reshuffling');
                sessionPool = shuffleArray(eligible.map(s => s.id));
                const fallbackId = sessionPool.shift();
                const fallback = eligible.find(s => s.id === fallbackId);
                finishSelection(fallback, sessionPool, allStudents);
                return;
            }

            finishSelection(selected, sessionPool, allStudents);
        });
    });
}

function finishSelection(selected, sessionPool, allStudents) {
    // Update callsThisSession on the student in the full array
    const studentInArray = allStudents.find(s => s.id === selected.id);
    if (studentInArray && studentInArray.participation) {
        studentInArray.participation.callsThisSession = (studentInArray.participation.callsThisSession || 0) + 1;
    }

    // Save current student, pool, and updated students
    chrome.storage.local.set({
        currentStudent: selected,
        sessionPool: sessionPool,
        students: allStudents
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving selection:', chrome.runtime.lastError);
            return;
        }

        console.log('Student selected:', selected.name,
            '| Pool remaining:', sessionPool.length);

        // Show overlay on page
        withActiveContentTab((tabId) => {
            sendMessageToContentScript(tabId, {
                action: 'showStudent',
                name: selected.name
            });
        });
    });
}

// ======================
// MARKING RESPONSES
// ======================

function markResponse(isCorrect) {
    chrome.storage.local.get(['currentStudent', 'students', 'callsToday'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading data for marking:', chrome.runtime.lastError);
            return;
        }

        const currentStudent = result.currentStudent;
        if (!currentStudent) {
            console.log('No student selected');
            return;
        }

        const students = result.students || [];
        const callsToday = (result.callsToday || 0) + 1;
        const student = students.find(s => s.id === currentStudent.id);

        if (student && student.participation) {
            // Update participation counts
            student.participation.totalCalls++;
            if (isCorrect) {
                student.participation.correctAnswers++;
            } else {
                student.participation.incorrectAnswers++;
            }

            // Update subject breakdown
            getCurrentSubjectFromSchedule((currentSubject) => {
                if (currentSubject) {
                    if (!student.participation.subjectBreakdown) {
                        student.participation.subjectBreakdown = {};
                    }
                    if (!student.participation.subjectBreakdown[currentSubject]) {
                        student.participation.subjectBreakdown[currentSubject] = { correct: 0, incorrect: 0 };
                    }
                    if (isCorrect) {
                        student.participation.subjectBreakdown[currentSubject].correct++;
                    } else {
                        student.participation.subjectBreakdown[currentSubject].incorrect++;
                    }
                }

                chrome.storage.local.set({
                    students: students,
                    currentStudent: null,
                    callsToday: callsToday
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving response:', chrome.runtime.lastError);
                        return;
                    }

                    console.log('Response marked:', isCorrect ? 'correct' : 'incorrect');

                    // Hide overlay
                    withActiveContentTab((tabId) => {
                        sendMessageToContentScript(tabId, { action: 'hideOverlay' });
                    });
                });
            });
        }
    });
}

function markAbsent() {
    chrome.storage.local.get(['currentStudent', 'absentToday', 'sessionPool'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading data for absent marking:', chrome.runtime.lastError);
            return;
        }

        const currentStudent = result.currentStudent;
        if (!currentStudent) {
            console.log('No student to mark absent');
            return;
        }

        const absentToday = result.absentToday || [];
        let sessionPool = result.sessionPool || [];

        if (!absentToday.includes(currentStudent.id)) {
            absentToday.push(currentStudent.id);
        }

        sessionPool = sessionPool.filter(id => id !== currentStudent.id);

        chrome.storage.local.set({
            absentToday: absentToday,
            sessionPool: sessionPool,
            currentStudent: null
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving absent status:', chrome.runtime.lastError);
                return;
            }

            console.log('Student marked absent:', currentStudent.name);

            // Hide overlay
            withActiveContentTab((tabId) => {
                sendMessageToContentScript(tabId, { action: 'hideOverlay' });
            });
        });
    });
}

// ======================
// GRADE FILTER
// ======================

function toggleGradeFilterBackground() {
    chrome.storage.local.get(['gradeFilter'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading filter:', chrome.runtime.lastError);
            return;
        }

        const currentFilter = result.gradeFilter || 'all';
        const filterCycle = { 'all': '4', '4': '5', '5': 'all' };
        const newFilter = filterCycle[currentFilter];

        const filterDisplay = {
            'all': 'Grade Filter: All Students',
            '4': 'Grade Filter: Year 4 Only',
            '5': 'Grade Filter: Year 5 Only'
        };

        chrome.storage.local.set({
            gradeFilter: newFilter,
            sessionPool: []
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving filter:', chrome.runtime.lastError);
                return;
            }

            console.log('Grade filter changed to:', newFilter);

            // Show notification
            withActiveContentTab((tabId) => {
                sendMessageToContentScript(tabId, {
                    action: 'showFilterChange',
                    filter: filterDisplay[newFilter]
                });
            });
        });
    });
}

// ======================
// KEYBOARD COMMANDS
// ======================

chrome.commands.onCommand.addListener((command) => {
    const commandMap = {
        'select-student': selectStudentDirectly,
        'mark-correct': () => markResponse(true),
        'mark-incorrect': () => markResponse(false),
        'toggle-grade-filter': toggleGradeFilterBackground
    };

    const handler = commandMap[command];
    if (handler) {
        handler();
    } else {
        console.log('Unknown command:', command);
    }
});

// ======================
// MESSAGE HANDLERS
// ======================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handlers = {
        'selectStudent': () => { selectStudentDirectly(); return { success: true }; },
        'markCorrect': () => { markResponse(true); return { success: true }; },
        'markIncorrect': () => { markResponse(false); return { success: true }; },
        'markAbsent': () => { markAbsent(); return { success: true }; },
        'toggleGradeFilter': () => { toggleGradeFilterBackground(); return { success: true }; }
    };

    const handler = handlers[request.action];
    if (handler) {
        sendResponse(handler());
    }
    return true;
});

// ======================
// INITIALIZATION
// ======================

chrome.runtime.onInstalled.addListener(() => {
    console.log('Unified Student Tracker installed');
    checkAndResetDaily();

    // Set up alarm for daily reset
    chrome.alarms.create('dailyReset', { periodInMinutes: 60 });

    // Initialize lastSubject
    getCurrentSubjectFromSchedule((subject) => {
        if (subject) {
            chrome.storage.local.set({ lastSubject: subject });
        }
    });
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Unified Student Tracker started');
    checkAndResetDaily();

    getCurrentSubjectFromSchedule((subject) => {
        if (subject) {
            chrome.storage.local.set({ lastSubject: subject });
        }
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyReset') {
        checkAndResetDaily();
    }
});