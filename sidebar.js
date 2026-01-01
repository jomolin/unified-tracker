
// ======================
// STATE MANAGEMENT
// ======================

let students = [];
let schedules = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: []
};
let metadata = {
    schoolYear: "2024-2025",
    term: "Term 4",
    teacher: "",
    class: "Year 4-5"
};
let currentScheduleDay = 'monday';
let currentSubjectIndex = 0;
let currentStudent = null;
let sessionPool = [];
let absentToday = [];
let gradeFilter = 'all';
let callsToday = 0;

// MGC Prompts
const mgcPrompts = [
    "How's school going for you today?",
    "What's something you're looking forward to this week?",
    "What's something new you learned recently?",
    "How are you different now than you were at the start of the year?",
    "What's a goal you've set for yourself recently?",
    "What's something you appreciate about being in this class?",
    "Is there anything I can help you with right now?",
    "What's something that made you smile this week?",
    "How did your [recent event/activity] go?",
    "What's one thing you're proud of lately?",
    "What book/show/game are you into right now?",
    "What's something you're working on outside of school?",
    "How's your [sport/club/activity] going?",
    "What's the best part of your day so far?",
    "Is there anything challenging you right now that I should know about?",
    "What's something you're curious about these days?",
    "Who's someone you look up to and why?",
    "What's your plan after [upcoming break/event]?",
    "What's something I don't know about you that you'd like me to know?",
    "What makes you feel valued in this classroom?"
];
let usedPrompts = [];
let currentPromptIndex = Math.floor(Math.random() * mgcPrompts.length);

// ======================
// UTILITY FUNCTIONS
// ======================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

function getCurrentSubject() {
    const now = new Date();
    const currentMinutes = timeToMinutes(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    const todaySchedule = schedules[today] || [];

    for (const period of todaySchedule) {
        const startMinutes = timeToMinutes(period.start_time);
        const endMinutes = timeToMinutes(period.end_time);
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            return period.subject;
        }
    }
    return 'General';
}

function getAllSubjects() {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    return schedules[today] || [];
}

function getDaysSinceLastMGC(student) {
    if (!student.connections || student.connections.mgcHistory.length === 0) return null;
    
    const lastMGC = new Date(student.connections.mgcHistory[student.connections.mgcHistory.length - 1].date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastMGC.setHours(0, 0, 0, 0);
    
    const diffTime = today - lastMGC;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function saveData() {
    chrome.storage.local.set({
        students: students,
        schedules: schedules,
        metadata: metadata,
        absentToday: absentToday,
        gradeFilter: gradeFilter,
        callsToday: callsToday
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving data:', chrome.runtime.lastError);
        }
    });
}

function loadData() {
    chrome.storage.local.get(['students', 'schedules', 'metadata', 'absentToday', 'gradeFilter', 'callsToday', 'lastResetDate'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading data:', chrome.runtime.lastError);
            return;
        }

        students = result.students || [];
        schedules = result.schedules || { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] };
        metadata = result.metadata || { schoolYear: "2024-2025", term: "Term 4", teacher: "", class: "Year 4-5" };
        absentToday = result.absentToday || [];
        gradeFilter = result.gradeFilter || 'all';
        callsToday = result.callsToday || 0;

        checkDailyReset();
        loadMetadataForm();
        renderAll();
    });
}

function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    
    chrome.storage.local.get(['lastResetDate'], (result) => {
        const lastReset = result.lastResetDate || '';

        if (lastReset !== today) {
            absentToday = [];
            sessionPool = [];
            callsToday = 0;
            
            chrome.storage.local.set({ lastResetDate: today }, () => {
                saveData();
            });
        }
    });
}

function renderAll() {
    renderStudentListManage();
    renderConnectionsList();
    renderScheduleList();
    updateSubjectDisplay();
    updateSessionInfo();
    updateSummaryStats();
}

// ======================
// TAB SWITCHING
// ======================

function switchMainTab(tabName) {
    document.querySelectorAll('.main-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');

    if (tabName === 'connections') {
        renderConnectionsList();
    } else if (tabName === 'interests') {
        renderInterestsList();
    } else if (tabName === 'reports') {
        updateSummaryStats();
    } else if (tabName === 'manage') {
        renderStudentListManage();
        renderScheduleList();
    }
}

// ======================
// INTERESTS FUNCTIONS
// ======================

