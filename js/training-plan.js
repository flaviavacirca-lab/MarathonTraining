/**
 * Marathon Training Plan Generator
 *
 * Generates an 18-week marathon training plan based on runner profile.
 * Supports pace zones, workout types, and progressive overload.
 */

const TrainingPlan = (() => {
    // Workout type definitions
    const WorkoutType = {
        REST: 'rest',
        EASY: 'easy',
        LONG: 'long',
        TEMPO: 'tempo',
        INTERVALS: 'intervals',
        MARATHON_PACE: 'marathon_pace',
        RECOVERY: 'recovery',
        CROSS_TRAIN: 'cross_train',
        RACE: 'race',
        STRIDES: 'strides',
    };

    const PhaseNames = {
        base: 'Base Building',
        build: 'Building',
        peak: 'Peak Training',
        taper: 'Taper',
    };

    /**
     * Calculate pace zones from half marathon time.
     * @param {number} halfMarathonMinutes - Half marathon time in minutes
     * @returns {object} Pace zones in seconds per mile
     */
    function calculatePaceZones(halfMarathonMinutes) {
        const halfPacePerMile = (halfMarathonMinutes * 60) / 13.1;

        // Riegel formula to estimate marathon time
        const marathonMinutes = halfMarathonMinutes * Math.pow(42.195 / 21.0975, 1.06);
        const marathonPacePerMile = (marathonMinutes * 60) / 26.2;

        return {
            recovery: { low: halfPacePerMile * 1.25, high: halfPacePerMile * 1.35, label: 'Recovery' },
            easy: { low: halfPacePerMile * 1.12, high: halfPacePerMile * 1.25, label: 'Easy' },
            longRun: { low: halfPacePerMile * 1.08, high: halfPacePerMile * 1.2, label: 'Long Run' },
            marathon: { low: marathonPacePerMile * 0.98, high: marathonPacePerMile * 1.02, label: 'Marathon Pace' },
            tempo: { low: halfPacePerMile * 0.95, high: halfPacePerMile * 1.02, label: 'Tempo' },
            interval: { low: halfPacePerMile * 0.88, high: halfPacePerMile * 0.93, label: 'Interval (5K)' },
            sprint: { low: halfPacePerMile * 0.75, high: halfPacePerMile * 0.82, label: 'Strides' },
            estimatedMarathon: marathonMinutes,
            halfPacePerMile,
            marathonPacePerMile,
        };
    }

    /**
     * Format seconds per mile to mm:ss string.
     */
    function formatPace(secondsPerMile) {
        const min = Math.floor(secondsPerMile / 60);
        const sec = Math.round(secondsPerMile % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    /**
     * Format a pace zone to a readable string.
     */
    function formatPaceZone(zone) {
        return `${formatPace(zone.low)} - ${formatPace(zone.high)}/mi`;
    }

    /**
     * Get the phase for a given week number (1-indexed).
     */
    function getPhase(weekNum, totalWeeks) {
        if (totalWeeks <= 0) return 'base';
        const ratio = weekNum / totalWeeks;
        if (ratio <= 4 / 18) return 'base';
        if (ratio <= 10 / 18) return 'build';
        if (ratio <= 15 / 18) return 'peak';
        return 'taper';
    }

    /**
     * Generate an 18-week training plan.
     * @param {object} profile - Runner profile
     * @returns {object} Complete training plan
     */
    function generate(profile) {
        const {
            halfMarathonMinutes = 112,
            currentMpw = 20,
            runsPerWeek = 5,
            raceDate = null,
            goalType = 'time',
            targetTimeMinutes = 240,
            units = 'miles',
        } = profile;

        const totalWeeks = 18;
        const paceZones = calculatePaceZones(halfMarathonMinutes);

        // Calculate start date from race date
        let startDate;
        if (raceDate) {
            startDate = new Date(raceDate);
            startDate.setDate(startDate.getDate() - (totalWeeks * 7) + 1);
        } else {
            startDate = new Date();
            // Start next Monday
            const dayOfWeek = startDate.getDay();
            const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
            startDate.setDate(startDate.getDate() + daysUntilMonday);
        }

        // If goal type is time and target is set, adjust marathon pace
        let targetMarathonPace = paceZones.marathonPacePerMile;
        if (goalType === 'time' && targetTimeMinutes) {
            targetMarathonPace = (targetTimeMinutes * 60) / 26.2;
            paceZones.marathon.low = targetMarathonPace * 0.98;
            paceZones.marathon.high = targetMarathonPace * 1.02;
        }

        // Weekly mileage progression
        const mileageProgression = buildMileageProgression(currentMpw, totalWeeks);

        // Generate each week
        const weeks = [];
        for (let w = 1; w <= totalWeeks; w++) {
            const phase = getPhase(w, totalWeeks);
            const weekStart = new Date(startDate);
            weekStart.setDate(weekStart.getDate() + (w - 1) * 7);
            const targetMiles = mileageProgression[w - 1];

            const week = {
                weekNum: w,
                phase,
                phaseName: PhaseNames[phase],
                startDate: weekStart.toISOString().split('T')[0],
                targetMiles: Math.round(targetMiles * 10) / 10,
                days: generateWeekDays(w, phase, targetMiles, paceZones, runsPerWeek, weekStart, totalWeeks),
            };
            weeks.push(week);
        }

        return {
            profile: { ...profile, halfMarathonMinutes, currentMpw, runsPerWeek },
            paceZones,
            totalWeeks,
            startDate: startDate.toISOString().split('T')[0],
            raceDate: raceDate || calculateRaceDate(startDate, totalWeeks),
            weeks,
            estimatedMarathonTime: paceZones.estimatedMarathon,
        };
    }

    function calculateRaceDate(startDate, totalWeeks) {
        const race = new Date(startDate);
        race.setDate(race.getDate() + totalWeeks * 7 - 1);
        return race.toISOString().split('T')[0];
    }

    /**
     * Build weekly mileage progression across 18 weeks.
     */
    function buildMileageProgression(currentMpw, totalWeeks) {
        const progression = [];
        const baseMpw = Math.max(currentMpw, 15);
        const peakMpw = Math.min(baseMpw * 2.2, 50); // Cap peak at 50 for first marathon

        for (let w = 1; w <= totalWeeks; w++) {
            const phase = getPhase(w, totalWeeks);
            let miles;

            switch (phase) {
                case 'base':
                    // Gradual increase from current, with recovery every 3rd week
                    miles = baseMpw + (w - 1) * 1.5;
                    if (w % 3 === 0) miles *= 0.85; // Recovery week
                    break;

                case 'build': {
                    const buildWeek = w - 4;
                    const buildProgress = buildWeek / 6;
                    miles = baseMpw + 6 + buildProgress * (peakMpw - baseMpw - 6) * 0.7;
                    if (buildWeek % 3 === 0) miles *= 0.85; // Recovery week
                    break;
                }

                case 'peak': {
                    const peakWeek = w - 10;
                    if (peakWeek <= 3) {
                        miles = peakMpw * (0.9 + peakWeek * 0.033);
                        if (peakWeek === 3) miles *= 0.85; // Recovery before taper
                    } else {
                        miles = peakMpw * 0.9;
                    }
                    break;
                }

                case 'taper': {
                    const taperWeek = w - 15;
                    miles = peakMpw * (0.7 - taperWeek * 0.15);
                    break;
                }
            }

            progression.push(Math.round(miles * 10) / 10);
        }

        return progression;
    }

    /**
     * Generate daily workouts for a single week.
     */
    function generateWeekDays(weekNum, phase, targetMiles, paceZones, runsPerWeek, weekStart, totalWeeks) {
        const days = [];
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        // Determine long run distance (typically 30-35% of weekly miles)
        let longRunRatio;
        switch (phase) {
            case 'base': longRunRatio = 0.32; break;
            case 'build': longRunRatio = 0.35; break;
            case 'peak': longRunRatio = 0.38; break;
            case 'taper': longRunRatio = 0.35; break;
        }

        const longRunDist = Math.round(targetMiles * longRunRatio * 10) / 10;
        // Cap long run: first marathon shouldn't exceed 22 miles
        const cappedLongRun = Math.min(longRunDist, weekNum === totalWeeks ? 3 : 22);

        // Race week special handling
        if (weekNum === totalWeeks) {
            return generateRaceWeek(paceZones, weekStart, dayNames);
        }

        // Remaining miles after long run
        const remainingMiles = targetMiles - cappedLongRun;

        // Define workout schedule based on runs per week
        const schedule = getWeeklySchedule(runsPerWeek, phase, weekNum);

        // Calculate distances for each run type
        const runDays = schedule.filter(s => s.type !== WorkoutType.REST && s.type !== WorkoutType.CROSS_TRAIN);
        const qualityDays = runDays.filter(s => s.type === WorkoutType.TEMPO || s.type === WorkoutType.INTERVALS || s.type === WorkoutType.MARATHON_PACE);
        const easyDays = runDays.filter(s => s.type === WorkoutType.EASY || s.type === WorkoutType.RECOVERY || s.type === WorkoutType.STRIDES);

        // Distribute remaining miles
        const qualityMiles = qualityDays.length > 0 ? remainingMiles * 0.35 / qualityDays.length : 0;
        const easyMiles = easyDays.length > 0 ? (remainingMiles - qualityMiles * qualityDays.length) / easyDays.length : 0;

        for (let d = 0; d < 7; d++) {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + d);
            const sched = schedule[d];

            const day = {
                dayName: dayNames[d],
                date: date.toISOString().split('T')[0],
                type: sched.type,
                ...buildWorkoutDetails(sched, cappedLongRun, qualityMiles, easyMiles, paceZones, phase, weekNum),
            };
            days.push(day);
        }

        return days;
    }

    /**
     * Get the schedule template for a given week.
     */
    function getWeeklySchedule(runsPerWeek, phase, weekNum) {
        // 5-day schedule (most common for first marathon)
        // Mon: Rest, Tue: Easy, Wed: Quality, Thu: Easy, Fri: Rest, Sat: Long, Sun: Recovery
        const base5 = [
            { type: WorkoutType.REST },
            { type: WorkoutType.EASY },
            { type: WorkoutType.TEMPO },
            { type: WorkoutType.EASY },
            { type: WorkoutType.REST },
            { type: WorkoutType.LONG },
            { type: WorkoutType.RECOVERY },
        ];

        const base4 = [
            { type: WorkoutType.REST },
            { type: WorkoutType.EASY },
            { type: WorkoutType.TEMPO },
            { type: WorkoutType.REST },
            { type: WorkoutType.EASY },
            { type: WorkoutType.LONG },
            { type: WorkoutType.REST },
        ];

        const base6 = [
            { type: WorkoutType.REST },
            { type: WorkoutType.EASY },
            { type: WorkoutType.TEMPO },
            { type: WorkoutType.EASY },
            { type: WorkoutType.EASY },
            { type: WorkoutType.LONG },
            { type: WorkoutType.RECOVERY },
        ];

        let schedule;
        if (runsPerWeek <= 4) schedule = [...base4];
        else if (runsPerWeek >= 6) schedule = [...base6];
        else schedule = [...base5];

        // Vary quality workouts by phase and week
        if (phase === 'build' || phase === 'peak') {
            // Alternate between tempo and intervals
            if (weekNum % 2 === 0) {
                const qualityIdx = schedule.findIndex(s => s.type === WorkoutType.TEMPO);
                if (qualityIdx >= 0) schedule[qualityIdx].type = WorkoutType.INTERVALS;
            }
            // Add marathon pace work in build/peak
            if (phase === 'peak' || (phase === 'build' && weekNum > 6)) {
                const easyDays = schedule.map((s, i) => ({ ...s, idx: i })).filter(s => s.type === WorkoutType.EASY);
                if (easyDays.length > 1) {
                    schedule[easyDays[0].idx].type = WorkoutType.MARATHON_PACE;
                }
            }
        }

        // Add strides to easy runs in base phase
        if (phase === 'base' && weekNum >= 2) {
            const easyDays = schedule.map((s, i) => ({ ...s, idx: i })).filter(s => s.type === WorkoutType.EASY);
            if (easyDays.length > 0) {
                schedule[easyDays[easyDays.length - 1].idx].type = WorkoutType.STRIDES;
            }
        }

        return schedule;
    }

    /**
     * Build detailed workout information for a day.
     */
    function buildWorkoutDetails(sched, longRunDist, qualityMiles, easyMiles, paceZones, phase, weekNum) {
        const type = sched.type;

        switch (type) {
            case WorkoutType.REST:
                return {
                    title: 'Rest Day',
                    description: 'Complete rest or light stretching/yoga.',
                    distance: 0,
                    paceTarget: null,
                    structure: null,
                };

            case WorkoutType.EASY:
                return {
                    title: 'Easy Run',
                    description: 'Comfortable, conversational pace. You should be able to hold a conversation throughout.',
                    distance: Math.round(easyMiles * 10) / 10,
                    paceTarget: paceZones.easy,
                    structure: [
                        { name: 'Easy Run', distance: Math.round(easyMiles * 10) / 10, pace: paceZones.easy },
                    ],
                };

            case WorkoutType.RECOVERY:
                return {
                    title: 'Recovery Run',
                    description: 'Very easy effort. Focus on loosening up legs after the long run.',
                    distance: Math.round(Math.min(easyMiles, 3.5) * 10) / 10,
                    paceTarget: paceZones.recovery,
                    structure: [
                        { name: 'Recovery Run', distance: Math.round(Math.min(easyMiles, 3.5) * 10) / 10, pace: paceZones.recovery },
                    ],
                };

            case WorkoutType.STRIDES: {
                const dist = Math.round(easyMiles * 10) / 10;
                return {
                    title: 'Easy Run + Strides',
                    description: `Easy run with 4-6 x 20-second strides at the end. Strides are relaxed, fast running with full recovery between.`,
                    distance: dist,
                    paceTarget: paceZones.easy,
                    structure: [
                        { name: 'Easy Run', distance: Math.round((dist - 0.5) * 10) / 10, pace: paceZones.easy },
                        { name: '4-6 x 20s Strides', distance: 0.5, pace: paceZones.sprint, isInterval: true },
                    ],
                };
            }

            case WorkoutType.LONG:
                return {
                    title: 'Long Run',
                    description: longRunDist >= 16
                        ? 'Your key endurance builder. Start easy, focus on even effort. Practice race nutrition.'
                        : 'Build endurance at a comfortable pace. No need to push — just cover the distance.',
                    distance: longRunDist,
                    paceTarget: paceZones.longRun,
                    structure: buildLongRunStructure(longRunDist, paceZones, phase, weekNum),
                };

            case WorkoutType.TEMPO: {
                const totalDist = Math.round(Math.max(qualityMiles, 4) * 10) / 10;
                const warmup = 1;
                const cooldown = 1;
                const tempoDist = Math.round((totalDist - warmup - cooldown) * 10) / 10;
                return {
                    title: 'Tempo Run',
                    description: 'Comfortably hard effort. You should be able to say short sentences but not hold a full conversation.',
                    distance: totalDist,
                    paceTarget: paceZones.tempo,
                    structure: [
                        { name: 'Warmup', distance: warmup, pace: paceZones.easy },
                        { name: 'Tempo', distance: Math.max(tempoDist, 1), pace: paceZones.tempo },
                        { name: 'Cooldown', distance: cooldown, pace: paceZones.easy },
                    ],
                };
            }

            case WorkoutType.INTERVALS: {
                const totalDist = Math.round(Math.max(qualityMiles, 5) * 10) / 10;
                const warmup = 1.5;
                const cooldown = 1.5;
                const intervalDist = totalDist - warmup - cooldown;
                const numIntervals = phase === 'peak' ? 6 : (phase === 'build' ? 5 : 4);
                const intervalLen = Math.round((intervalDist / numIntervals) * 10) / 10;
                return {
                    title: 'Interval Workout',
                    description: `Hard but controlled repeats with recovery jogs. Focus on consistent pacing across all intervals.`,
                    distance: totalDist,
                    paceTarget: paceZones.interval,
                    structure: [
                        { name: 'Warmup', distance: warmup, pace: paceZones.easy },
                        { name: `${numIntervals} x ${intervalLen}mi`, distance: intervalDist, pace: paceZones.interval, isInterval: true, reps: numIntervals, repDistance: intervalLen, recoveryDistance: 0.25 },
                        { name: 'Cooldown', distance: cooldown, pace: paceZones.easy },
                    ],
                };
            }

            case WorkoutType.MARATHON_PACE: {
                const totalDist = Math.round(Math.max(qualityMiles, 5) * 10) / 10;
                const warmup = 1;
                const cooldown = 1;
                const mpDist = Math.round((totalDist - warmup - cooldown) * 10) / 10;
                return {
                    title: 'Marathon Pace Run',
                    description: 'Practice running at your target marathon pace. This should feel controlled and sustainable.',
                    distance: totalDist,
                    paceTarget: paceZones.marathon,
                    structure: [
                        { name: 'Warmup', distance: warmup, pace: paceZones.easy },
                        { name: 'Marathon Pace', distance: Math.max(mpDist, 2), pace: paceZones.marathon },
                        { name: 'Cooldown', distance: cooldown, pace: paceZones.easy },
                    ],
                };
            }

            case WorkoutType.CROSS_TRAIN:
                return {
                    title: 'Cross Training',
                    description: 'Low-impact activity: cycling, swimming, elliptical, or yoga. 30-45 minutes.',
                    distance: 0,
                    paceTarget: null,
                    structure: null,
                };

            default:
                return {
                    title: 'Rest Day',
                    description: 'Rest.',
                    distance: 0,
                    paceTarget: null,
                    structure: null,
                };
        }
    }

    /**
     * Build long run structure - some long runs include marathon pace segments.
     */
    function buildLongRunStructure(distance, paceZones, phase, weekNum) {
        // In peak phase, add marathon pace miles into the long run
        if ((phase === 'peak' || (phase === 'build' && weekNum >= 8)) && distance >= 14) {
            const mpMiles = Math.min(Math.round(distance * 0.3), 8);
            const easyBefore = Math.round((distance - mpMiles) * 0.6 * 10) / 10;
            const easyAfter = Math.round((distance - mpMiles - easyBefore) * 10) / 10;
            return [
                { name: 'Easy', distance: easyBefore, pace: paceZones.longRun },
                { name: 'Marathon Pace', distance: mpMiles, pace: paceZones.marathon },
                { name: 'Easy Finish', distance: easyAfter, pace: paceZones.longRun },
            ];
        }

        return [
            { name: 'Long Run', distance, pace: paceZones.longRun },
        ];
    }

    /**
     * Generate race week schedule.
     */
    function generateRaceWeek(paceZones, weekStart, dayNames) {
        const schedule = [
            { type: WorkoutType.REST, title: 'Rest Day', description: 'Rest and prepare mentally.', distance: 0 },
            { type: WorkoutType.EASY, title: 'Shakeout Run', description: 'Very short, easy run. Loosen the legs.', distance: 3 },
            { type: WorkoutType.EASY, title: 'Easy + Strides', description: 'Short easy run with 4 strides to keep legs sharp.', distance: 2.5 },
            { type: WorkoutType.REST, title: 'Rest Day', description: 'Rest. Lay out your race gear. Hydrate well.', distance: 0 },
            { type: WorkoutType.EASY, title: 'Shakeout', description: '15-minute shakeout jog. Stay loose.', distance: 1.5 },
            { type: WorkoutType.REST, title: 'Rest / Travel', description: 'Rest day before race. Light walking only. Eat carbs, hydrate, sleep well.', distance: 0 },
            { type: WorkoutType.RACE, title: 'RACE DAY!', description: 'You are ready. Trust your training. Start conservative — negative split if possible.', distance: 26.2 },
        ];

        return schedule.map((s, d) => {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + d);
            return {
                dayName: dayNames[d],
                date: date.toISOString().split('T')[0],
                type: s.type,
                title: s.title,
                description: s.description,
                distance: s.distance,
                paceTarget: s.type === WorkoutType.RACE ? paceZones.marathon : (s.distance > 0 ? paceZones.easy : null),
                structure: s.type === WorkoutType.RACE
                    ? [
                        { name: 'Start Conservative', distance: 8, pace: { low: paceZones.marathon.low * 1.02, high: paceZones.marathon.high * 1.05 } },
                        { name: 'Settle In', distance: 10, pace: paceZones.marathon },
                        { name: 'Push Home', distance: 8.2, pace: { low: paceZones.marathon.low * 0.97, high: paceZones.marathon.high } },
                    ]
                    : (s.distance > 0 ? [{ name: s.title, distance: s.distance, pace: paceZones.easy }] : null),
            };
        });
    }

    // Public API
    return {
        generate,
        calculatePaceZones,
        formatPace,
        formatPaceZone,
        getPhase,
        WorkoutType,
        PhaseNames,
    };
})();
