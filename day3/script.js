let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// Returns notes whose text contains the word (any case)
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// Returns the note with the most characters, or null if there are none
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// Returns an object like { personal: 2, study: 2, work: 1 }
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}
// Returns "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  const personal = counts.personal || 0;
  const work = counts.work || 0;
  const study = counts.study || 0;
  return `${total} ${word}: ${personal} personal, ${work} work, ${study} study.`;
}

// Lowercase, trim, and collapse repeated spaces
function normalise(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isDuplicate(text) {
  const cleaned = normalise(text);
  return notes.some((note) => normalise(note.text) === cleaned);
}

const validCategories = ["personal", "work", "study"];

function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`Rejected: "${cleaned}" already exists.`);
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log(`Rejected: "${category}" is not personal, work or study.`);
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: newId, text: cleaned, category: category });
  console.log(`Added: "${cleaned}" (${category})`);
  return true;
}
// --- Tests ---
console.log(searchNotes("MILK"));    // [ {id: 1, text: "Buy milk and bread", ...} ]
console.log(searchNotes("zebra"));   // []

console.log(longestNote());          // { id: 3, text: "Email the project report to Grace", ... }
const backup = notes;
notes = [];
console.log(longestNote());          // null
notes = backup;

console.log(countByCategory());      // { personal: 2, study: 2, work: 1 }

console.log(getSummary());           // "5 notes: 2 personal, 1 work, 2 study."

console.log(isDuplicate("  call MUM ")); // true
console.log(isDuplicate("Walk the dog")); // false

console.log(addNote("Walk the dog", "personal")); // true
console.log(addNote("call mum", "personal"));     // false (duplicate)
console.log(addNote("Gym", "fitness"));           // false (bad category)
console.log(addNote("   ", "work"));              // false (empty)
console.log(addNote("a".repeat(201), "work"));    // false (too long)
console.log(getSummary());           // "6 notes: 3 personal, 1 work, 2 study."