function renderInterestsList() {
    const list = document.getElementById('interests-list');
    const empty = document.getElementById('interests-empty');

    if (students.length === 0) {
        empty.style.display = 'block';
        list.innerHTML = '';
        return;
    }

    empty.style.display = 'none';

    list.innerHTML = students.map((student, index) => {
        // Ensure interests exist
        if (!student.interests) {
            student.interests = {
                extracurriculars: [],
                strengths: [],
                notes: ''
            };
        }

        const extracurricularsDisplay = student.interests.extracurriculars.length > 0 
            ? student.interests.extracurriculars.map(item => `<span class="interest-tag">${item}</span>`).join('')
            : '<span style="color: var(--text-secondary); font-style: italic;">None yet</span>';

        const strengthsDisplay = student.interests.strengths.length > 0 
            ? student.interests.strengths.map(item => `<span class="interest-tag strength-tag">${item}</span>`).join('')
            : '<span style="color: var(--text-secondary); font-style: italic;">None yet</span>';

        return `
            <div class="student-row" style="margin-bottom: 1rem;">
                <div class="student-row-top" style="grid-template-columns: 1fr auto; margin-bottom: 0.75rem;">
                    <div class="student-row-name" style="font-size: 1.1rem;">
                        ${student.name}
                    </div>
                    <button data-action="edit-interests" data-index="${index}" class="secondary" style="padding: 0.35rem 0.75rem; font-size: 0.85rem;">
                        <span class="icon" data-tooltip="Edit">✎</span> Edit
                    </button>
                </div>
                
                <div style="margin-bottom: 0.5rem;">
                    <strong style="font-size: 0.9rem; color: var(--text-secondary);">Extracurriculars & Interests:</strong>
                    <div style="margin-top: 0.25rem;">${extracurricularsDisplay}</div>
                </div>
                
                <div style="margin-bottom: 0.5rem;">
                    <strong style="font-size: 0.9rem; color: var(--text-secondary);">Strengths & Talents:</strong>
                    <div style="margin-top: 0.25rem;">${strengthsDisplay}</div>
                </div>
                
                ${student.interests.notes ? `
                    <div style="background: var(--bg-primary); padding: 0.5rem; border-radius: 4px; font-size: 0.9rem; margin-top: 0.5rem;">
                        <strong style="font-size: 0.85rem; color: var(--text-secondary);">Notes:</strong><br>
                        ${student.interests.notes}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function editInterests(studentIndex) {
    const student = students[studentIndex];
    const modal = document.getElementById('history-modal');
    const modalContent = document.getElementById('modal-content');
    
    document.getElementById('modal-student-name').textContent = student.name + ' - Interests';

    if (!student.interests) {
        student.interests = {
            extracurriculars: [],
            strengths: [],
            notes: ''
        };
    }

    modalContent.innerHTML = `
        <div class="form-group">
            <label>Extracurriculars & Interests (e.g., tīrōnui, coding, art, EFS, football, teeball)</label>
            <input type="text" id="edit-extracurriculars" value="${student.interests.extracurriculars.join(', ')}" placeholder="Enter activities separated by commas">
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">
                Separate multiple items with commas
            </p>
        </div>

        <div class="form-group">
            <label>Strengths & Talents (e.g., creative, leadership, problem-solving, athletic)</label>
            <input type="text" id="edit-strengths" value="${student.interests.strengths.join(', ')}" placeholder="Enter strengths separated by commas">
        </div>

        <div class="form-group">
            <label>Additional Notes</label>
            <textarea id="edit-notes" placeholder="Any other observations about interests or talents...">${student.interests.notes}</textarea>
        </div>

        <div class="button-group">
            <button data-action="save-interests" data-index="${studentIndex}">
                <span class="icon" data-tooltip="Save">✓</span> Save
            </button>
            <button data-action="close-history-modal" class="secondary">Cancel</button>
        </div>
    `;

    modal.classList.add('active');
}

function saveInterests(studentIndex) {
    const student = students[studentIndex];
    
    const extracurricularsInput = document.getElementById('edit-extracurriculars').value;
    const strengthsInput = document.getElementById('edit-strengths').value;
    const notesInput = document.getElementById('edit-notes').value;

    student.interests.extracurriculars = extracurricularsInput
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);

    student.interests.strengths = strengthsInput
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);

    student.interests.notes = notesInput.trim();

    saveData();
    renderInterestsList();
    closeHistoryModal();
}

// ======================
// SESSION FUNCTIONS
// ======================

function calculateWeight(student) {
    if (!student.participation) return 1.0;
    
    const currentSubject = getCurrentSubject();
    const subjectCalls = student.participation.subjectBreakdown[currentSubject] 
        ? (student.participation.subjectBreakdown[currentSubject].correct + 
           student.participation.subjectBreakdown[currentSubject].incorrect) 
        : 0;
    
    // Weight based on how many times they've been called in this subject
    // Higher weight = less likely to be selected
    return 1.0 + (subjectCalls * 2.0);
}

function selectStudent() {
    const subject = getCurrentSubject();
    
    // Filter students
    let availableStudents = students.filter(s => {
        if (absentToday.includes(s.id)) return false;
        if (gradeFilter !== 'all' && s.grade !== parseInt(gradeFilter)) return false;
        return true;
    });

    if (availableStudents.length === 0) {
        alert('No students available to select!');
        return;
    }

    // Find the minimum number of calls any student has for this subject
    const minCalls = Math.min(...availableStudents.map(s => {
        const subjectData = s.participation.subjectBreakdown[subject];
        return subjectData ? (subjectData.correct + subjectData.incorrect) : 0;
    }));

    // Only select from students who have the minimum number of calls
    const leastCalledStudents = availableStudents.filter(s => {
        const subjectData = s.participation.subjectBreakdown[subject];
        const calls = subjectData ? (subjectData.correct + subjectData.incorrect) : 0;
        return calls === minCalls;
    });

    // Random selection from least called students
    const randomIndex = Math.floor(Math.random() * leastCalledStudents.length);
    currentStudent = leastCalledStudents[randomIndex];
    
    // Display
    const display = document.getElementById('current-student-display');
    display.innerHTML = `
        <div class="current-student-name">${currentStudent.name}</div>
        <div class="current-info">Grade ${currentStudent.grade} | ${subject}</div>
        <div class="current-info">Called: ${currentStudent.participation.totalCalls} times | Accuracy: ${currentStudent.participation.totalCalls > 0 ? Math.round((currentStudent.participation.correctAnswers / currentStudent.participation.totalCalls) * 100) : 0}%</div>
    `;

    // Enable buttons
    document.getElementById('btn-correct').disabled = false;
    document.getElementById('btn-incorrect').disabled = false;
    document.getElementById('btn-absent').disabled = false;

    updateSessionInfo();
}

function markCorrect() {
    if (!currentStudent) return;
    
    const subject = getCurrentSubject();
    
    if (!currentStudent.participation) {
        currentStudent.participation = {
            totalCalls: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            weight: 1.0,
            subjectBreakdown: {}
        };
    }

    currentStudent.participation.totalCalls++;
    currentStudent.participation.correctAnswers++;
    callsToday++;

    if (!currentStudent.participation.subjectBreakdown[subject]) {
        currentStudent.participation.subjectBreakdown[subject] = { correct: 0, incorrect: 0 };
    }
    currentStudent.participation.subjectBreakdown[subject].correct++;

    saveData();
    clearCurrentStudent();
}

function markIncorrect() {
    if (!currentStudent) return;
    
    const subject = getCurrentSubject();
    
    if (!currentStudent.participation) {
        currentStudent.participation = {
            totalCalls: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            weight: 1.0,
            subjectBreakdown: {}
        };
    }

    currentStudent.participation.totalCalls++;
    currentStudent.participation.incorrectAnswers++;
    callsToday++;

    if (!currentStudent.participation.subjectBreakdown[subject]) {
        currentStudent.participation.subjectBreakdown[subject] = { correct: 0, incorrect: 0 };
    }
    currentStudent.participation.subjectBreakdown[subject].incorrect++;

    saveData();
    clearCurrentStudent();
}

function markAbsent() {
    if (!currentStudent) return;
    
    if (!absentToday.includes(currentStudent.id)) {
        absentToday.push(currentStudent.id);
    }

    if (!currentStudent.absences) {
        currentStudent.absences = [];
    }
    currentStudent.absences.push({
        date: new Date().toISOString().split('T')[0],
        subject: getCurrentSubject()
    });

    saveData();
    clearCurrentStudent();
}

function clearCurrentStudent() {
    currentStudent = null;
    document.getElementById('current-student-display').innerHTML = '<div class="student-placeholder">Press Alt+Shift+S to select a student</div>';
    document.getElementById('btn-correct').disabled = true;
    document.getElementById('btn-incorrect').disabled = true;
    document.getElementById('btn-absent').disabled = true;
    updateSessionInfo();
    
    // Check if we're on the manage tab and update it
    const manageTab = document.getElementById('manage-tab');
    if (manageTab.classList.contains('active')) {
        renderStudentListManage();
    }
}

function toggleGradeFilter() {
    const grades = ['all', '4', '5'];
    const currentIndex = grades.indexOf(gradeFilter);
    gradeFilter = grades[(currentIndex + 1) % grades.length];
    document.getElementById('filter-display').textContent = gradeFilter === 'all' ? 'All' : `Y${gradeFilter}`;
    saveData();
    updateSessionInfo();
}

function updateSessionInfo() {
    let availableCount = students.filter(s => {
        if (absentToday.includes(s.id)) return false;
        if (gradeFilter !== 'all' && s.grade !== parseInt(gradeFilter)) return false;
        return true;
    }).length;

    document.getElementById('students-remaining').textContent = availableCount;
    document.getElementById('calls-today').textContent = callsToday;
}

function previousSubject() {
    const subjects = getAllSubjects();
    if (subjects.length === 0) return;
    currentSubjectIndex = (currentSubjectIndex - 1 + subjects.length) % subjects.length;
    updateSubjectDisplay();
}

function nextSubject() {
    const subjects = getAllSubjects();
    if (subjects.length === 0) return;
    currentSubjectIndex = (currentSubjectIndex + 1) % subjects.length;
    updateSubjectDisplay();
}

function updateSubjectDisplay() {
    const subjects = getAllSubjects();
    const currentSubject = getCurrentSubject();
    
    if (subjects.length > 0) {
        document.getElementById('current-subject-display').textContent = subjects[currentSubjectIndex].subject;
    } else {
        document.getElementById('current-subject-display').textContent = currentSubject;
    }
}

// ======================
// CONNECTIONS FUNCTIONS
// ======================

function refreshPrompt() {
    if (usedPrompts.length >= mgcPrompts.length) {
        usedPrompts = [];
    }
    
    const availablePrompts = mgcPrompts
        .map((prompt, index) => index)
        .filter(index => !usedPrompts.includes(index));
    
    const randomIndex = Math.floor(Math.random() * availablePrompts.length);
    currentPromptIndex = availablePrompts[randomIndex];
    usedPrompts.push(currentPromptIndex);
    
    document.getElementById('prompt-text').textContent = mgcPrompts[currentPromptIndex];
}

function renderConnectionsList() {
    const list = document.getElementById('connections-list');
    const empty = document.getElementById('connections-empty');
    const promptSection = document.getElementById('prompt-section');

    if (students.length === 0) {
        empty.style.display = 'block';
        list.innerHTML = '';
        promptSection.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    promptSection.style.display = 'block';

    if (!document.getElementById('prompt-text').textContent) {
        refreshPrompt();
    }

    // Sort by days since last MGC
    const sortedStudents = [...students].map((student, index) => ({
        student,
        index,
        daysSince: getDaysSinceLastMGC(student)
    })).sort((a, b) => {
        if (a.daysSince === null && b.daysSince === null) return 0;
        if (a.daysSince === null) return -1;
        if (b.daysSince === null) return 1;
        return b.daysSince - a.daysSince;
    });

    list.innerHTML = sortedStudents.map(({ student, index, daysSince }) => {
        // Ensure connections exist
        if (!student.connections) {
            student.connections = {
                totalMGCs: 0,
                mgcHistory: [],
                lastConnection: null,
                daysSinceLastMGC: null
            };
        }

        const totalMGCs = student.connections.totalMGCs || 0;
        const indicatorClass = daysSince === null ? 'needs-attention' : 
                              daysSince === 0 ? 'recent' :
                              daysSince <= 3 ? 'moderate' : 'needs-attention';
        const indicatorText = daysSince === null ? 'No MGCs yet' :
                             daysSince === 0 ? 'Today!' :
                             daysSince === 1 ? 'Yesterday' :
                             `${daysSince} days ago`;

        // Get today's note
        const today = new Date().toISOString().split('T')[0];
        const todayMGC = student.connections.mgcHistory.find(mgc => mgc.date === today);
        const todayNote = todayMGC ? todayMGC.note : '';

        // Get last historical note
        const historicalMGCs = student.connections.mgcHistory.filter(mgc => mgc.date !== today);
        const lastHistoricalNote = historicalMGCs.length > 0 ? historicalMGCs[historicalMGCs.length - 1].note : '';

        return `
            <div class="student-row">
                <div class="student-row-top">
                    <div class="student-row-name">
                        ${student.name}
                        <div 
                            class="student-goal" 
                            contenteditable="true" 
                            id="student-goal-${index}"
                            data-placeholder="goal"
                            onblur="saveStudentGoal(${index})"
                        >${student.goal || ''}</div>
                    </div>
                    <div class="student-row-stats">
                        <div class="stat-line">${totalMGCs} connection${totalMGCs !== 1 ? 's' : ''}</div>
                        <div class="days-indicator ${indicatorClass}">${indicatorText}</div>
                    </div>
                    <div>
                        <button data-action="view-history" data-index="${index}" class="secondary" style="padding: 0.35rem 0.75rem; font-size: 0.85rem;" title="View full history">
                            <span class="icon" data-tooltip="History">☰</span>
                        </button>
                    </div>
                </div>
                <div 
                    class="student-row-input" 
                    contenteditable="true" 
                    id="mgc-note-${index}"
                    data-placeholder="Click to add today's connection note..."
                    onblur="saveTodayNote(${index})"
                >${todayNote}</div>
                ${lastHistoricalNote ? `<div class="last-note">Last: ${lastHistoricalNote}</div>` : ''}
            </div>
        `;
    }).join('');
}

function saveTodayNote(studentIndex) {
    const student = students[studentIndex];
    const noteDiv = document.getElementById(`mgc-note-${studentIndex}`);
    const note = noteDiv.textContent.trim();
    
    if (!student.connections) {
        student.connections = {
            totalMGCs: 0,
            mgcHistory: [],
            lastConnection: null,
            daysSinceLastMGC: null
        };
    }

    const today = new Date().toISOString().split('T')[0];
    const todayMGCIndex = student.connections.mgcHistory.findIndex(mgc => mgc.date === today);

    if (todayMGCIndex !== -1) {
        student.connections.mgcHistory[todayMGCIndex].note = note;
        student.connections.mgcHistory[todayMGCIndex].time = new Date().toTimeString().split(' ')[0];
    } else if (note) {
        student.connections.mgcHistory.push({
            date: today,
            time: new Date().toTimeString().split(' ')[0],
            note: note,
            subject: getCurrentSubject()
        });
        student.connections.totalMGCs++;
        student.connections.lastConnection = today;
    }

    student.connections.daysSinceLastMGC = getDaysSinceLastMGC(student);
    saveData();
}

function saveStudentGoal(studentIndex) {
    const student = students[studentIndex];
    const goalDiv = document.getElementById(`student-goal-${studentIndex}`);
    const newGoal = goalDiv.textContent.trim();
    
    // If there's an existing goal and it's different from the new one, archive it
    if (student.goal && student.goal !== newGoal && student.goal.length > 0) {
        if (!student.goalHistory) {
            student.goalHistory = [];
        }
        student.goalHistory.push({
            goal: student.goal,
            dateSet: student.goalSetDate || null,
            dateCompleted: new Date().toISOString().split('T')[0]
        });
    }
    
    // Set new goal with current date
    student.goal = newGoal;
    student.goalSetDate = new Date().toISOString().split('T')[0];
    
    saveData();
}

function viewHistory(studentIndex) {
    const student = students[studentIndex];
    const modal = document.getElementById('history-modal');
    const modalContent = document.getElementById('modal-content');
    
    document.getElementById('modal-student-name').textContent = student.name + ' - History';

    if (!student.connections || student.connections.mgcHistory.length === 0) {
        modalContent.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No connection history yet.</p>';
    } else {
        const mgcHistory = student.connections.mgcHistory.slice().reverse().map(mgc => {
            const date = new Date(mgc.date + 'T' + mgc.time);
            const dateStr = date.toLocaleDateString('en-NZ', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            return `
                <div class="history-item">
                    <div class="history-date">${dateStr} - ${mgc.subject || 'General'}</div>
                    ${mgc.note ? `<div class="history-note">${mgc.note}</div>` : '<div class="history-note" style="font-style: italic; color: var(--text-secondary);">No notes</div>'}
                </div>
            `;
        }).join('');

        const participationInfo = student.participation ? `
            <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-primary); border-radius: 6px;">
                <h3>Participation</h3>
                <p style="font-size: 0.85rem; margin-top: 0.5rem;">
                    Total Calls: ${student.participation.totalCalls}<br>
                    Correct: ${student.participation.correctAnswers}<br>
                    Incorrect: ${student.participation.incorrectAnswers}<br>
                    Accuracy: ${student.participation.totalCalls > 0 ? Math.round((student.participation.correctAnswers / student.participation.totalCalls) * 100) : 0}%
                </p>
            </div>
        ` : '';

        modalContent.innerHTML = `
            <div class="mgc-history">
                <h3>Connections</h3>
                ${mgcHistory}
            </div>
            ${participationInfo}
        `;
    }

    modal.classList.add('active');
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.remove('active');
}

// ======================
// MANAGE FUNCTIONS
// ======================

function handleStudentUpload() {
    const fileInput = document.getElementById('student-csv');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a CSV file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        let added = 0;
        for (let i = 1; i < lines.length; i++) {
            const [firstname, lastname, grade] = lines[i].split(',').map(s => s.trim());
            if (firstname && lastname) {
                const name = `${firstname} ${lastname}`;
                if (!students.find(s => s.name === name)) {
                    students.push({
                        id: generateId(),
                        name: name,
                        grade: parseInt(grade) || 4,
                        goal: '',
                        goalHistory: [],
                        interests: {
                            extracurriculars: [],
                            strengths: [],
                            notes: ''
                        },
                        participation: {
                            totalCalls: 0,
                            correctAnswers: 0,
                            incorrectAnswers: 0,
                            weight: 1.0,
                            subjectBreakdown: {}
                        },
                        connections: {
                            totalMGCs: 0,
                            mgcHistory: [],
                            lastConnection: null,
                            daysSinceLastMGC: null
                        },
                        absences: []
                    });
                    added++;
                }
            }
        }
        
        saveData();
        renderAll();
        fileInput.value = '';
        alert(`Added ${added} student(s)`);
    };
    
    reader.readAsText(file);
}

function addStudentManually() {
    document.getElementById('add-students-modal').classList.add('active');
    document.getElementById('bulk-student-input').value = '';
    document.getElementById('bulk-student-input').focus();
}

function closeAddStudentsModal() {
    document.getElementById('add-students-modal').classList.remove('active');
}

function processBulkStudents() {
    const textarea = document.getElementById('bulk-student-input');
    const lines = textarea.value.split('\n').filter(line => line.trim());
    
    let added = 0;
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const lastname = parts.pop();
            let grade = 4;
            
            // Check if last part is a number (grade)
            if (!isNaN(lastname)) {
                grade = parseInt(lastname);
                const actualLastname = parts.pop();
                const firstname = parts.join(' ');
                const name = `${firstname} ${actualLastname}`;
                
                if (!students.find(s => s.name === name)) {
                    students.push({
                        id: generateId(),
                        name: name,
                        grade: grade,
                        goal: '',
                        goalHistory: [],
                        interests: {
                            extracurriculars: [],
                            strengths: [],
                            notes: ''
                        },
                        participation: {
                            totalCalls: 0,
                            correctAnswers: 0,
                            incorrectAnswers: 0,
                            weight: 1.0,
                            subjectBreakdown: {}
                        },
                        connections: {
                            totalMGCs: 0,
                            mgcHistory: [],
                            lastConnection: null,
                            daysSinceLastMGC: null
                        },
                        absences: []
                    });
                    added++;
                }
            } else {
                const firstname = parts.join(' ');
                const name = `${firstname} ${lastname}`;
                
                if (!students.find(s => s.name === name)) {
                    students.push({
                        id: generateId(),
                        name: name,
                        grade: 4,
                        goal: '',
                        goalHistory: [],
                        interests: {
                            extracurriculars: [],
                            strengths: [],
                            notes: ''
                        },
                        participation: {
                            totalCalls: 0,
                            correctAnswers: 0,
                            incorrectAnswers: 0,
                            weight: 1.0,
                            subjectBreakdown: {}
                        },
                        connections: {
                            totalMGCs: 0,
                            mgcHistory: [],
                            lastConnection: null,
                            daysSinceLastMGC: null
                        },
                        absences: []
                    });
                    added++;
                }
            }
        }
    });

    saveData();
    renderAll();
    closeAddStudentsModal();
    alert(`Added ${added} student(s)`);
}

