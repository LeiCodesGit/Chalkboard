export function calculateTwsLoadsFromCourses(courses = []) {
  const totalUnits = courses.reduce((sum, course) => {
    return sum + Number(course.units || 0);
  }, 0);

  const teachingHours = totalUnits;
  const totalHours = teachingHours;
  const academicUnits = totalUnits;

  return {
    totalUnits,
    academicUnits,
    teachingHours,
    totalHours,
    totals: {
      totalUnits,
      totalHours,
      equivLoad: totalUnits,
    },
  };
}