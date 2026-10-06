# Library API Design

A REST API for a library's **books** resource. The resource name is a plural noun (`/books`), and the HTTP method says the action.

A book looks like this:

```json
{
  "id": 7,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "available": true
}
```

## Endpoints

### 1. List all books
- **Method and path:** `GET /books`
- **Description:** Returns an array of all books.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method and path:** `GET /books/{id}` (for example `GET /books/7`)
- **Description:** Returns the single book with that id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method and path:** `POST /books`
- **Description:** Adds a new book. The server assigns the id.
- **Example request body:**
```json
  { "title": "Things Fall Apart", "author": "Chinua Achebe", "year": 1958 }
```
- **Success status:** `201 Created`

### 4. Replace a book
- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces the whole book with the new version.
- **Example request body:**
```json
  { "title": "Things Fall Apart", "author": "Chinua Achebe", "year": 1958, "available": true }
```
- **Success status:** `200 OK`

### 5. Update part of a book
- **Method and path:** `PATCH /books/{id}`
- **Description:** Changes only the fields that are sent.
- **Example request body:**
```json
  { "available": false }
```
- **Success status:** `200 OK`

### 6. Delete a book
- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes the book.
- **Request body:** none
- **Success status:** `204 No Content`

### 7. List books by an author
- **Method and path:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books whose author matches the query parameter.
- **Request body:** none
- **Success status:** `200 OK` (an empty array `[]` if the author has no books)

## Error codes

### 400 Bad Request
- The request is invalid.
- **Example:** `POST /books` with a missing title, such as `{ "author": "Chinua Achebe" }`, or a `year` that is not a number.

### 404 Not Found
- The book or the URL does not exist.
- **Example:** `GET /books/9999` when no book has the id 9999, or `DELETE /books/9999`.