function downloadStudentTemplate() {
    const csv = 'firstname,lastname,grade\nJohn,Smith,4\nJane,Doe,5';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function deleteStudent(studentId) {
    if (!confirm('Delete this student? This cannot be undone.')) return;
    students = students.filter(s => s.id !== studentId);
    saveData();
    renderAll();
}

function deleteAllStudents() {
    if (!confirm('Delete ALL students? This cannot be undone.')) return;
    students = [];
    saveData();
    renderAll();
}

function renderStudentListManage() {
    const list = document.getElementById('student-list-manage');
    
    if (students.length === 0) {
        list.innerHTML = '<div class="empty-state">No students yet. Upload a CSV or add manually.</div>';
        return;
    }

    list.innerHTML = students.map(student => {
        const isAbsent = absentToday.includes(student.id);
        const weight = calculateWeight(student).toFixed(2);
        
        return `
            <div class="student-manage-item" style="${isAbsent ? 'opacity: 0.6; background: #fee2e2;' : ''}">
                <div class="student-manage-info">
                    <div class="student-manage-name">${student.name}</div>
                    <div class="student-manage-meta">
                        Grade ${student.grade} | 
                        Calls: ${student.participation.totalCalls} | 
                        MGCs: ${student.connections.totalMGCs} |
                        Weight: ${weight}
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button 
                        data-action="toggle-absent-status" data-student-id="${student.id}" 
                        class="${isAbsent ? 'success' : 'warning'}" 
                        style="padding: 0.35rem 0.75rem; font-size: 0.85rem;"
                        title="${isAbsent ? 'Mark present' : 'Mark absent'}">
                        <span class="icon" data-tooltip="${isAbsent ? 'Present' : 'Absent'}">${isAbsent ? '✓' : '⊘'}</span>
                    </button>
                    <button data-action="delete-student" data-student-id="${student.id}" class="danger" style="padding: 0.35rem 0.75rem; font-size: 0.85rem;">
                        <span class="icon" data-tooltip="Delete">✕</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleAbsentStatus(studentId) {
    const index = absentToday.indexOf(studentId);
    if (index === -1) {
        absentToday.push(studentId);
    } else {
        absentToday.splice(index, 1);
    }
    saveData();
    renderStudentListManage();
    updateSessionInfo();
}

// ======================
// SCHEDULE FUNCTIONS
// ======================

function switchScheduleDay(day) {
    currentScheduleDay = day;
    
    document.querySelectorAll('.schedule-day-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-day="${day}"]`).classList.add('active');
    
    renderScheduleList();
}

function openAddScheduleModal() {
    document.getElementById('add-schedule-modal').style.display = 'flex';
    document.getElementById('bulk-schedule-input').value = '';
    document.getElementById('bulk-schedule-input').focus();
}

function closeAddScheduleModal() {
    document.getElementById('add-schedule-modal').style.display = 'none';
}

function processBulkSchedule() {
    const input = document.getElementById('bulk-schedule-input').value;
    const lines = input.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        alert('Please enter at least one schedule period');
        return;
    }

    let addedCount = 0;
    
    for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        
        if (parts.length === 3) {
            const [subject, start_time, end_time] = parts;
            
            if (subject && start_time && end_time) {
                schedules[currentScheduleDay].push({
                    subject,
                    start_time,
                    end_time
                });
                addedCount++;
            }
        }
    }

    saveData();
    renderScheduleList();
    closeAddScheduleModal();
    
    if (addedCount > 0) {
        alert(`Added ${addedCount} period(s) to ${currentScheduleDay}`);
    } else {
        alert('No valid periods found. Check format: Subject, HH:MM, HH:MM');
    }
}

