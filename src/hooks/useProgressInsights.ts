import { useMemo } from 'react';
import { format, differenceInHours } from 'date-fns';
import { useRecentEntries, useSettings, useStreak } from './useProteinData';
import type { FoodEntry } from '@/types';

export interface ProgressInsights {
  // Today's status
  todayProtein: number;
  todayCalories: number;
  remaining: number;
  percentComplete: number;

  // Time-based insights
  hoursSinceLastMeal: number | null;
  lastMealTime: Date | null;
  lastMealName: string | null;
  mealsToday: number;

  // Streak and consistency
  currentStreak: number;
  longestStreak: number;
  daysTracked: number;
  goalMetDays: number;
  consistencyPercent: number;

  // Patterns
  averageDailyProtein: number;
  averageMealsPerDay: number;
  strongestMealTime: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | null;
  weakestMealTime: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | null;

  // Recent trends
  last7DaysAvg: number;
  last7DaysGoalMet: number;
  trend: 'improving' | 'consistent' | 'declining' | 'new';

  // Motivational context
  isOnTrackToday: boolean;
  isBehindSchedule: boolean;
  hoursUntilSleep: number | null;
  proteinPerHourNeeded: number | null;
}

function getMealTimeCategory(date: Date): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
  return 'snacks';
}

export function useProgressInsights(): ProgressInsights {
  const entries = useRecentEntries(30);
  const { settings } = useSettings();
  const goal = settings.defaultGoal;
  const streak = useStreak(entries, goal);

  return useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    // Today's entries
    const todayEntries = entries.filter(e => e.date === todayStr);
    const todayProtein = todayEntries.reduce((sum, e) => sum + e.protein, 0);
    const todayCalories = todayEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
    const remaining = Math.max(0, goal - todayProtein);
    const percentComplete = Math.min(100, (todayProtein / goal) * 100);

    // Last meal info
    const sortedToday = [...todayEntries].sort((a, b) => {
      const timeA = (a.consumedAt || a.createdAt).getTime();
      const timeB = (b.consumedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    const lastMeal = sortedToday[0];
    const lastMealTime = lastMeal ? (lastMeal.consumedAt || lastMeal.createdAt) : null;
    const lastMealName = lastMeal?.foodName || null;
    const hoursSinceLastMeal = lastMealTime
      ? differenceInHours(now, lastMealTime)
      : null;

    // Group entries by date for historical analysis
    const entriesByDate = new Map<string, FoodEntry[]>();
    for (const entry of entries) {
      const dateEntries = entriesByDate.get(entry.date) || [];
      dateEntries.push(entry);
      entriesByDate.set(entry.date, dateEntries);
    }

    // Calculate daily stats
    const dailyStats: { date: string; protein: number; meals: number; goalMet: boolean }[] = [];
    entriesByDate.forEach((dayEntries, date) => {
      const protein = dayEntries.reduce((sum, e) => sum + e.protein, 0);
      dailyStats.push({
        date,
        protein,
        meals: dayEntries.length,
        goalMet: protein >= goal,
      });
    });

    // Sort by date descending
    dailyStats.sort((a, b) => b.date.localeCompare(a.date));

    const daysTracked = dailyStats.length;
    const goalMetDays = dailyStats.filter(d => d.goalMet).length;
    const consistencyPercent = daysTracked > 0 ? (goalMetDays / daysTracked) * 100 : 0;

    // Averages
    const totalProtein = dailyStats.reduce((sum, d) => sum + d.protein, 0);
    const totalMeals = dailyStats.reduce((sum, d) => sum + d.meals, 0);
    const averageDailyProtein = daysTracked > 0 ? totalProtein / daysTracked : 0;
    const averageMealsPerDay = daysTracked > 0 ? totalMeals / daysTracked : 0;

    // Last 7 days
    const last7Days = dailyStats.slice(0, 7);
    const last7DaysProtein = last7Days.reduce((sum, d) => sum + d.protein, 0);
    const last7DaysAvg = last7Days.length > 0 ? last7DaysProtein / last7Days.length : 0;
    const last7DaysGoalMet = last7Days.filter(d => d.goalMet).length;

    // Trend analysis
    let trend: 'improving' | 'consistent' | 'declining' | 'new' = 'new';
    if (daysTracked >= 7) {
      const recentAvg = last7DaysAvg;
      const previousWeek = dailyStats.slice(7, 14);
      if (previousWeek.length >= 3) {
        const previousAvg = previousWeek.reduce((sum, d) => sum + d.protein, 0) / previousWeek.length;
        const diff = recentAvg - previousAvg;
        if (diff > 10) trend = 'improving';
        else if (diff < -10) trend = 'declining';
        else trend = 'consistent';
      }
    }

    // Meal time patterns
    const mealTimeProtein = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
    const mealTimeCounts = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };

    for (const entry of entries) {
      const time = entry.consumedAt || entry.createdAt;
      const category = getMealTimeCategory(time);
      mealTimeProtein[category] += entry.protein;
      mealTimeCounts[category]++;
    }

    // Find strongest and weakest meal times (by average protein per meal)
    const mealTimeAvgs = Object.entries(mealTimeProtein).map(([time, protein]) => ({
      time: time as 'breakfast' | 'lunch' | 'dinner' | 'snacks',
      avg: mealTimeCounts[time as keyof typeof mealTimeCounts] > 0
        ? protein / mealTimeCounts[time as keyof typeof mealTimeCounts]
        : 0,
      count: mealTimeCounts[time as keyof typeof mealTimeCounts],
    })).filter(m => m.count > 0);

    mealTimeAvgs.sort((a, b) => b.avg - a.avg);
    const strongestMealTime = mealTimeAvgs[0]?.time || null;
    const weakestMealTime = mealTimeAvgs[mealTimeAvgs.length - 1]?.time || null;

    // Time-based calculations
    const sleepTime = settings.dietaryPreferences?.sleepTime;
    let hoursUntilSleep: number | null = null;
    let proteinPerHourNeeded: number | null = null;

    if (sleepTime) {
      const [sleepHour, sleepMinute] = sleepTime.split(':').map(Number);
      const sleepDate = new Date(now);
      sleepDate.setHours(sleepHour, sleepMinute, 0, 0);
      if (sleepDate < now) {
        sleepDate.setDate(sleepDate.getDate() + 1);
      }
      hoursUntilSleep = differenceInHours(sleepDate, now);

      if (hoursUntilSleep > 0 && remaining > 0) {
        proteinPerHourNeeded = remaining / hoursUntilSleep;
      }
    }

    // On track calculation (expected progress based on time of day)
    const dayStartHour = 7; // Assume day starts at 7am
    const dayEndHour = sleepTime ? parseInt(sleepTime.split(':')[0]) : 22;
    const totalWakingHours = dayEndHour > dayStartHour ? dayEndHour - dayStartHour : 24 - dayStartHour + dayEndHour;
    const currentHour = now.getHours();
    const hoursIntoDay = currentHour >= dayStartHour
      ? currentHour - dayStartHour
      : (currentHour + 24 - dayStartHour);
    const expectedProgress = Math.min(100, (hoursIntoDay / totalWakingHours) * 100);

    const isOnTrackToday = percentComplete >= expectedProgress * 0.8; // Within 80% of expected
    const isBehindSchedule = percentComplete < expectedProgress * 0.5; // Less than 50% of expected

    return {
      todayProtein,
      todayCalories,
      remaining,
      percentComplete,
      hoursSinceLastMeal,
      lastMealTime,
      lastMealName,
      mealsToday: todayEntries.length,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      daysTracked,
      goalMetDays,
      consistencyPercent,
      averageDailyProtein,
      averageMealsPerDay,
      strongestMealTime,
      weakestMealTime,
      last7DaysAvg,
      last7DaysGoalMet,
      trend,
      isOnTrackToday,
      isBehindSchedule,
      hoursUntilSleep,
      proteinPerHourNeeded,
    };
  }, [entries, settings, goal, streak]);
}
