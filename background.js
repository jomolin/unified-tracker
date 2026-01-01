// ======================
// UNIFIED DATA MODEL
// ======================
// Student structure combines popup (quick tracking) with sidebar (detailed tracking):
// {
//   id, name, grade, goal,
//   participation: { totalCalls, correctAnswers, incorrectAnswers, weight, subjectBreakdown },
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

function calculateStudentWeight(student) {
    // Use participation data if available, otherwise fallback
    if (student.participation) {
        let weight = student.participation.weight || 1;
        return weight;
    }
    // Fallback for old data
    let weight = 1;
    if (student.correctCount >= 3) weight = 0.5;
    weight += (student.incorrectCount || 0) * 0.3;
    return weight;
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
                console.log(`Subject changed from "${lastSubject}" to "${currentSubject}" - resetting weights`);

                const students = result.students || [];
                students.forEach(s => {
                    if (s.participation) {
                        s.participation.weight = 1.0;
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
                        console.log('Weights reset due to subject change');
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
                    s.participation.weight = 1.0;
                }
            });

            chrome.storage.local.set({
                absentToday: [],
                lastResetDate: today,
                students: students,
                sessionPool: [],
                currentStudent: null,
                lastSubject: null
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
// STUDENT SELECTION
// ======================

function selectWeightedStudent(students) {
    const totalWeight = students.reduce((sum, s) => sum + calculateStudentWeight(s), 0);
    let random = Math.random() * totalWeight;

    for (const student of students) {
        random -= calculateStudentWeight(student);
        if (random <= 0) return student;
    }

    return students[students.length - 1];
}

function selectStudentDirectly() {
    checkAndResetOnSubjectChange(() => {
        chrome.storage.local.get(['students', 'sessionPool', 'absentToday', 'gradeFilter'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error loading data:', chrome.runtime.lastError);
                return;
            }

            let students = result.students || [];
            let sessionPool = result.sessionPool || [];
            const absentToday = result.absentToday || [];
            const gradeFilter = result.gradeFilter || 'all';

            if (students.length === 0) {
                console.log('No students available');
                return;
            }

            // Filter by grade
            if (gradeFilter !== 'all') {
                students = students.filter(s => s.grade === parseInt(gradeFilter));
            }

            // Remove absent students
            students = students.filter(s => !absentToday.includes(s.id));

            if (students.length === 0) {
                console.log('No students match filter criteria');
                return;
            }

            // Reset pool if empty
            if (sessionPool.length === 0) {
                sessionPool = students.map(s => s.id);
                console.log('Session pool reset with', sessionPool.length, 'students');
            }

            // Get available students from pool
            const availableStudents = students.filter(s => sessionPool.includes(s.id));

            if (availableStudents.length === 0) {
                console.log('No available students in pool');
                return;
            }

            // Select student
            const selected = selectWeightedStudent(availableStudents);

            // Remove from pool
            sessionPool = sessionPool.filter(id => id !== selected.id);

            // Save current student and pool
            chrome.storage.local.set({
                currentStudent: selected,
                sessionPool: sessionPool
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving selection:', chrome.runtime.lastError);
                    return;
                }

                console.log('Student selected:', selected.name);

                // Show overlay on page
                withActiveContentTab((tabId) => {
                    sendMessageToContentScript(tabId, {
                        action: 'showStudent',
                        name: selected.name
                    });
                });
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
            // Update participation
            student.participation.totalCalls++;
            if (isCorrect) {
                student.participation.correctAnswers++;
            } else {
                student.participation.incorrectAnswers++;
            }

            // Update weight
            const accuracy = student.participation.correctAnswers / student.participation.totalCalls;
            if (accuracy >= 0.8 && student.participation.totalCalls >= 3) {
                student.participation.weight = 0.5;
            } else {
                student.participation.weight = 1.0 + (student.participation.incorrectAnswers * 0.3);
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

                // Save everything INCLUDING callsToday
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