function openUploadScheduleModal() {
    document.getElementById('upload-schedule-modal').style.display = 'flex';
    document.getElementById('schedule-csv-input').value = '';
}

function closeUploadScheduleModal() {
    document.getElementById('upload-schedule-modal').style.display = 'none';
}

function processScheduleCSV() {
    const fileInput = document.getElementById('schedule-csv-input');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a CSV file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            alert('CSV file is empty or invalid');
            return;
        }

        // Clear all schedules first
        schedules = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: []
        };

        let addedCount = 0;
        const dayMap = {
            'monday': 'monday',
            'tuesday': 'tuesday',
            'wednesday': 'wednesday',
            'thursday': 'thursday',
            'friday': 'friday'
        };

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim());
            
            if (parts.length === 4) {
                const [day, subject, start_time, end_time] = parts;
                const dayKey = dayMap[day.toLowerCase()];
                
                if (dayKey && subject && start_time && end_time) {
                    schedules[dayKey].push({
                        subject,
                        start_time,
                        end_time
                    });
                    addedCount++;
                }
            }
        }
        
        saveData();
        renderScheduleList();
        closeUploadScheduleModal();
        
        if (addedCount > 0) {
            alert(`Uploaded ${addedCount} period(s) across the week`);
        } else {
            alert('No valid periods found. Check format: Day, Subject, HH:MM, HH:MM');
        }
    };
    
    reader.readAsText(file);
}

