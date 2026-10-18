// =============================================================================
// Pure utility functions
// =============================================================================

/**
 * Round a number to a specified precision.
 * @param {number} number - The number to round
 * @param {number} precision - Number of decimal places
 * @returns {number} Rounded number
 */
export const precisionRound = (number, precision) => {
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
};

/**
 * Calculate the difference in days between two dates (inclusive).
 * @param {Date|null} date1 - First date
 * @param {Date|null} date2 - Second date
 * @returns {number|null} Number of days between the dates (inclusive), or null if either date is null
 */
export const datesDayDifference = (date1, date2) => {
  let diffDays = null;

  if (date1 && date2) {
    // Normalize dates to start of day to avoid time component issues
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    const timeDiff = Math.abs(d2.getTime() - d1.getTime());
    // Add 1 to make it inclusive (e.g., Jan 1 to Jan 3 = 3 days, not 2)
    diffDays = Math.floor(timeDiff / (1000 * 3600 * 24)) + 1;
  }

  return diffDays;
};

/**
 * Check if two dates represent the same calendar day.
 * @param {Date} d1 - First date
 * @param {Date} d2 - Second date
 * @returns {boolean} True if both dates are the same day
 */
export const sameDay = (d1, d2) => d1.toDateString() === d2.toDateString();

/**
 * Calculate streak statistics from an array of daily contribution data.
 * @param {Array<{date: Date, count: number}>} days - Array of day objects sorted by date ascending
 * @returns {{
 *   yearTotal: number,
 *   maxCount: number,
 *   bestDay: Date|null,
 *   streakLongest: number,
 *   longestStreakStart: Date|null,
 *   longestStreakEnd: Date|null,
 *   streakCurrent: number,
 *   currentStreakStart: Date|null,
 *   currentStreakEnd: Date|null
 * }}
 */
export const calculateStreaks = (days) => {
  let yearTotal = 0;
  let maxCount = 0;
  let bestDay = null;
  let streakLongest = 0;
  let longestStreakStart = null;
  let longestStreakEnd = null;
  let temporaryStreak = 0;
  let temporaryStreakStart = null;

  for (const d of days) {
    const currentDayCount = d.count;
    yearTotal += currentDayCount;

    // Check for best day
    if (currentDayCount > maxCount) {
      bestDay = d.date;
      maxCount = currentDayCount;
    }

    // Check for longest streak
    if (currentDayCount > 0) {
      if (temporaryStreak === 0) {
        temporaryStreakStart = d.date;
      }

      temporaryStreak++;

      if (temporaryStreak >= streakLongest) {
        longestStreakStart = temporaryStreakStart;
        longestStreakEnd = d.date;
        streakLongest = temporaryStreak;
      }
    } else {
      temporaryStreak = 0;
      temporaryStreakStart = null;
    }
  }

  // Calculate current streak (from most recent day backwards)
  let streakCurrent = 0;
  let currentStreakStart = null;
  let currentStreakEnd = null;
  const reversedDays = [...days].reverse();

  if (reversedDays.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today and yesterday in the data
    const todayEntry = reversedDays.find((d) => sameDay(d.date, today));
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayEntry = reversedDays.find((d) =>
      sameDay(d.date, yesterdayDate),
    );

    let startIndex = -1;

    // Determine where to start counting from
    if (todayEntry && todayEntry.count > 0) {
      // Today has contributions, start from today
      startIndex = reversedDays.indexOf(todayEntry);
    } else if (yesterdayEntry && yesterdayEntry.count > 0) {
      // Today has no contributions (or doesn't exist), but yesterday does
      // Allow 1-day grace period
      startIndex = reversedDays.indexOf(yesterdayEntry);
    } else {
      // No current streak
      return {
        yearTotal,
        maxCount,
        bestDay,
        streakLongest,
        longestStreakStart,
        longestStreakEnd,
        streakCurrent: 0,
        currentStreakStart: null,
        currentStreakEnd: null,
      };
    }

    // Count consecutive days with contributions from the starting point backwards
    for (let i = startIndex; i < reversedDays.length; i++) {
      const currentDayCount = reversedDays[i].count;

      if (currentDayCount > 0) {
        if (streakCurrent === 0) {
          currentStreakEnd = reversedDays[i].date;
        }
        streakCurrent++;
        currentStreakStart = reversedDays[i].date;
      } else {
        // Stop at first day with no contributions
        break;
      }
    }
  }

  return {
    yearTotal,
    maxCount,
    bestDay,
    streakLongest,
    longestStreakStart,
    longestStreakEnd,
    streakCurrent,
    currentStreakStart,
    currentStreakEnd,
  };
};
