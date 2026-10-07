# School Database Design

## Tables

### students
Stores one row per student: `id` (primary key), `name` and `email`. The email is `UNIQUE` so no two students can share one, and both `name` and `email` are `NOT NULL`.

### courses
Stores one row per course: `id` (primary key), `title` (unique) and `credits`. A `CHECK` makes sure credits are above zero.

### enrolments
Records the fact that a student is on a course. It holds `student_id`, `course_id`, the `grade` and the date enrolled. Its primary key is the pair `(student_id, course_id)`, and both columns are foreign keys pointing to `students` and `courses`.

## Relationships

- students to enrolments: one-to-many.One student can have many enrolments, but each enrolment belongs to exactly one student.
- courses to enrolments: one-to-many. One course can have many enrolments, but each enrolment belongs to one course.
- students to courses: many-to-many. A student can take many courses, and a course has many students.

A join table is needed -because a foreign key can only point to one row. Putting `course_id` inside `students` would allow only one course per student, and a list like "1,2,3" in one column breaks the rule that each column holds one value. The `enrolments` table solves this with one row per student-and-course pair. It is also the natural place for the grade, because a grade belongs to the pair and not to the student or the course alone.

## Index

I would add `CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);`. The primary key `(student_id, course_id)` already speeds up searches by student, but queries such as "all students on one course" and "students per course" search by `course_id`. Without an index the database would check every enrolment row. The cost is slightly slower inserts and a little extra storage, which is a good trade for a table that is read often.

## SQL or NoSQL?

I would choose SQL. The data is clearly structured, with students, courses and enrolments, and the relationships between them are central: most questions are about who is on which course. SQL handles that with foreign keys and JOINs. It also enforces rules in the database itself, such as unique emails, no duplicate enrolments and grades between 0 and 100, and it keeps the data consistent when something changes. A document database would suit data whose shape changes a lot or that needs to spread across very many servers, but a school's records do not need that.