function downloadScheduleTemplate() {
    const csv = 'Day,Subject,Start Time,End Time\nMonday,Mathematics,09:00,10:00\nMonday,Reading,10:00,11:00\nTuesday,Science,09:00,10:00';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'week-schedule-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function deletePeriod(index) {
    schedules[currentScheduleDay].splice(index, 1);
    saveData();
    renderScheduleList();
}

function deleteDaySchedule() {
    if (!confirm(`Delete ${currentScheduleDay}'s schedule? This cannot be undone.`)) return;
    schedules[currentScheduleDay] = [];
    saveData();
    renderScheduleList();
}

function clearWeekSchedule() {
    if (!confirm('Clear the ENTIRE WEEK schedule? This cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? All schedules for Monday-Friday will be deleted.')) return;
    
    schedules = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: []
    };
    
    saveData();
    renderScheduleList();
    alert('All week schedules cleared.');
}

function renderScheduleList() {
    const list = document.getElementById('schedule-list');
    const daySchedule = schedules[currentScheduleDay];
    
    if (!daySchedule || daySchedule.length === 0) {
        list.innerHTML = '<div class="empty-state">No schedule for this day yet.</div>';
        return;
    }

    list.innerHTML = daySchedule.map((period, index) => `
        <div class="schedule-item">
            <div>
                <strong>${period.subject}</strong><br>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">${period.start_time} - ${period.end_time}</span>
            </div>
            <button data-action="delete-period" data-index="${index}" class="danger" style="padding: 0.35rem 0.75rem; font-size: 0.85rem;">
                <span class="icon" data-tooltip="Delete">✕</span>
            </button>
        </div>
    `).join('');
}

