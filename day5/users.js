const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const list = document.querySelector("#users-list");

// Every loaded user is kept here, so filtering needs no new request
let users = [];

// ---------- Drawing ----------
function addLine(parent, label, value) {
  const p = document.createElement("p");
  p.textContent = `${label}: ${value}`;
  parent.appendChild(p);
}

function renderUsers(usersToShow) {
  list.replaceChildren();

  if (usersToShow.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    list.appendChild(li);
    return;
  }

  usersToShow.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("h3");
    name.textContent = user.name;
    li.appendChild(name);

    addLine(li, "Email", user.email);
    addLine(li, "City", user.address.city);
    addLine(li, "Company", user.company.name);

    list.appendChild(li);
  });
}

// ---------- Filtering (no new request) ----------
function getFilteredUsers() {
  const query = filterInput.value.trim().toLowerCase();
  return users.filter((user) => user.name.toLowerCase().includes(query));
}

// ---------- Loading ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  list.replaceChildren();

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    renderUsers(getFilteredUsers());
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    users = [];
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadBtn.disabled = false; // runs whether it worked or failed
  }
}

// ---------- Listeners ----------
loadBtn.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  if (users.length === 0) return; // nothing loaded yet
  renderUsers(getFilteredUsers());
});