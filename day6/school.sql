-- School database: students, courses and enrolments
PRAGMA foreign_keys = ON;

-- Start clean so the script can be re-run (children first)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- 1. Tables ----------
CREATE TABLE students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 3 CHECK (credits > 0)
);

-- Join table: one row = one student on one course
CREATE TABLE enrolments (
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       INTEGER CHECK (grade BETWEEN 0 AND 100), -- empty until marked
  enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, course_id), -- same student cannot join the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);

-- ---------- 2. Sample data ----------
INSERT INTO students (name, email) VALUES
  ('Amina Otieno',  'amina@example.com'),
  ('Brian Kamau',   'brian@example.com'),
  ('Grace Wanjiku', 'grace@example.com'),
  ('Daniel Mwangi', 'daniel@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations', 4),
  ('Databases',       3),
  ('Mathematics',     3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 72),
  (2, 3, NULL),
  (3, 1, 90),
  (3, 2, NULL);

-- ---------- 3. Queries ----------

-- Q1: All courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Amina Otieno';

-- Q2: All students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.title = 'Web Foundations'
ORDER BY students.name;

-- Q3: Number of students per course (LEFT JOIN keeps empty courses)
SELECT courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id
ORDER BY student_count DESC;

-- Q4: Students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- Q5: Update one enrolment's grade (Brian, Mathematics)
UPDATE enrolments
SET grade = 88
WHERE student_id = 2 AND course_id = 3;

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id  = enrolments.course_id
WHERE enrolments.student_id = 2 AND enrolments.course_id = 3;