// ======================
// METADATA FUNCTIONS
// ======================

function saveMetadata() {
    metadata.schoolYear = document.getElementById('metadata-school-year').value || "2024-2025";
    metadata.term = document.getElementById('metadata-term').value || "Term 4";
    metadata.teacher = document.getElementById('metadata-teacher').value || "";
    metadata.class = document.getElementById('metadata-class').value || "Year 4-5";
    
    saveData();
    alert('Class information saved!');
}

function loadMetadataForm() {
    document.getElementById('metadata-school-year').value = metadata.schoolYear || "2024-2025";
    document.getElementById('metadata-term').value = metadata.term || "Term 4";
    document.getElementById('metadata-teacher').value = metadata.teacher || "";
    document.getElementById('metadata-class').value = metadata.class || "Year 4-5";
}

// ======================
// EXPORT FUNCTIONS
// ======================

function exportJSON() {
    const data = {
        students: students,
        schedules: schedules,
        metadata: {
            schoolYear: metadata.schoolYear,
            term: metadata.term,
            teacher: metadata.teacher,
            class: metadata.class,
            exportDate: new Date().toISOString().split('T')[0]
        }
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-tracker-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function exportCSV() {
    const csv = ['Name,Grade,Goal,Total Calls,Correct,Incorrect,Accuracy,Total MGCs,Last MGC,Days Since MGC'];
    
    students.forEach(student => {
        const p = student.participation;
        const c = student.connections;
        const accuracy = p.totalCalls > 0 ? Math.round((p.correctAnswers / p.totalCalls) * 100) : 0;
        
        csv.push([
            student.name,
            student.grade,
            student.goal || '',
            p.totalCalls,
            p.correctAnswers,
            p.incorrectAnswers,
            accuracy + '%',
            c.totalMGCs,
            c.lastConnection || 'Never',
            c.daysSinceLastMGC !== null ? c.daysSinceLastMGC : 'N/A'
        ].join(','));
    });

    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-tracker-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function exportMarkdown() {
    let md = `# Student Tracker Report\n\n`;
    md += `**Date:** ${new Date().toLocaleDateString('en-NZ')}\n`;
    if (metadata.schoolYear) md += `**School Year:** ${metadata.schoolYear}\n`;
    if (metadata.term) md += `**Term:** ${metadata.term}\n`;
    if (metadata.teacher) md += `**Teacher:** ${metadata.teacher}\n`;
    if (metadata.class) md += `**Class:** ${metadata.class}\n`;
    md += `**Total Students:** ${students.length}\n\n`;

    md += `## Student Summary\n\n`;
    students.forEach(student => {
        const p = student.participation;
        const c = student.connections;
        const accuracy = p.totalCalls > 0 ? Math.round((p.correctAnswers / p.totalCalls) * 100) : 0;

        md += `### ${student.name} (Grade ${student.grade})\n`;
        if (student.goal) md += `**Current Goal:** ${student.goal}\n`;
        md += `**Participation:** ${p.totalCalls} calls, ${accuracy}% accuracy\n`;
        md += `**Connections:** ${c.totalMGCs} MGCs, last ${c.daysSinceLastMGC !== null ? c.daysSinceLastMGC + ' days ago' : 'never'}\n`;
        
        // Add goal history if exists
        if (student.goalHistory && student.goalHistory.length > 0) {
            md += `\n**Previous Goals:**\n`;
            student.goalHistory.forEach((historyItem, i) => {
                md += `${i + 1}. ${historyItem.goal}`;
                if (historyItem.dateSet) md += ` (Set: ${historyItem.dateSet})`;
                if (historyItem.dateCompleted) md += ` (Completed: ${historyItem.dateCompleted})`;
                md += `\n`;
            });
        }
        md += `\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-tracker-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function resetWeights() {
    if (!confirm('Reset all participation weights? This will not delete data.')) return;
    students.forEach(s => {
        if (s.participation) {
            s.participation.weight = 1.0;
            // Also reset all calls to truly reset weights
            s.participation.totalCalls = 0;
            s.participation.correctAnswers = 0;
            s.participation.incorrectAnswers = 0;
            s.participation.subjectBreakdown = {};
        }
    });
    callsToday = 0;
    saveData();
    renderStudentListManage();
    updateSessionInfo();
    updateSummaryStats();
    alert('Weights and participation data reset!');
}

function clearAllData() {
    if (!confirm('DELETE ALL DATA? This cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? This will delete students, participation, connections, and schedules.')) return;
    
    students = [];
    schedules = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] };
    absentToday = [];
    sessionPool = [];
    gradeFilter = 'all';
    callsToday = 0;
    
    localStorage.clear();
    renderAll();
    alert('All data cleared.');
}

function updateSummaryStats() {
    const stats = document.getElementById('summary-stats');
    
    const totalCalls = students.reduce((sum, s) => sum + s.participation.totalCalls, 0);
    const totalMGCs = students.reduce((sum, s) => sum + s.connections.totalMGCs, 0);
    const avgAccuracy = students.length > 0 ? 
        students.reduce((sum, s) => {
            const acc = s.participation.totalCalls > 0 ? (s.participation.correctAnswers / s.participation.totalCalls) : 0;
            return sum + acc;
        }, 0) / students.length : 0;

    stats.innerHTML = `
        <div class="info-cards">
            <div class="info-card">
                <div class="info-label">Total Students</div>
                <div class="info-value">${students.length}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Total Calls</div>
                <div class="info-value">${totalCalls}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Total MGCs</div>
                <div class="info-value">${totalMGCs}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Avg Accuracy</div>
                <div class="info-value">${Math.round(avgAccuracy * 100)}%</div>
            </div>
        </div>
    `;
}

// ======================
// KEYBOARD SHORTCUTS
// ======================

document.addEventListener('keydown', function(e) {
    if (e.altKey && e.shiftKey) {
        if (e.key === 'S' || e.key === 's') {
            e.preventDefault();
            selectStudent();
        } else if (e.key === 'C' || e.key === 'c') {
            e.preventDefault();
            if (!document.getElementById('btn-correct').disabled) {
                markCorrect();
            }
        } else if (e.key === 'X' || e.key === 'x') {
            e.preventDefault();
            if (!document.getElementById('btn-incorrect').disabled) {
                markIncorrect();
            }
        } else if (e.key === 'G' || e.key === 'g') {
            e.preventDefault();
            toggleGradeFilter();
        } else if (e.key === 'A' || e.key === 'a') {
            e.preventDefault();
            if (!document.getElementById('btn-absent').disabled) {
                markAbsent();
            }
        }
    }
});

// Close modal when clicking outside
document.getElementById('history-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeHistoryModal();
    }
});

document.getElementById('add-students-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAddStudentsModal();
    }
});

document.getElementById('add-schedule-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAddScheduleModal();
    }
});

document.getElementById('upload-schedule-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeUploadScheduleModal();
    }
});

// ======================
// EVENT DELEGATION SYSTEM
// ======================

document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const studentId = target.dataset.studentId;
    const tab = target.dataset.tab;
    const day = target.dataset.day;
    const index = target.dataset.index;

    // Tab switching
    if (action === 'switch-tab') switchMainTab(tab);
    else if (action === 'switch-schedule-day') switchScheduleDay(day);

    // Session actions
    else if (action === 'select-student') selectStudent();
    else if (action === 'mark-correct') markCorrect();
    else if (action === 'mark-incorrect') markIncorrect();
    else if (action === 'mark-absent') markAbsent();
    else if (action === 'toggle-grade-filter') toggleGradeFilter();
    else if (action === 'previous-subject') previousSubject();
    else if (action === 'next-subject') nextSubject();
    else if (action === 'refresh-prompt') refreshPrompt();

    // Connection actions
    else if (action === 'open-connection-modal') openConnectionModal(studentId);
    else if (action === 'save-connection') saveConnection();
    else if (action === 'close-connection-modal') closeConnectionModal();
    else if (action === 'render-connections') renderConnectionsList();

    // Interest actions
    else if (action === 'open-interest-modal') openInterestModal(studentId);
    else if (action === 'save-interest') saveInterest();
    else if (action === 'close-interest-modal') closeInterestModal();
    else if (action === 'edit-interests') editInterests(parseInt(index));
    else if (action === 'save-interests') saveInterests(parseInt(index));
    else if (action === 'view-history') viewHistory(parseInt(index));

    // History modal
    else if (action === 'open-history-modal') openHistoryModal(studentId);
    else if (action === 'close-history-modal') closeHistoryModal();

    // Student management modals
    else if (action === 'open-add-students-modal') openAddStudentsModal();
    else if (action === 'close-add-students-modal') closeAddStudentsModal();
    else if (action === 'process-bulk-students') processBulkStudents();
    else if (action === 'handle-student-upload') handleStudentUpload();
    else if (action === 'add-student-manually') addStudentManually();
    else if (action === 'download-student-template') downloadStudentTemplate();
    else if (action === 'delete-all-students') deleteAllStudents();
    else if (action === 'toggle-absent-status') toggleAbsentStatus(studentId);

    // Schedule modals
    else if (action === 'open-add-schedule-modal') openAddScheduleModal();
    else if (action === 'close-add-schedule-modal') closeAddScheduleModal();
    else if (action === 'process-bulk-schedule') processBulkSchedule();
    else if (action === 'open-upload-schedule-modal') openUploadScheduleModal();
    else if (action === 'close-upload-schedule-modal') closeUploadScheduleModal();
    else if (action === 'process-schedule-csv') processScheduleCSV();
    else if (action === 'download-schedule-template') downloadScheduleTemplate();
    else if (action === 'delete-day-schedule') deleteDaySchedule();
    else if (action === 'clear-week-schedule') clearWeekSchedule();

    // Student edit/delete
    else if (action === 'edit-student') editStudent(studentId);
    else if (action === 'delete-student') deleteStudent(studentId);

    // Period delete
    else if (action === 'delete-period') deletePeriod(parseInt(index));

    // Export actions
    else if (action === 'save-metadata') saveMetadata();
    else if (action === 'export-json') exportJSON();
    else if (action === 'export-csv') exportCSV();
    else if (action === 'export-markdown') exportMarkdown();
    else if (action === 'reset-weights') resetWeights();
    else if (action === 'clear-all-data') clearAllData();
});


// ======================
// STORAGE SYNC
// ======================

// Listen for changes from popup or other sources
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
        // Update students array if changed
        if (changes.students) {
            students = changes.students.newValue || [];
            renderStudentListManage();
            updateSessionInfo();
            updateSummaryStats();
        }
        
        // Update schedules if changed
        if (changes.schedules) {
            schedules = changes.schedules.newValue || {};
            renderScheduleList();
        }
        
        // Update absent list if changed
        if (changes.absentToday) {
            absentToday = changes.absentToday.newValue || [];
            updateSessionInfo();
        }
        
        // Update grade filter if changed
        if (changes.gradeFilter) {
            gradeFilter = changes.gradeFilter.newValue || 'all';
            updateSessionInfo();
        }
        
        // Update callsToday if changed
        if (changes.callsToday) {
            callsToday = changes.callsToday.newValue || 0;
            updateSessionInfo();
        }
        
        // Update session pool if changed
        if (changes.sessionPool) {
            sessionPool = changes.sessionPool.newValue || [];
            updateSessionInfo();
        }
        
        // Update current student if changed
        if (changes.currentStudent) {
            currentStudent = changes.currentStudent.newValue || null;
            if (currentStudent) {
                document.getElementById('current-student-display').innerHTML = 
                    `<div class="current-student-name">${currentStudent.name}</div>`;
            }
        }
    }
});

// ======================
// INITIALIZATION
// ======================

loadData();
