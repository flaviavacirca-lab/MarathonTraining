/**
 * Adaptive Training System
 *
 * Adjusts the training plan based on logged run data (RPE, completion, pace).
 * Tracks fitness trend and provides recommendations.
 */

const Adaptations = (() => {
    /**
     * Analyze logged data and return adaptation recommendations.
     * @param {object} plan - The current training plan
     * @param {object} logData - All logged run data keyed by "week-day"
     * @returns {object} Adaptation recommendations
     */
    function analyze(plan, logData) {
        const entries = Object.values(logData).filter(e => e && (e.completed || e.skipped));
        if (entries.length < 3) {
            return {
                fitnessScore: 50,
                trend: 'neutral',
                adjustments: [],
                summary: 'Log more runs to get adaptive recommendations.',
            };
        }

        // Calculate rolling averages
        const recent = entries.slice(-7);
        const older = entries.slice(-14, -7);

        const recentRPE = avgField(recent, 'rpe');
        const olderRPE = avgField(older, 'rpe');
        const recentCompletion = completionRate(recent);
        const overallCompletion = completionRate(entries);
        const skippedRecent = recent.filter(e => e.skipped).length;

        // Fitness score: 0-100
        let fitnessScore = 50;
        fitnessScore += (overallCompletion - 0.5) * 40; // +/- 20 for completion
        fitnessScore -= (recentRPE - 5) * 5;            // Penalize high RPE
        fitnessScore = Math.max(10, Math.min(95, fitnessScore));

        // Determine trend
        let trend = 'neutral';
        if (recentRPE < olderRPE - 0.5 && recentCompletion > 0.8) trend = 'improving';
        else if (recentRPE > olderRPE + 1 || recentCompletion < 0.6) trend = 'declining';
        else if (recentRPE > 7.5) trend = 'overreaching';

        // Generate adjustments
        const adjustments = [];

        if (trend === 'overreaching' || recentRPE > 8) {
            adjustments.push({
                type: 'reduce_intensity',
                severity: 'high',
                message: 'Your recent RPE is very high. Consider reducing intensity by 10-15% this week.',
                factor: 0.85,
            });
        } else if (trend === 'declining') {
            adjustments.push({
                type: 'reduce_volume',
                severity: 'medium',
                message: 'Training seems to be getting harder. Consider an extra rest day or reducing distances by 10%.',
                factor: 0.9,
            });
        }

        if (skippedRecent >= 3) {
            adjustments.push({
                type: 'missed_runs',
                severity: 'high',
                message: `You've skipped ${skippedRecent} of your last ${recent.length} runs. Consider adjusting your schedule or reducing weekly runs.`,
                factor: 0.85,
            });
        }

        if (trend === 'improving' && recentRPE < 4 && recentCompletion > 0.9) {
            adjustments.push({
                type: 'increase_slightly',
                severity: 'low',
                message: 'You\'re handling the training well! If you feel good, you could add 5-10% more distance to easy runs.',
                factor: 1.05,
            });
        }

        // Check for pace improvements
        const paceEntries = entries.filter(e => e.avgPace && e.targetPace);
        if (paceEntries.length >= 3) {
            const recentPace = paceEntries.slice(-3);
            const fasterThanTarget = recentPace.filter(e => e.avgPace < e.targetPace * 0.95).length;
            if (fasterThanTarget >= 2) {
                adjustments.push({
                    type: 'pace_info',
                    severity: 'low',
                    message: 'You\'re consistently running faster than target pace. Make sure easy runs are truly easy — save the speed for quality days.',
                });
            }
        }

        const summary = buildSummary(fitnessScore, trend, adjustments, overallCompletion, entries.length);

        return {
            fitnessScore: Math.round(fitnessScore),
            trend,
            adjustments,
            summary,
            stats: {
                totalRuns: entries.filter(e => e.completed).length,
                totalSkipped: entries.filter(e => e.skipped).length,
                avgRPE: Math.round(recentRPE * 10) / 10,
                completionRate: Math.round(overallCompletion * 100),
            },
        };
    }

    /**
     * Apply adaptations to a week's plan.
     * @param {object} week - The week object from the plan
     * @param {Array} adjustments - Active adjustments
     * @returns {object} Adjusted week
     */
    function applyToWeek(week, adjustments) {
        if (!adjustments || adjustments.length === 0) return week;

        const adjusted = JSON.parse(JSON.stringify(week)); // Deep clone

        for (const adj of adjustments) {
            if (adj.factor && adj.factor !== 1) {
                for (const day of adjusted.days) {
                    if (day.distance > 0 && day.type !== 'race') {
                        day.distance = Math.round(day.distance * adj.factor * 10) / 10;
                        if (day.structure) {
                            for (const seg of day.structure) {
                                seg.distance = Math.round(seg.distance * adj.factor * 10) / 10;
                            }
                        }
                    }
                }
                adjusted.targetMiles = Math.round(adjusted.targetMiles * adj.factor * 10) / 10;
            }
        }

        return adjusted;
    }

    function avgField(entries, field) {
        const valid = entries.filter(e => e[field] != null && e.completed);
        if (valid.length === 0) return 5;
        return valid.reduce((sum, e) => sum + e[field], 0) / valid.length;
    }

    function completionRate(entries) {
        if (entries.length === 0) return 1;
        return entries.filter(e => e.completed).length / entries.length;
    }

    function buildSummary(score, trend, adjustments, completion, totalEntries) {
        const parts = [];

        if (totalEntries < 5) {
            return 'Keep logging your runs to get personalized training insights.';
        }

        if (trend === 'improving') {
            parts.push('Your fitness is trending upward. Nice consistent work.');
        } else if (trend === 'overreaching') {
            parts.push('Warning: Signs of overreaching detected. Prioritize recovery.');
        } else if (trend === 'declining') {
            parts.push('Recent runs have been tougher. Consider backing off slightly.');
        } else {
            parts.push('Training is on track.');
        }

        parts.push(`Completion rate: ${Math.round(completion * 100)}%.`);

        if (adjustments.length > 0) {
            parts.push(`${adjustments.length} adjustment${adjustments.length > 1 ? 's' : ''} suggested.`);
        }

        return parts.join(' ');
    }

    return {
        analyze,
        applyToWeek,
    };
})();
