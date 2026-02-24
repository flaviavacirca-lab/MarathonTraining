/**
 * Marathon Training Plan - Main Application
 *
 * Handles UI rendering, state management, localStorage persistence,
 * and user interactions.
 */

const App = (() => {
    // State
    let plan = null;
    let logData = {};
    let profile = {};
    let currentView = 'dashboard';
    let selectedWeek = null;

    const STORAGE_KEY = 'marathon_training_plan';

    /**
     * Initialize the application.
     */
    function init() {
        loadState();
        if (!plan) {
            // Default profile based on user's info
            profile = {
                halfMarathonMinutes: 112, // 1:52
                currentMpw: 20,
                runsPerWeek: 5,
                raceDate: getDefaultRaceDate(),
                goalType: 'time',
                targetTimeMinutes: 240, // 4:00:00
                units: 'miles',
            };
            plan = TrainingPlan.generate(profile);
            saveState();
        }

        setupEventListeners();
        renderCurrentView();
    }

    /**
     * Get a default race date ~18 weeks from now (next Saturday).
     */
    function getDefaultRaceDate() {
        const d = new Date();
        d.setDate(d.getDate() + 18 * 7);
        // Move to next Sunday
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0) d.setDate(d.getDate() + (7 - dayOfWeek));
        return d.toISOString().split('T')[0];
    }

    // -------------------------
    // State Management
    // -------------------------

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const state = JSON.parse(saved);
                plan = state.plan || null;
                logData = state.logData || {};
                profile = state.profile || {};
            }
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, logData, profile }));
        } catch (e) {
            console.error('Failed to save state:', e);
        }
    }

    // -------------------------
    // Event Listeners
    // -------------------------

    function setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentView = btn.dataset.view;
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderCurrentView();
            });
        });

        // Settings form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveSettings();
        });

        // Goal type toggle
        document.getElementById('goal-type').addEventListener('change', (e) => {
            document.getElementById('target-time-group').style.display =
                e.target.value === 'time' ? '' : 'none';
        });

        // Modal close
        document.querySelector('.modal-close').addEventListener('click', closeModal);
        document.querySelector('.modal-overlay').addEventListener('click', closeModal);

        // Log run form
        document.getElementById('log-run-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveRunLog();
        });

        // Skip workout
        document.getElementById('skip-workout-btn').addEventListener('click', skipWorkout);

        // RPE slider display
        document.getElementById('log-rpe').addEventListener('input', (e) => {
            document.getElementById('rpe-display').textContent = e.target.value;
        });

        // Export buttons
        document.getElementById('export-next-garmin').addEventListener('click', exportNextRun);
        document.getElementById('export-week-garmin').addEventListener('click', exportCurrentWeek);
        document.getElementById('export-all-ics').addEventListener('click', () => GarminExport.downloadICS(plan));
        document.getElementById('export-workout-garmin').addEventListener('click', exportModalWorkout);

        // Data management
        document.getElementById('export-data').addEventListener('click', exportAllData);
        document.getElementById('import-data').addEventListener('change', importData);
        document.getElementById('reset-data').addEventListener('click', resetData);

        // Plan phase filter
        document.getElementById('plan-phase-filter').addEventListener('change', () => renderPlanView());
    }

    // -------------------------
    // Rendering
    // -------------------------

    function renderCurrentView() {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${currentView}-view`).classList.add('active');

        switch (currentView) {
            case 'dashboard': renderDashboard(); break;
            case 'plan': renderPlanView(); break;
            case 'log': renderLogView(); break;
            case 'settings': renderSettingsView(); break;
        }
    }

    function renderDashboard() {
        if (!plan) return;

        const today = new Date().toISOString().split('T')[0];
        const currentWeek = getCurrentWeek(today);
        const adaptation = Adaptations.analyze(plan, logData);

        // Summary stats
        document.getElementById('current-week').textContent = currentWeek ? `${currentWeek.weekNum}` : '--';
        document.getElementById('current-phase').textContent = currentWeek ? currentWeek.phaseName : '--';
        document.getElementById('weeks-to-race').textContent = weeksUntilRace(today);

        const totalMilesLogged = Object.values(logData)
            .filter(e => e && e.completed && e.actualDistance)
            .reduce((sum, e) => sum + e.actualDistance, 0);
        document.getElementById('total-miles-logged').textContent = Math.round(totalMilesLogged * 10) / 10;

        // This week schedule
        renderThisWeek(currentWeek, today);

        // Pace zones
        renderPaceZones();

        // Mileage chart
        renderMileageChart();

        // Fitness trend
        renderFitnessTrend(adaptation);

        // Next run
        renderNextRun(today);
    }

    function getCurrentWeek(today) {
        if (!plan) return null;
        for (const week of plan.weeks) {
            const weekEnd = new Date(week.startDate);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (today >= week.startDate && today <= weekEnd.toISOString().split('T')[0]) {
                return week;
            }
        }
        // If before plan start, return week 1
        if (today < plan.weeks[0].startDate) return plan.weeks[0];
        // If after plan end, return last week
        return plan.weeks[plan.weeks.length - 1];
    }

    function weeksUntilRace(today) {
        if (!plan || !plan.raceDate) return '--';
        const race = new Date(plan.raceDate);
        const now = new Date(today);
        const diff = Math.ceil((race - now) / (7 * 24 * 60 * 60 * 1000));
        return Math.max(0, diff);
    }

    function renderThisWeek(week, today) {
        const container = document.getElementById('this-week-schedule');
        if (!week) {
            container.innerHTML = '<p>No active week found.</p>';
            return;
        }

        const adjustedWeek = Adaptations.applyToWeek(week, Adaptations.analyze(plan, logData).adjustments);

        container.innerHTML = adjustedWeek.days.map(day => {
            const key = `${week.weekNum}-${day.dayName}`;
            const log = logData[key];
            const isToday = day.date === today;
            const isPast = day.date < today;
            let status = '';
            if (log && log.completed) status = 'completed';
            else if (log && log.skipped) status = 'skipped';
            else if (isPast) status = 'missed';

            return `
                <div class="day-row ${isToday ? 'today' : ''} ${status}" data-week="${week.weekNum}" data-day="${day.dayName}">
                    <span class="day-name">${day.dayName.substring(0, 3)}</span>
                    <span class="day-workout">${day.title}</span>
                    <span class="day-distance">${day.distance > 0 ? day.distance + 'mi' : '--'}</span>
                    <span class="day-status">${getStatusIcon(status)}</span>
                </div>
            `;
        }).join('');

        // Click handlers for each day
        container.querySelectorAll('.day-row').forEach(row => {
            row.addEventListener('click', () => {
                const weekNum = parseInt(row.dataset.week);
                const dayName = row.dataset.day;
                openWorkoutModal(weekNum, dayName);
            });
        });
    }

    function getStatusIcon(status) {
        switch (status) {
            case 'completed': return '<span class="icon-done">&#10003;</span>';
            case 'skipped': return '<span class="icon-skip">&#10005;</span>';
            case 'missed': return '<span class="icon-missed">&#9679;</span>';
            default: return '';
        }
    }

    function renderPaceZones() {
        if (!plan) return;
        const zones = plan.paceZones;
        const container = document.getElementById('pace-zones');

        const zoneList = [
            zones.recovery, zones.easy, zones.longRun,
            zones.marathon, zones.tempo, zones.interval,
        ];

        container.innerHTML = zoneList.map(zone => `
            <div class="pace-zone-row">
                <span class="zone-label">${zone.label}</span>
                <span class="zone-pace">${TrainingPlan.formatPace(zone.low)} - ${TrainingPlan.formatPace(zone.high)}/mi</span>
            </div>
        `).join('');
    }

    function renderMileageChart() {
        const container = document.getElementById('mileage-chart');
        if (!plan) return;

        const maxMiles = Math.max(...plan.weeks.map(w => w.targetMiles));

        container.innerHTML = `
            <div class="bar-chart">
                ${plan.weeks.map(week => {
                    const loggedMiles = getWeekLoggedMiles(week.weekNum);
                    const targetHeight = (week.targetMiles / maxMiles) * 100;
                    const loggedHeight = (loggedMiles / maxMiles) * 100;
                    const phaseClass = week.phase;

                    return `
                        <div class="bar-group" title="Week ${week.weekNum}: ${week.targetMiles}mi planned, ${loggedMiles}mi logged">
                            <div class="bar-container">
                                <div class="bar target-bar ${phaseClass}" style="height: ${targetHeight}%"></div>
                                <div class="bar logged-bar" style="height: ${loggedHeight}%"></div>
                            </div>
                            <span class="bar-label">${week.weekNum}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="chart-legend">
                <span class="legend-item"><span class="legend-color target"></span>Planned</span>
                <span class="legend-item"><span class="legend-color logged"></span>Logged</span>
            </div>
        `;
    }

    function getWeekLoggedMiles(weekNum) {
        let total = 0;
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        for (const day of dayNames) {
            const entry = logData[`${weekNum}-${day}`];
            if (entry && entry.completed && entry.actualDistance) {
                total += entry.actualDistance;
            }
        }
        return Math.round(total * 10) / 10;
    }

    function renderFitnessTrend(adaptation) {
        const fill = document.getElementById('fitness-fill');
        const summary = document.getElementById('fitness-summary');
        const notes = document.getElementById('adaptation-notes');

        fill.style.width = `${adaptation.fitnessScore}%`;
        fill.className = 'fitness-fill';
        if (adaptation.trend === 'improving') fill.classList.add('improving');
        else if (adaptation.trend === 'declining' || adaptation.trend === 'overreaching') fill.classList.add('declining');

        summary.textContent = adaptation.summary;

        if (adaptation.adjustments.length > 0) {
            notes.innerHTML = '<h4>Recommendations</h4>' +
                adaptation.adjustments.map(a => `
                    <div class="adaptation-note ${a.severity}">
                        <p>${a.message}</p>
                    </div>
                `).join('');
        } else {
            notes.innerHTML = '';
        }
    }

    function renderNextRun(today) {
        const container = document.getElementById('next-run-details');
        if (!plan) return;

        // Find next unlogged run
        let nextRun = null;
        let nextWeek = null;
        for (const week of plan.weeks) {
            for (const day of week.days) {
                if (day.date >= today && day.distance > 0) {
                    const key = `${week.weekNum}-${day.dayName}`;
                    if (!logData[key] || (!logData[key].completed && !logData[key].skipped)) {
                        nextRun = day;
                        nextWeek = week;
                        break;
                    }
                }
            }
            if (nextRun) break;
        }

        if (!nextRun) {
            container.innerHTML = '<p>No upcoming runs. You did it!</p>';
            return;
        }

        container.innerHTML = `
            <div class="next-run-info">
                <h3>${nextRun.title}</h3>
                <p class="next-run-date">${formatDate(nextRun.date)} &middot; ${nextRun.distance}mi</p>
                <p class="next-run-desc">${nextRun.description}</p>
                ${nextRun.paceTarget ? `<p class="next-run-pace">Target: ${TrainingPlan.formatPaceZone(nextRun.paceTarget)}</p>` : ''}
                ${nextRun.structure ? `
                    <div class="workout-structure">
                        ${nextRun.structure.map(seg => `
                            <div class="structure-segment">
                                <span class="seg-name">${seg.name}</span>
                                <span class="seg-dist">${seg.distance}mi</span>
                                ${seg.pace ? `<span class="seg-pace">${TrainingPlan.formatPaceZone(seg)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        // Store reference for export
        document.getElementById('export-next-garmin').dataset.week = nextWeek.weekNum;
        document.getElementById('export-next-garmin').dataset.day = nextRun.dayName;
    }

    // -------------------------
    // Plan View
    // -------------------------

    function renderPlanView() {
        const container = document.getElementById('plan-weeks');
        const filter = document.getElementById('plan-phase-filter').value;
        const today = new Date().toISOString().split('T')[0];

        let weeks = plan.weeks;
        if (filter !== 'all') {
            weeks = weeks.filter(w => w.phase === filter);
        }

        container.innerHTML = weeks.map(week => {
            const weekEnd = new Date(week.startDate);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const isCurrent = today >= week.startDate && today <= weekEnd.toISOString().split('T')[0];
            const loggedMiles = getWeekLoggedMiles(week.weekNum);

            return `
                <div class="week-card ${isCurrent ? 'current-week' : ''}" data-week="${week.weekNum}">
                    <div class="week-header">
                        <div class="week-title">
                            <h3>Week ${week.weekNum}</h3>
                            <span class="phase-badge ${week.phase}">${week.phaseName}</span>
                        </div>
                        <div class="week-meta">
                            <span>${formatDate(week.startDate)} - ${formatDate(weekEnd.toISOString().split('T')[0])}</span>
                            <span class="week-miles">${week.targetMiles}mi planned${loggedMiles > 0 ? ` / ${loggedMiles}mi logged` : ''}</span>
                        </div>
                        <button class="btn btn-small btn-secondary week-export-btn" data-week="${week.weekNum}">Export Week</button>
                    </div>
                    <div class="week-days">
                        ${week.days.map(day => {
                            const key = `${week.weekNum}-${day.dayName}`;
                            const log = logData[key];
                            let status = '';
                            if (log && log.completed) status = 'completed';
                            else if (log && log.skipped) status = 'skipped';
                            else if (day.date < today && day.distance > 0) status = 'missed';

                            return `
                                <div class="plan-day-row ${status}" data-week="${week.weekNum}" data-day="${day.dayName}">
                                    <span class="plan-day-name">${day.dayName.substring(0, 3)}</span>
                                    <span class="plan-day-date">${formatDateShort(day.date)}</span>
                                    <span class="plan-day-type type-${day.type}">${day.title}</span>
                                    <span class="plan-day-dist">${day.distance > 0 ? day.distance + 'mi' : '--'}</span>
                                    <span class="plan-day-pace">${day.paceTarget ? TrainingPlan.formatPace(day.paceTarget.low) + '/mi' : ''}</span>
                                    <span class="plan-day-status">${getStatusIcon(status)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers
        container.querySelectorAll('.plan-day-row').forEach(row => {
            row.addEventListener('click', () => {
                openWorkoutModal(parseInt(row.dataset.week), row.dataset.day);
            });
        });

        container.querySelectorAll('.week-export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const weekNum = parseInt(btn.dataset.week);
                const week = plan.weeks.find(w => w.weekNum === weekNum);
                if (week) GarminExport.downloadWeekTCX(week);
            });
        });
    }

    // -------------------------
    // Log View
    // -------------------------

    function renderLogView() {
        const entries = [];
        for (const week of plan.weeks) {
            for (const day of week.days) {
                const key = `${week.weekNum}-${day.dayName}`;
                const log = logData[key];
                if (log && (log.completed || log.skipped)) {
                    entries.push({ ...log, weekNum: week.weekNum, day, key });
                }
            }
        }

        entries.sort((a, b) => (b.day.date || '').localeCompare(a.day.date || ''));

        // Stats
        const completed = entries.filter(e => e.completed);
        document.getElementById('log-total-runs').textContent = `${completed.length} runs`;
        document.getElementById('log-total-miles').textContent =
            `${Math.round(completed.reduce((s, e) => s + (e.actualDistance || 0), 0) * 10) / 10} miles`;

        const totalRunDays = plan.weeks.reduce((s, w) => s + w.days.filter(d => d.distance > 0).length, 0);
        const completionPct = totalRunDays > 0 ? Math.round((completed.length / totalRunDays) * 100) : 0;
        document.getElementById('log-completion').textContent = `${completionPct}% completion`;

        const container = document.getElementById('run-log-list');
        if (entries.length === 0) {
            container.innerHTML = '<p class="empty-state">No runs logged yet. Click on any workout to log it.</p>';
            return;
        }

        container.innerHTML = entries.map(entry => `
            <div class="log-entry ${entry.completed ? 'completed' : 'skipped'}" data-week="${entry.weekNum}" data-day="${entry.day.dayName}">
                <div class="log-entry-header">
                    <span class="log-date">${formatDate(entry.day.date)}</span>
                    <span class="log-workout-name">Wk${entry.weekNum} - ${entry.day.title}</span>
                    ${entry.skipped ? '<span class="log-badge skipped">Skipped</span>' : ''}
                </div>
                ${entry.completed ? `
                    <div class="log-entry-stats">
                        <span>${entry.actualDistance || '--'}mi</span>
                        <span>${entry.duration || '--'}</span>
                        <span>RPE: ${entry.rpe || '--'}</span>
                        ${entry.avgPace ? `<span>${formatSecondsAsPace(entry.avgPace)}/mi</span>` : ''}
                    </div>
                    ${entry.notes ? `<p class="log-notes">${entry.notes}</p>` : ''}
                ` : ''}
            </div>
        `).join('');

        container.querySelectorAll('.log-entry').forEach(el => {
            el.addEventListener('click', () => {
                openWorkoutModal(parseInt(el.dataset.week), el.dataset.day);
            });
        });
    }

    // -------------------------
    // Modal
    // -------------------------

    function openWorkoutModal(weekNum, dayName) {
        const week = plan.weeks.find(w => w.weekNum === weekNum);
        if (!week) return;
        const day = week.days.find(d => d.dayName === dayName);
        if (!day) return;

        selectedWeek = weekNum;
        const key = `${weekNum}-${dayName}`;
        const log = logData[key];

        document.getElementById('modal-title').textContent = `Week ${weekNum} - ${day.title}`;
        document.getElementById('log-week').value = weekNum;
        document.getElementById('log-day').value = dayName;

        // Workout details
        const detailsEl = document.getElementById('modal-workout-details');
        detailsEl.innerHTML = `
            <p class="modal-date">${formatDate(day.date)} &middot; ${day.dayName}</p>
            <p class="modal-desc">${day.description}</p>
            <p class="modal-distance"><strong>Distance:</strong> ${day.distance > 0 ? day.distance + 'mi' : 'Rest day'}</p>
            ${day.paceTarget ? `<p class="modal-pace"><strong>Target Pace:</strong> ${TrainingPlan.formatPaceZone(day.paceTarget)}</p>` : ''}
            ${day.structure ? `
                <div class="modal-structure">
                    <h4>Workout Structure</h4>
                    ${day.structure.map(seg => `
                        <div class="structure-segment">
                            <span class="seg-name">${seg.name}</span>
                            <span class="seg-dist">${seg.distance}mi</span>
                            ${seg.pace ? `<span class="seg-pace">${TrainingPlan.formatPace(seg.pace.low)} - ${TrainingPlan.formatPace(seg.pace.high)}/mi</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        // Pre-fill form
        document.getElementById('log-distance').value = log?.actualDistance || day.distance || '';
        document.getElementById('log-duration').value = log?.duration || '';
        document.getElementById('log-rpe').value = log?.rpe || 5;
        document.getElementById('rpe-display').textContent = log?.rpe || 5;
        document.getElementById('log-notes').value = log?.notes || '';

        // Show/hide export button based on whether workout has structure
        document.getElementById('export-workout-garmin').style.display =
            day.structure && day.distance > 0 ? '' : 'none';

        document.getElementById('workout-modal').classList.add('open');
    }

    function closeModal() {
        document.getElementById('workout-modal').classList.remove('open');
    }

    function saveRunLog() {
        const weekNum = parseInt(document.getElementById('log-week').value);
        const dayName = document.getElementById('log-day').value;
        const key = `${weekNum}-${dayName}`;

        const distance = parseFloat(document.getElementById('log-distance').value) || 0;
        const duration = document.getElementById('log-duration').value;
        const rpe = parseInt(document.getElementById('log-rpe').value);
        const notes = document.getElementById('log-notes').value;

        // Calculate average pace if distance and duration provided
        let avgPace = null;
        if (distance > 0 && duration) {
            const parts = duration.split(':');
            const totalSeconds = parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
            avgPace = totalSeconds / distance;
        }

        // Get target pace for comparison
        const week = plan.weeks.find(w => w.weekNum === weekNum);
        const day = week?.days.find(d => d.dayName === dayName);
        const targetPace = day?.paceTarget ? (day.paceTarget.low + day.paceTarget.high) / 2 : null;

        logData[key] = {
            completed: true,
            skipped: false,
            actualDistance: distance,
            duration,
            rpe,
            notes,
            avgPace,
            targetPace,
            loggedAt: new Date().toISOString(),
        };

        saveState();
        closeModal();
        renderCurrentView();
    }

    function skipWorkout() {
        const weekNum = parseInt(document.getElementById('log-week').value);
        const dayName = document.getElementById('log-day').value;
        const key = `${weekNum}-${dayName}`;

        logData[key] = {
            completed: false,
            skipped: true,
            notes: document.getElementById('log-notes').value,
            loggedAt: new Date().toISOString(),
        };

        saveState();
        closeModal();
        renderCurrentView();
    }

    // -------------------------
    // Settings
    // -------------------------

    function renderSettingsView() {
        if (!profile) return;
        document.getElementById('race-date').value = profile.raceDate || plan?.raceDate || '';
        document.getElementById('half-time').value = profile.halfMarathonMinutes || 112;
        document.getElementById('current-mpw').value = profile.currentMpw || 20;
        document.getElementById('runs-per-week').value = profile.runsPerWeek || 5;
        document.getElementById('goal-type').value = profile.goalType || 'time';
        document.getElementById('target-time').value = formatMinutesAsTime(profile.targetTimeMinutes || 240);
        document.getElementById('unit-system').value = profile.units || 'miles';
        document.getElementById('target-time-group').style.display =
            profile.goalType === 'time' ? '' : 'none';
    }

    function saveSettings() {
        profile.raceDate = document.getElementById('race-date').value;
        profile.halfMarathonMinutes = parseFloat(document.getElementById('half-time').value);
        profile.currentMpw = parseFloat(document.getElementById('current-mpw').value);
        profile.runsPerWeek = parseInt(document.getElementById('runs-per-week').value);
        profile.goalType = document.getElementById('goal-type').value;
        profile.units = document.getElementById('unit-system').value;

        const timeStr = document.getElementById('target-time').value;
        profile.targetTimeMinutes = parseTimeToMinutes(timeStr);

        // Regenerate plan (preserving log data)
        plan = TrainingPlan.generate(profile);
        saveState();

        // Switch to dashboard
        currentView = 'dashboard';
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-view="dashboard"]').classList.add('active');
        renderCurrentView();
    }

    // -------------------------
    // Export
    // -------------------------

    function exportNextRun() {
        const btn = document.getElementById('export-next-garmin');
        const weekNum = parseInt(btn.dataset.week);
        const dayName = btn.dataset.day;
        if (!weekNum || !dayName) return;

        const week = plan.weeks.find(w => w.weekNum === weekNum);
        const day = week?.days.find(d => d.dayName === dayName);
        if (day) GarminExport.downloadWorkoutTCX(day, weekNum);
    }

    function exportCurrentWeek() {
        const today = new Date().toISOString().split('T')[0];
        const week = getCurrentWeek(today);
        if (week) GarminExport.downloadWeekTCX(week);
    }

    function exportModalWorkout() {
        const weekNum = parseInt(document.getElementById('log-week').value);
        const dayName = document.getElementById('log-day').value;
        const week = plan.weeks.find(w => w.weekNum === weekNum);
        const day = week?.days.find(d => d.dayName === dayName);
        if (day) GarminExport.downloadWorkoutTCX(day, weekNum);
    }

    function exportAllData() {
        const data = JSON.stringify({ plan, logData, profile }, null, 2);
        GarminExport.downloadFile(data, 'marathon-training-data.json', 'application/json');
    }

    function importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.plan) plan = data.plan;
                if (data.logData) logData = data.logData;
                if (data.profile) profile = data.profile;
                saveState();
                renderCurrentView();
            } catch (err) {
                alert('Invalid data file.');
            }
        };
        reader.readAsText(file);
    }

    function resetData() {
        if (confirm('This will delete all your training data. Are you sure?')) {
            localStorage.removeItem(STORAGE_KEY);
            logData = {};
            profile = {
                halfMarathonMinutes: 112,
                currentMpw: 20,
                runsPerWeek: 5,
                raceDate: getDefaultRaceDate(),
                goalType: 'time',
                targetTimeMinutes: 240,
                units: 'miles',
            };
            plan = TrainingPlan.generate(profile);
            saveState();
            renderCurrentView();
        }
    }

    // -------------------------
    // Utility
    // -------------------------

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function formatDateShort(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatMinutesAsTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        const s = Math.round((minutes % 1) * 60);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function parseTimeToMinutes(str) {
        const parts = str.split(':');
        if (parts.length === 3) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
        } else if (parts.length === 2) {
            return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        }
        return parseFloat(str) || 240;
    }

    function formatSecondsAsPace(totalSeconds) {
        const min = Math.floor(totalSeconds / 60);
        const sec = Math.round(totalSeconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    return { init };
})();
