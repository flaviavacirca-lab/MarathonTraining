/**
 * Garmin Connect Export Module
 *
 * Generates TCX workout files compatible with Garmin Connect import.
 * Supports the Garmin Forerunner 55 structured workout format.
 * Also generates ICS calendar files.
 */

const GarminExport = (() => {
    const TCX_NAMESPACE = 'http://www.garmin.com/xmlschemas/TrainingCenter/v2';
    const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

    /**
     * Convert pace (seconds/mile) to meters/second for TCX format.
     */
    function paceToMetersPerSecond(secondsPerMile) {
        return 1609.344 / secondsPerMile;
    }

    /**
     * Convert miles to meters.
     */
    function milesToMeters(miles) {
        return miles * 1609.344;
    }

    /**
     * Generate a TCX workout file for a single workout.
     * @param {object} workout - The workout day object
     * @param {number} weekNum - Week number
     * @returns {string} TCX XML string
     */
    function generateWorkoutTCX(workout, weekNum) {
        if (!workout.structure || workout.distance === 0) return null;

        const workoutName = `Wk${weekNum} ${workout.dayName} - ${workout.title}`;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
    xmlns="${TCX_NAMESPACE}"
    xmlns:xsi="${XSI_NAMESPACE}"
    xsi:schemaLocation="${TCX_NAMESPACE} http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Workouts>
    <Workout Sport="Running">
      <Name>${escapeXml(workoutName)}</Name>
`;

        let stepId = 1;

        for (const segment of workout.structure) {
            if (segment.isInterval && segment.reps) {
                // Repeat block for intervals
                xml += `      <Step xsi:type="Repeat_t">
        <StepId>${stepId++}</StepId>
        <Repetitions>${segment.reps}</Repetitions>
`;
                // Work interval
                xml += buildStep(stepId++, 'Work', segment.repDistance, segment.pace, 'Active');
                // Recovery jog
                const recoveryDist = segment.recoveryDistance || 0.25;
                xml += buildStep(stepId++, 'Recovery', recoveryDist, null, 'Rest');

                xml += `      </Step>
`;
            } else if (segment.isInterval) {
                // Strides - simple step with higher pace
                xml += buildStep(stepId++, segment.name, segment.distance, segment.pace, 'Active');
            } else {
                // Regular step
                const intensity = segment.name.toLowerCase().includes('cooldown') ||
                    segment.name.toLowerCase().includes('recovery') ? 'Rest' : 'Active';
                xml += buildStep(stepId++, segment.name, segment.distance, segment.pace, intensity);
            }
        }

        xml += `    </Workout>
  </Workouts>
</TrainingCenterDatabase>`;

        return xml;
    }

    /**
     * Build a single TCX step element.
     */
    function buildStep(stepId, name, distanceMiles, pace, intensity) {
        const meters = Math.round(milesToMeters(distanceMiles));
        let xml = `      <Step xsi:type="Step_t">
        <StepId>${stepId}</StepId>
        <Name>${escapeXml(name)}</Name>
        <Duration xsi:type="Distance_t">
          <Meters>${meters}</Meters>
        </Duration>
        <Intensity>${intensity}</Intensity>
`;

        if (pace && pace.low && pace.high) {
            const speedHigh = paceToMetersPerSecond(pace.low);  // Faster pace = higher speed
            const speedLow = paceToMetersPerSecond(pace.high);  // Slower pace = lower speed
            xml += `        <Target xsi:type="Speed_t">
          <SpeedZone xsi:type="CustomSpeedZone_t">
            <LowInMetersPerSecond>${speedLow.toFixed(4)}</LowInMetersPerSecond>
            <HighInMetersPerSecond>${speedHigh.toFixed(4)}</HighInMetersPerSecond>
          </SpeedZone>
        </Target>
`;
        } else {
            xml += `        <Target xsi:type="None_t"/>
`;
        }

        xml += `      </Step>
`;
        return xml;
    }

    /**
     * Generate TCX files for all workouts in a week.
     * Returns a zip-friendly array of {filename, content}.
     */
    function generateWeekTCX(week) {
        const files = [];
        for (const day of week.days) {
            if (day.distance > 0 && day.structure) {
                const tcx = generateWorkoutTCX(day, week.weekNum);
                if (tcx) {
                    const filename = `Week${week.weekNum}_${day.dayName}_${day.title.replace(/[^a-zA-Z0-9]/g, '_')}.tcx`;
                    files.push({ filename, content: tcx });
                }
            }
        }
        return files;
    }

    /**
     * Generate an ICS calendar file for the entire training plan.
     * @param {object} plan - The complete training plan
     * @returns {string} ICS file content
     */
    function generateICS(plan) {
        let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Marathon Training Plan//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Marathon Training Plan
X-WR-TIMEZONE:America/New_York
`;

        for (const week of plan.weeks) {
            for (const day of week.days) {
                if (day.distance === 0 && day.type === 'rest') continue;

                const dateStr = day.date.replace(/-/g, '');
                const uid = `wk${week.weekNum}-${day.dayName.toLowerCase()}@marathon-plan`;
                const summary = `${day.title} (${day.distance > 0 ? day.distance + 'mi' : 'Rest'})`;

                let description = `Week ${week.weekNum} - ${week.phaseName}\\n`;
                description += day.description.replace(/\n/g, '\\n');
                if (day.paceTarget) {
                    description += `\\nTarget Pace: ${TrainingPlan.formatPaceZone(day.paceTarget)}`;
                }
                if (day.structure) {
                    description += '\\n\\nWorkout Structure:';
                    for (const seg of day.structure) {
                        description += `\\n- ${seg.name}: ${seg.distance}mi`;
                        if (seg.pace) {
                            description += ` @ ${TrainingPlan.formatPaceZone(seg)}`;
                        }
                    }
                }

                ics += `BEGIN:VEVENT
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${dateStr}
SUMMARY:${escapeICS(summary)}
DESCRIPTION:${escapeICS(description)}
UID:${uid}
STATUS:CONFIRMED
CATEGORIES:Marathon Training
END:VEVENT
`;
            }
        }

        ics += 'END:VCALENDAR';
        return ics;
    }

    /**
     * Download a single file.
     */
    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download a TCX workout file.
     */
    function downloadWorkoutTCX(workout, weekNum) {
        const tcx = generateWorkoutTCX(workout, weekNum);
        if (!tcx) return false;
        const filename = `Week${weekNum}_${workout.dayName}_${workout.title.replace(/[^a-zA-Z0-9]/g, '_')}.tcx`;
        downloadFile(tcx, filename, 'application/vnd.garmin.tcx+xml');
        return true;
    }

    /**
     * Download all workouts for a week as individual TCX files.
     * Since we can't create ZIP in vanilla JS easily, download them individually.
     */
    function downloadWeekTCX(week) {
        const files = generateWeekTCX(week);
        if (files.length === 0) return false;

        // Download each with a small delay to prevent browser blocking
        files.forEach((file, i) => {
            setTimeout(() => {
                downloadFile(file.content, file.filename, 'application/vnd.garmin.tcx+xml');
            }, i * 300);
        });
        return true;
    }

    /**
     * Download the full calendar as ICS.
     */
    function downloadICS(plan) {
        const ics = generateICS(plan);
        downloadFile(ics, 'marathon-training-plan.ics', 'text/calendar');
        return true;
    }

    function escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function escapeICS(str) {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,');
    }

    return {
        generateWorkoutTCX,
        generateWeekTCX,
        generateICS,
        downloadWorkoutTCX,
        downloadWeekTCX,
        downloadICS,
        downloadFile,
    };
})();
