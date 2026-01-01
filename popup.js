// Quick popup for session tracking

let currentStudent = null;

// Load data and update UI
function loadData() {
    chrome.storage.local.get(['currentStudent', 'gradeFilter', 'sessionPool', 'students', 'absentToday'], (result) => {
        currentStudent = result.currentStudent || null;
        const gradeFilter = result.gradeFilter || 'all';
        const sessionPool = result.sessionPool || [];
        const students = result.students || [];
        const absentToday = result.absentToday || [];

        // Update grade filter display
        updateGradeFilterDisplay(gradeFilter);

        // Update current student display
        if (currentStudent) {
            document.getElementById('selected-student').textContent = currentStudent.name;
            document.getElementById('btn-correct').disabled = false;
            document.getElementById('btn-incorrect').disabled = false;
        } else {
            document.getElementById('selected-student').innerHTML = 'Click button or press<br>Alt+Shift+S';
            document.getElementById('btn-correct').disabled = true;
            document.getElementById('btn-incorrect').disabled = true;
        }

        // Update pool remaining
        let filteredStudents = students;
        if (gradeFilter !== 'all') {
            filteredStudents = students.filter(s => s.grade === parseInt(gradeFilter));
        }
        filteredStudents = filteredStudents.filter(s => !absentToday.includes(s.id));
        
        const poolCount = sessionPool.filter(id => 
            filteredStudents.some(s => s.id === id)
        ).length;
        
        document.getElementById('pool-remaining').textContent = poolCount;

        // Update current subject
        getCurrentSubject();
    });
}

function updateGradeFilterDisplay(filter) {
    const filterDisplay = {
        'all': 'Grade Filter: All Students',
        '4': 'Grade Filter: Year 4 Only',
        '5': 'Grade Filter: Year 5 Only'
    };
    document.getElementById('grade-filter-display').textContent = filterDisplay[filter] || filterDisplay['all'];
}

function getCurrentSubject() {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    chrome.storage.local.get(['schedules'], (result) => {
        const schedules = result.schedules || {};
        const todaySchedule = schedules[currentDay] || [];

        for (const period of todaySchedule) {
            const [startHour, startMin] = period.start_time.split(':').map(Number);
            const [endHour, endMin] = period.end_time.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                document.getElementById('current-subject').textContent = period.subject;
                return;
            }
        }

        document.getElementById('current-subject').textContent = 'Auto-detect';
    });
}

// Event listeners
document.getElementById('btn-select').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'selectStudent' });
    setTimeout(loadData, 100);
});

document.getElementById('btn-toggle-grade').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'toggleGradeFilter' });
    setTimeout(loadData, 100);
});

document.getElementById('btn-correct').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'markCorrect' });
    setTimeout(loadData, 100);
});

document.getElementById('btn-incorrect').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'markIncorrect' });
    setTimeout(loadData, 100);
});

document.getElementById('btn-open-sidebar').addEventListener('click', () => {
    // Open sidebar panel
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId });
        }
    });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        loadData();
    }
});

// Initialize
loadData();
