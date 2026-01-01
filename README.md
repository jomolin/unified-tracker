# Student Tracker - Unified Extension

One extension with **both** popup and sidebar, sharing real-time data.

## Features

### Popup (Quick Session Tracking)
- **Global hotkeys** that work anywhere:
  - `Alt+Shift+S` - Select random student
  - `Alt+Shift+C` - Mark correct
  - `Alt+Shift+X` - Mark incorrect
  - `Alt+Shift+G` - Toggle grade filter
- **Student overlay** - Shows student name on screen (visible when casting)
- **Quick session** - Fast participation tracking
- Opens by clicking extension icon

### Sidebar (Detailed Tracking)
- **Meaningful connections** - Log MGCs with dates and notes
- **Interests tracking** - Record extracurriculars, hobbies, strengths
- **Student goals** - Set and track individual goals
- **Subject breakdown** - See performance by subject
- **Weekly schedule** - Manage class schedule
- **Data export** - JSON, CSV, and Markdown
- **NOT visible when casting** - Private teacher view

### Shared Data
Both popup and sidebar access the same data in real-time:
- Student list
- Participation records
- Schedule
- Absent list
- Grade filter

Changes in one are instantly reflected in the other.

## Installation

1. Extract this folder
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right)
4. Click "Load unpacked"
5. Select the `unified-tracker` folder

## Usage

### Quick Session (Popup)
1. Click extension icon → popup opens
2. Click "Select Random Student" or press `Alt+Shift+S`
3. Student name appears on screen overlay
4. Press `Alt+Shift+C` for correct or `Alt+Shift+X` for incorrect
5. Continue teaching - hotkeys work from any tab

### Detailed Tracking (Sidebar)
1. Right-click extension icon → "Open side panel"
2. Or click "Open Full Tracker" button in popup
3. Sidebar opens on the right side
4. Log MGCs, update interests, view reports
5. Sidebar stays open while you work

### When Casting/Sharing Screen
- **Students see**: The overlay showing selected student name
- **Students DON'T see**: Sidebar (it's separate from tab content)
- **You see**: Both the cast content AND your private sidebar

## Data Structure

Students have rich data:
```javascript
{
  id: "unique_id",
  name: "Student Name",
  grade: 4,
  goal: "Improve reading fluency",
  participation: {
    totalCalls: 25,
    correctAnswers: 20,
    incorrectAnswers: 5,
    weight: 0.8,
    subjectBreakdown: {
      "Mathematics": { correct: 8, incorrect: 2 },
      "Reading": { correct: 12, incorrect: 3 }
    }
  },
  connections: {
    totalMGCs: 5,
    lastConnection: "2024-12-27",
    daysSinceLastMGC: 0,
    history: [
      { date: "2024-12-27", note: "..." },
      ...
    ]
  },
  interests: {
    extracurriculars: "Swimming, piano",
    hobbies: "Drawing, reading",
    strengths: "Creative writing",
    notes: "Loves animals..."
  }
}
```

## Tips

- **Add students**: Use sidebar → Manage tab → upload CSV or add manually
- **Set up schedule**: Sidebar → Manage tab → upload week schedule
- **Quick tracking**: Use popup + hotkeys during lessons
- **Detailed notes**: Open sidebar when you have time
- **Export data**: Sidebar → Reports tab → Export JSON/CSV/Markdown

## Troubleshooting

**Hotkeys not working?**
- Go to `chrome://extensions/shortcuts`
- Verify shortcuts are configured
- Try changing them if they conflict

**Sidebar not opening?**
- Right-click extension icon → "Open side panel"
- Or use the button in the popup

**Data not syncing?**
- Both use `chrome.storage.local` - should sync automatically
- Try refreshing both popup and sidebar

## File Structure

```
unified-tracker/
├── manifest.json          # Extension config
├── background.js          # Global hotkeys, student selection logic
├── content.js             # Student overlay on web pages
├── popup.html             # Quick session UI
├── popup.js               # Popup logic
├── sidebar.html           # Detailed tracking UI
├── sidebar.js             # Sidebar logic
└── icons/                 # Extension icons
```

## Credits

Created for classroom participation tracking with privacy in mind.
