import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function countRows(
  table: typeof schema.bookmarks | typeof schema.notes,
  userId: number,
  lessonId: number
) {
  return db
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.lessonId, lessonId)))
    .all().length;
}

describe("bookmarking a lesson", () => {
  it("adds a Bookmark, then removes it on the next toggle", () => {
    const student = base.user.id;
    const lesson = lessonIds[0];

    expect(isBookmarked(db, student, lesson)).toBe(false);
    expect(toggleBookmark(db, student, lesson, NOW)).toBe(true);
    expect(isBookmarked(db, student, lesson)).toBe(true);
    expect(toggleBookmark(db, student, lesson, NOW)).toBe(false);
    expect(isBookmarked(db, student, lesson)).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one lesson", () => {
    const student = base.user.id;
    const lesson = lessonIds[0];

    toggleBookmark(db, student, lesson, NOW);
    expect(() =>
      db.insert(schema.bookmarks).values({ userId: student, lessonId: lesson }).run()
    ).toThrow();
    expect(countRows(schema.bookmarks, student, lesson)).toBe(1);
  });
});

describe("saving a note", () => {
  it("creates the Note with the body trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  Rewatch 6:40  ", NOW);

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Rewatch 6:40",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    const later = minutesAfter(30);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", later);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: later.toISOString(),
    });
    expect(countRows(schema.notes, base.user.id, lessonIds[0])).toBe(1);
  });

  it("keeps the created time on a re-save", () => {
    saveNote(db, base.user.id, lessonIds[0], "First", NOW);
    const second = saveNote(db, base.user.id, lessonIds[0], "Second", minutesAfter(5));

    expect(second).toMatchObject({
      ok: true,
      note: { createdAt: NOW.toISOString() },
    });
  });

  it("accepts a Note of exactly the maximum length", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);
    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note one character over the maximum, and stores nothing", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      NOW
    );

    expect(result).toEqual({
      ok: false,
      error: "A note must be 2,000 characters or fewer.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("keeps the Note body exactly as typed, Markdown characters included", () => {
    const body = "# not a heading\n*not emphasis*";
    saveNote(db, base.user.id, lessonIds[0], body, NOW);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });
});

describe("the Saved lists", () => {
  it("hold only the Student's own rows, newest first, with Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], minutesAfter(10));
    toggleBookmark(db, other.id, lessonIds[2], minutesAfter(20));

    saveNote(db, base.user.id, lessonIds[0], "older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "newer", minutesAfter(10));
    saveNote(db, other.id, lessonIds[2], "not mine", minutesAfter(20));

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: lessonIds[1],
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId: lessonIds[0] }),
    ]);

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        body: "newer",
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
      }),
      expect.objectContaining({ body: "older" }),
    ]);
  });

  it("orders Notes by last edited, not by when they were first written", () => {
    saveNote(db, base.user.id, lessonIds[0], "written first", NOW);
    saveNote(db, base.user.id, lessonIds[1], "written second", minutesAfter(10));
    saveNote(db, base.user.id, lessonIds[0], "edited last", minutesAfter(20));

    expect(listNotes(db, base.user.id).map((note) => note.body)).toEqual([
      "edited last",
      "written second",
    ]);
  });
});

describe("an approved Refund", () => {
  it("leaves the Student's Bookmarks and Notes in place", async () => {
    const notifications = fakeNotifications();
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      NOW,
      notifications
    );
    expect(approved.ok).toBe(true);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});
